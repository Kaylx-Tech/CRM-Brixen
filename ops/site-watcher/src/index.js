// Site watcher: a Cloudflare Worker that runs every 2 minutes from outside the server.
// - opens every site and checks it answers with the right page
// - keeps the R2 bucket private (removes any custom domain / r2.dev URL that gets attached)
// - puts back the finstap.com DNS records if they go missing
// - expects a heartbeat from the server watchdog every few minutes (no heartbeat = server or watchdog down)
// Alerts go to Telegram: once when a problem starts, hourly while it lasts, once when it is fixed.
// It never deletes DNS records, buckets or files.

const FAILS_BEFORE_ALERT = 2;          // 2 runs in a row (~4 min), so one slow answer does not page anyone
const REMIND_EVERY_MS = 60 * 60 * 1000;
const HEARTBEAT_MAX_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15000;
const SLOW_MS = 10000;

const SITES = [
  { name: 'finstap.com', url: 'https://finstap.com/', expect: 'Finstap' },
  { name: 'www.finstap.com', url: 'https://www.finstap.com/', expect: 'Finstap' },
  { name: 'Workspace subdomain', url: 'https://acme.finstap.com/', expect: 'Finstap' },
  { name: 'Finstap API', url: 'https://api.finstap.com/api/health', expect: '"status":"ok"' },
  { name: 'Brixen admin', url: 'https://admin.brixenconsultants.com/', expect: 'Brixen' },
  { name: 'Brixen API', url: 'https://api.brixenconsultants.com/api/health', expect: '"status":"ok"' },
  { name: 'Brixen portal', url: 'https://portal.brixenconsultants.com/', expect: 'Brixen' },
];

// finstap.com records that must always exist (restored if missing, never changed if they point elsewhere)
function dnsRecords(env) {
  return [
    { name: 'finstap.com', type: 'A', content: env.SERVER_IP, proxied: true },
    { name: '*.finstap.com', type: 'A', content: env.SERVER_IP, proxied: true },
    { name: 'api.finstap.com', type: 'A', content: env.SERVER_IP, proxied: true },
    { name: 'www.finstap.com', type: 'CNAME', content: 'finstap.com', proxied: true },
  ];
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === env.DAILY_CRON) await dailySummary(env);
    else await runChecks(env);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response('ok');
    if (!env.HEARTBEAT_KEY || request.headers.get('Authorization') !== `Bearer ${env.HEARTBEAT_KEY}`) {
      return new Response('unauthorized', { status: 401 });
    }
    if (url.pathname === '/heartbeat' && request.method === 'POST') {
      const info = await request.json().catch(() => ({}));
      await env.STATE.put('heartbeat', JSON.stringify({ ts: Date.now(), info }));
      return new Response('ok');
    }
    if (url.pathname === '/status') {
      return Response.json({ state: await loadState(env), heartbeat: await env.STATE.get('heartbeat', 'json') });
    }
    if (url.pathname === '/test') {
      await telegram(env, ['✅ Site watcher test message. Alerts will arrive here.']);
      return new Response('sent');
    }
    if (url.pathname === '/run') {
      return Response.json(await runChecks(env));
    }
    return new Response('not found', { status: 404 });
  },
};

export async function runChecks(env) {
  const now = Date.now();
  const state = await loadState(env);
  const before = JSON.stringify(state);
  const msgs = [];

  // 1. Fixes first: removing an R2 custom domain also removes its DNS record, so R2 runs before DNS
  if (env.CF_API_TOKEN) {
    await guard(state, msgs, now, 'fix:r2', 'Could not check the R2 bucket settings', () => keepR2Private(env, msgs));
    if (env.CF_ZONE_ID) {
      await guard(state, msgs, now, 'fix:dns', 'Could not check the finstap.com DNS records', () => restoreDns(env, msgs));
    }
  }

  // 2. Sites
  const results = await Promise.all(SITES.map((s) => checkSite(s)));
  SITES.forEach((site, i) => track(state, msgs, now, `site:${site.name}`, site.name, results[i]));

  // 3. Server watchdog heartbeat (only once the watchdog has reported at least once)
  const hb = await env.STATE.get('heartbeat', 'json');
  if (hb) {
    const age = now - hb.ts;
    track(state, msgs, now, 'heartbeat', 'Server watchdog', age <= HEARTBEAT_MAX_MS
      ? { ok: true }
      : { ok: false, why: `no heartbeat for ${Math.round(age / 60000)} min (server down, or the watchdog stopped)` });
  }

  if (msgs.length) await telegram(env, msgs);
  if (JSON.stringify(state) !== before) await env.STATE.put('state', JSON.stringify(state));  // KV free plan: 1000 writes/day
  return { results: SITES.map((s, i) => ({ name: s.name, ...results[i] })), messages: msgs };
}

