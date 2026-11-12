"""Partner Perks rewards: applied accounts, the reward in the workspace's balance, and the monthly payout.

  * A workspace presses Apply on a Finstap perk: the partner's link opens and the team says who the account
    is for (client, company, email). That is an applied account, "Pending check" (perk_applications).
  * Partners send us no data, so the Finstap owner checks the partner's own dashboard and marks the
    account Eligible (the workspace's reward for that perk goes into its balance: a wallet entry 'reward',
    once per account) or Not eligible (with a reason).
  * On the 5th of every month: due services are paid from the balance first (wallet.settle), then what is
    left of the rewards becomes a payout for that month ("Due"). Finstap pays it to the workspace and marks it
    Paid (a wallet entry 'payout'). Money the workspace topped up itself is never paid out.
Nothing here deletes data.
"""
import re
import threading
import time
from datetime import date

from tenancy import _platform_execute, _platform_query
from services import partner_perks, wallet

PAYOUT_DAY = 5
STATUSES = ('Pending check', 'Eligible', 'Not eligible')


class RewardError(ValueError):
    """Shown to the person as it is."""


def _ensure():
    _platform_execute("""
        CREATE TABLE IF NOT EXISTS perk_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_slug TEXT NOT NULL,
            perk_id INTEGER NOT NULL,
            partner TEXT,
            perk_title TEXT,
            client_name TEXT NOT NULL,
            company_name TEXT,
            client_email TEXT,
            applied_by_name TEXT,
            applied_by_email TEXT,
            status TEXT NOT NULL DEFAULT 'Pending check',
            reward_amount REAL,
            reason TEXT,
            decided_by TEXT,
            decided_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    _platform_execute("CREATE INDEX IF NOT EXISTS idx_perk_applications_tenant ON perk_applications(tenant_slug);")
    _platform_execute("""
        CREATE TABLE IF NOT EXISTS reward_payouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_slug TEXT NOT NULL,
            period TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'Due',
            paid_amount REAL,
            paid_by TEXT,
            paid_at TIMESTAMP,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (tenant_slug, period)
        );
    """)


def _clean_text(value, limit):
    return re.sub(r'\s+', ' ', str(value or '')).strip()[:limit]


# ---------------------------------------------------------------- workspace side

def apply(slug, user, perk_id, body):
    """The workspace applied through a Finstap perk for a client. Returns the new application."""
    _ensure()
    match = re.fullmatch(r'(?:fp-)?(\d+)', str(perk_id or ''))
    perk = partner_perks.get(match.group(1)) if match else None
    if not perk:
        raise RewardError("This partner perk is not available any more")
    body = body if isinstance(body, dict) else {}
    client = _clean_text(body.get('client_name'), 120)
    company = _clean_text(body.get('company_name'), 160)
    email = _clean_text(body.get('client_email'), 160)
    if not client:
        raise RewardError("Enter the client's name")
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise RewardError("Enter a valid email, or leave it empty")
    _platform_execute("""
        INSERT INTO perk_applications (tenant_slug, perk_id, partner, perk_title, client_name, company_name,
            client_email, applied_by_name, applied_by_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (slug, perk['id'], perk['category'], perk['title'], client, company or None, email or None,
          (user or {}).get('full_name'), (user or {}).get('email')))
    row = _platform_query("SELECT * FROM perk_applications WHERE tenant_slug = ? ORDER BY id DESC LIMIT 1;",
                          (slug,), one=True)
    return row


def applications(slug=None, status=None, search=''):
    _ensure()
    clauses, params = [], []
    if slug:
        clauses.append("a.tenant_slug = ?")
        params.append(slug)
    if status in STATUSES:
        clauses.append("a.status = ?")
        params.append(status)
    q = _clean_text(search, 80).lower()
    if q:
        clauses.append("(LOWER(a.client_name) LIKE ? OR LOWER(COALESCE(a.company_name, '')) LIKE ? OR "
                       "LOWER(COALESCE(a.client_email, '')) LIKE ? OR LOWER(COALESCE(a.partner, '')) LIKE ? OR "
                       "LOWER(COALESCE(a.applied_by_name, '')) LIKE ? OR LOWER(a.tenant_slug) LIKE ? OR "
                       "LOWER(COALESCE(t.name, '')) LIKE ?)")
        params += [f"%{q}%"] * 7
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ''
    return _platform_query(f"""
        SELECT a.*, t.name AS workspace_name FROM perk_applications a
        LEFT JOIN tenants t ON t.slug = a.tenant_slug
        {where}
        ORDER BY a.created_at DESC, a.id DESC LIMIT 1000;""", tuple(params)) or []


