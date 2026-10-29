# Datadog monitoring (Brixen + Finstap APIs)

What you get: request traces (slow endpoints, SQL timings, outgoing API calls), 500 errors,
container logs, uptime checks, and email alerts.

The code side is already done (`backend/utils/monitoring.py`). Tracing turns on only when
`DD_AGENT_HOST` is set, so local dev and any server without it run exactly as before.

What is never sent: query strings, request bodies, headers, client IPs, exception messages.
Ids in URLs show as `?` (e.g. `GET /api/clients/?`). Health checks are not traced.

## 1. Datadog account

1. Sign in at Datadog, note your **site** (US1 `datadoghq.com`, EU `datadoghq.eu`, US5 `us5.datadoghq.com`, ...).
2. Organization Settings > API Keys > create one key, e.g. `coolify-vps`. Keep it only in Coolify.

## 2. Datadog Agent on the VPS (one per server)

In Coolify: **+ New Resource > Docker Compose (empty)** on the same server, paste this, then set the
two env vars `DD_API_KEY` and `DD_SITE` in that resource's Environment Variables and deploy.

```yaml
services:
  datadog-agent:
    image: gcr.io/datadoghq/agent:7
    container_name: datadog-agent
    restart: unless-stopped
    environment:
      - DD_API_KEY=${DD_API_KEY}
      - DD_SITE=${DD_SITE}
      - DD_HOSTNAME=coolify-vps
      - DD_APM_ENABLED=true
      - DD_APM_NON_LOCAL_TRAFFIC=true
      - DD_LOGS_ENABLED=true
      - DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL=true
      - DD_CONTAINER_EXCLUDE_LOGS=name:datadog-agent
      - DD_PROCESS_AGENT_ENABLED=true
      # Hide emails, bearer tokens and password/token/code values before logs leave the server
      - 'DD_LOGS_CONFIG_PROCESSING_RULES=[{"type":"mask_sequences","name":"emails","replace_placeholder":"[email]","pattern":"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"},{"type":"mask_sequences","name":"bearer","replace_placeholder":"Bearer [hidden]","pattern":"(?i)bearer\\s+[A-Za-z0-9._~+/=-]+"},{"type":"mask_sequences","name":"secrets","replace_placeholder":"[hidden]","pattern":"(?i)(password|passwd|token|secret|api_key|apikey|code)[=:]\\s*\\S+"}]'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc/:/host/proc/:ro
      - /sys/fs/cgroup/:/host/sys/fs/cgroup:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    networks:
      - coolify
networks:
  coolify:
    external: true
```

Do not publish port 8126 to the internet; the APIs reach the agent over the `coolify` Docker network.
If Coolify renames the container, use the name it shows as `DD_AGENT_HOST` below.

## 3. Env vars on each API app in Coolify (then Redeploy)

| Variable | Brixen API | Finstap API |
|---|---|---|
| `DD_AGENT_HOST` | `datadog-agent` | `datadog-agent` |
| `DD_SERVICE` | `brixen-api` | `finstap-api` |
| `DD_ENV` | `production` | `production` |
| `DD_VERSION` (optional) | e.g. `2026-10-29` | same |

The API key is **not** needed on the apps, only on the agent. To turn tracing off again: set
`DD_TRACE_ENABLED=false` (or remove `DD_AGENT_HOST`) and redeploy.

## 4. Uptime (Synthetics)

Synthetic Monitoring > New Test > API test > HTTP, every 5 minutes, 2+ locations, alert after 2 failures:

- `https://api.brixenconsultants.com/api/health` (expect 200 and body contains `"status":"ok"`)
- `https://api.finstap.com/api/health`
- Optionally the frontends (admin/portal/app) the same way.

Notify: `@your-email@example.com` in the message.

## 5. Alert monitors (Monitors > New Monitor)

| Monitor | Type | Query / condition |
|---|---|---|
| API errors | APM | `service:brixen-api env:production` error rate > 5% over 5 min (repeat for `finstap-api`) |
| Slow API | APM | p95 latency of `wsgi.request` > 2 s over 10 min |
| Server errors in logs | Logs | `"[API Server Error]"` count > 0 over 5 min |
| Container down | Integration > Docker | container for the API not running |
| Disk almost full | Metric | `system.disk.in_use` > 0.85 on `host:coolify-vps` |

Put `@your-email@example.com` in each monitor's message.

## 6. Check that data arrives

- Infrastructure > Hosts: `coolify-vps` appears within a few minutes.
- APM > Services: `brixen-api` / `finstap-api` appear after the first real requests.
- Logs: filter `service:` or `container_name:` for the API containers.
- If nothing shows: in the agent container's terminal run `agent status` (look at APM and Logs sections),
  and check the API log for `[Monitoring] Datadog tracing on`.