async function checkSite(site) {
  const started = Date.now();
  try {
    const res = await fetch(site.url, {
      headers: { 'User-Agent': 'site-watcher', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    const ms = Date.now() - started;
    if (res.status !== 200) return { ok: false, why: `HTTP ${res.status}${body.includes('Object not found') ? ' (R2 bucket page, not the app)' : ''}` };
    if (site.expect && !body.includes(site.expect)) return { ok: false, why: `opened, but it is not the right page ("${site.expect}" missing)` };
    if (ms > SLOW_MS) return { ok: false, why: `very slow (${(ms / 1000).toFixed(1)} s)` };
    return { ok: true, ms };
  } catch (err) {
    return { ok: false, why: err.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS / 1000} s` : `cannot connect (${err.message})` };
  }
}

// up/down bookkeeping for one thing being watched
function track(state, msgs, now, key, label, result) {
  const s = state[key] || { fails: 0 };
  if (result.ok) {
    if (s.down) msgs.push(`✅ ${label} is working again (was down ${ago(now - s.since)}).`);
    if (s.fails || s.down) state[key] = { fails: 0 };
    return;
  }
  const next = { ...s, fails: s.fails + 1, since: s.since || now, why: result.why };
  if (!s.down && next.fails >= FAILS_BEFORE_ALERT) {
    msgs.push(`🔴 ${label}: ${result.why}`);
    next.down = true;
    next.lastAlert = now;
  } else if (s.down && now - (s.lastAlert || 0) >= REMIND_EVERY_MS) {
    msgs.push(`🔴 Still down ${ago(now - next.since)}: ${label}: ${result.why}`);
    next.lastAlert = now;
  }
  state[key] = next;
}

async function guard(state, msgs, now, key, label, fn) {
  try {
    await fn();
    track(state, msgs, now, key, label, { ok: true });
  } catch (err) {
    track(state, msgs, now, key, label, { ok: false, why: err.message });
  }
}

async function keepR2Private(env, msgs) {
  const buckets = (env.R2_PRIVATE_BUCKETS || '').split(',').map((b) => b.trim()).filter(Boolean);
  for (const bucket of buckets) {
    const base = `/accounts/${env.CF_ACCOUNT_ID}/r2/buckets/${bucket}/domains`;
    const custom = await cf(env, 'GET', `${base}/custom`);
    for (const d of custom?.domains || []) {
      await cf(env, 'DELETE', `${base}/custom/${encodeURIComponent(d.domain)}`);
      msgs.push(`🔧 Removed public domain ${d.domain} from private R2 bucket "${bucket}" (files must not be public).`);
    }
    const managed = await cf(env, 'GET', `${base}/managed`);
    if (managed?.enabled) {
      await cf(env, 'PUT', `${base}/managed`, { enabled: false });
      msgs.push(`🔧 Turned off the public r2.dev URL of private R2 bucket "${bucket}".`);
    }
  }
}

async function restoreDns(env, msgs) {
  for (const want of dnsRecords(env)) {
    const found = await cf(env, 'GET', `/zones/${env.CF_ZONE_ID}/dns_records?name=${encodeURIComponent(want.name)}&per_page=50`);
    const routing = (found || []).filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type));
    if (!routing.length) {
      await cf(env, 'POST', `/zones/${env.CF_ZONE_ID}/dns_records`, {
        ...want, ttl: 1, comment: 'Restored by site-watcher',
      });
      msgs.push(`🔧 DNS record ${want.name} (${want.type} → ${want.content}) was missing. Added it back.`);
    }
  }
}

async function cf(env, method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const errors = (data.errors || []).map((e) => e.message).join('; ');
    throw new Error(`Cloudflare API ${method} ${path.split('?')[0]}: HTTP ${res.status}${errors ? ` ${errors}` : ''}`);
  }
  return data.result;
}

async function dailySummary(env) {
  const results = await Promise.all(SITES.map((s) => checkSite(s)));
  const down = SITES.filter((_, i) => !results[i].ok).map((s) => s.name);
  const hb = await env.STATE.get('heartbeat', 'json');
  const lines = [down.length ? `🟠 Daily check: ${down.length} of ${SITES.length} sites have a problem: ${down.join(', ')}`
    : `🟢 Daily check: all ${SITES.length} sites are working.`];
  if (hb) {
    const info = hb.info || {};
    lines.push(`Server: last heartbeat ${ago(Date.now() - hb.ts)} ago` +
      (info.disk != null ? `, disk ${info.disk}%` : '') + (info.mem_free_mb != null ? `, free memory ${info.mem_free_mb} MB` : '') + '.');
  } else {
    lines.push('Server watchdog has not reported yet.');
  }
  await telegram(env, lines);
}

async function telegram(env, lines) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.log('[telegram not set]', lines.join('\n'));
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: lines.join('\n\n'), disable_web_page_preview: true }),
  });
  if (!res.ok) console.log('[telegram failed]', res.status, await res.text());
}

async function loadState(env) {
  return (await env.STATE.get('state', 'json')) || {};
}

function ago(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}