def workspace_summary(slug):
    """Rewards earned and paid out, accounts waiting for a check, and the next payout day."""
    _ensure()
    earned = _platform_query("SELECT COALESCE(SUM(amount), 0) AS s FROM wallet_entries "
                             "WHERE tenant_slug = ? AND kind = 'reward';", (slug,), one=True) or {}
    paid = _platform_query("SELECT COALESCE(SUM(-amount), 0) AS s FROM wallet_entries "
                           "WHERE tenant_slug = ? AND kind = 'payout';", (slug,), one=True) or {}
    pending = _platform_query("SELECT COUNT(*) AS c FROM perk_applications "
                              "WHERE tenant_slug = ? AND status = 'Pending check';", (slug,), one=True) or {}
    due = _platform_query("SELECT COALESCE(SUM(amount), 0) AS s FROM reward_payouts "
                          "WHERE tenant_slug = ? AND status = 'Due';", (slug,), one=True) or {}
    return {
        'earned': round(float(earned.get('s') or 0), 2),
        'paid_out': round(float(paid.get('s') or 0), 2),
        'payout_due': round(float(due.get('s') or 0), 2),
        'pending_checks': int(pending.get('c') or 0),
        'next_payout': next_payout_day().isoformat(),
    }


def next_payout_day(today=None):
    today = today or date.today()
    if today.day < PAYOUT_DAY:
        return today.replace(day=PAYOUT_DAY)
    year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    return date(year, month, PAYOUT_DAY)


# ---------------------------------------------------------------- owner side

def decide(app_id, admin, eligible, amount=None, reason=''):
    """Mark an applied account Eligible (the reward goes into the workspace's balance) or Not eligible."""
    _ensure()
    app = _platform_query("SELECT * FROM perk_applications WHERE id = ?;", (int(app_id),), one=True)
    if not app:
        raise RewardError("Application not found")
    if app['status'] == 'Eligible':
        raise RewardError("This account is already eligible and its reward is in the balance")
    who = (admin or {}).get('email') or 'Finstap'
    if not eligible:
        reason = _clean_text(reason, 300)
        if not reason:
            raise RewardError("Say why it is not eligible")
        _platform_execute("""UPDATE perk_applications SET status = 'Not eligible', reason = ?, decided_by = ?,
                             decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?;""",
                          (reason, who, app['id']))
        return _platform_query("SELECT * FROM perk_applications WHERE id = ?;", (app['id'],), one=True)

    perk = partner_perks.get(app['perk_id']) or {'id': app['perk_id'], 'reward_amount': None}
    value = partner_perks.money(amount, "Reward") if amount not in (None, '') \
        else partner_perks.reward_for(perk, app['tenant_slug'])
    if not value:
        raise RewardError("This perk has no reward for this workspace. Enter the reward amount.")
    try:
        _platform_execute("""
            INSERT INTO wallet_entries (tenant_slug, amount, kind, ref, note, created_by)
            VALUES (?, ?, 'reward', ?, ?, ?);
        """, (app['tenant_slug'], value, f"reward:{app['id']}",
              f"Partner Perks reward: {app['partner']} for {app['client_name']}"[:300], who))
    except Exception as exc:
        if 'unique' not in str(exc).lower():
            raise
    _platform_execute("""UPDATE perk_applications SET status = 'Eligible', reward_amount = ?, reason = NULL,
                         decided_by = ?, decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?;""",
                      (value, who, app['id']))
    wallet.settle(app['tenant_slug'])  # the reward pays any due service first
    return _platform_query("SELECT * FROM perk_applications WHERE id = ?;", (app['id'],), one=True)


def pounds(amount):
    """£75, £12.50 (no .00), as the app shows money."""
    value = round(float(amount or 0), 2)
    return f"£{value:,.0f}" if value == int(value) else f"£{value:,.2f}"


def _unpaid_rewards(slug, cutoff):
    """Rewards earned before the cutoff (the payout day) that are not paid out or in a Due payout yet."""
    earned = _platform_query("SELECT COALESCE(SUM(amount), 0) AS s FROM wallet_entries WHERE tenant_slug = ? "
                             "AND kind = 'reward' AND created_at < ?;", (slug, cutoff.isoformat()), one=True) or {}
    s = workspace_summary(slug)
    return round(float(earned.get('s') or 0) - s['paid_out'] - s['payout_due'], 2)


def prepare_payouts(today=None):
    """From the 5th of the month: pay due services from each workspace's balance, then make that month's
    payout of the rewards earned before the 5th that are left (never more than the balance). Rewards from the
    5th on wait for next month's payout. Once per workspace and month."""
    _ensure()
    today = today or date.today()
    if today.day < PAYOUT_DAY:
        return []
    period = today.strftime('%Y-%m')
    cutoff = today.replace(day=PAYOUT_DAY)
    made = []
    slugs = {r['tenant_slug'] for r in (_platform_query(
        "SELECT DISTINCT tenant_slug FROM wallet_entries WHERE kind = 'reward';") or [])}
    for slug in sorted(slugs):
        if _platform_query("SELECT id FROM reward_payouts WHERE tenant_slug = ? AND period = ?;",
                           (slug, period), one=True):
            continue
        try:
            wallet.settle(slug)
        except Exception as exc:
            print(f"[Rewards] {slug}: settle skipped: {exc}")
        due_before = _platform_query("SELECT COALESCE(SUM(amount), 0) AS s FROM reward_payouts "
                                     "WHERE tenant_slug = ? AND status = 'Due';", (slug,), one=True) or {}
        amount = min(_unpaid_rewards(slug, cutoff), round(wallet.balance(slug) - float(due_before.get('s') or 0), 2))
        if amount < 0.01:
            continue
        try:
            _platform_execute("INSERT INTO reward_payouts (tenant_slug, period, amount) VALUES (?, ?, ?);",
                              (slug, period, amount))
            made.append({'slug': slug, 'period': period, 'amount': amount})
        except Exception as exc:
            if 'unique' not in str(exc).lower():
                raise
    return made


def payouts(status=None):
    _ensure()
    prepare_payouts()
    clauses, params = [], []
    if status in ('Due', 'Paid'):
        clauses.append("p.status = ?")
        params.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ''
    rows = _platform_query(f"""
        SELECT p.*, t.name AS workspace_name FROM reward_payouts p
        LEFT JOIN tenants t ON t.slug = p.tenant_slug
        {where}
        ORDER BY CASE p.status WHEN 'Due' THEN 0 ELSE 1 END, p.period DESC, p.id DESC LIMIT 500;""",
                           tuple(params)) or []
    for r in rows:
        r['balance'] = wallet.balance(r['tenant_slug'])
    return rows


def mark_paid(payout_id, admin, note=''):
    """Finstap paid the workspace: the payout leaves its balance (never more than the balance holds)."""
    _ensure()
    p = _platform_query("SELECT * FROM reward_payouts WHERE id = ?;", (int(payout_id),), one=True)
    if not p:
        raise RewardError("Payout not found")
    if p['status'] == 'Paid':
        raise RewardError("This payout is already marked paid")
    amount = round(min(float(p['amount']), wallet.balance(p['tenant_slug'])), 2)
    if amount < 0.01:
        raise RewardError("The workspace's balance has nothing left to pay out")
    who = (admin or {}).get('email') or 'Finstap'
    try:
        _platform_execute("""
            INSERT INTO wallet_entries (tenant_slug, amount, kind, ref, note, created_by)
            VALUES (?, ?, 'payout', ?, ?, ?);
        """, (p['tenant_slug'], -amount, f"payout:{p['id']}", f"Partner Perks rewards paid out ({p['period']})", who))
    except Exception as exc:
        if 'unique' not in str(exc).lower():
            raise
    _platform_execute("""UPDATE reward_payouts SET status = 'Paid', paid_amount = ?, paid_by = ?, paid_at = datetime('now'),
                         note = ? WHERE id = ?;""", (amount, who, _clean_text(note, 300) or None, p['id']))
    return _platform_query("SELECT * FROM reward_payouts WHERE id = ?;", (p['id'],), one=True)


def start_payout_worker():
    """Checks every 6 hours whether this month's payouts are made (from the 5th)."""
    def _loop():
        while True:
            try:
                made = prepare_payouts()
                if made:
                    print(f"[Rewards] {len(made)} payout(s) due for {made[0]['period']}")
            except Exception as exc:
                print(f"[Rewards] payout check skipped: {exc}")
            time.sleep(6 * 3600)
    threading.Thread(target=_loop, name='reward-payouts', daemon=True).start()
