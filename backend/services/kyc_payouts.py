"""What Finstap owes the KYC team: each member has a rate per check (set by the owner on the KYC page), and every
check they decide (Approved or Declined) is charged once at that rate. The owner marks a member's checks paid."""
from tenancy import _platform_execute, _platform_query


def _ensure():
    _platform_execute("""
        CREATE TABLE IF NOT EXISTS kyc_payouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_slug TEXT NOT NULL,
            check_id INTEGER NOT NULL,
            reviewer_id INTEGER NOT NULL,
            reviewer_name TEXT,
            amount REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'due',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paid_at TIMESTAMP,
            UNIQUE (tenant_slug, check_id)
        );
    """)
    cols = {c['name'] for c in (_platform_query("PRAGMA table_info(platform_admins);") or [])}
    if 'rate_per_check' not in cols:
        _platform_execute("ALTER TABLE platform_admins ADD COLUMN rate_per_check REAL;")


def record(slug, check_id, reviewer, status):
    """A KYC team member decided a check: charge it once at their rate (nothing for the owner's own decisions)."""
    if (reviewer or {}).get('role') != 'kyc' or status not in ('Approved', 'Declined'):
        return
    _ensure()
    member = _platform_query("SELECT id, full_name, email, rate_per_check FROM platform_admins WHERE id = ?;",
                             (reviewer['id'],), one=True) or {}
    rate = float(member.get('rate_per_check') or 0)
    if rate <= 0:
        return
    _platform_execute("""
        INSERT OR IGNORE INTO kyc_payouts (tenant_slug, check_id, reviewer_id, reviewer_name, amount)
        VALUES (?, ?, ?, ?, ?);
    """, (slug, int(check_id), member['id'], member.get('full_name') or member.get('email'), rate))


def for_checks():
    """{(slug, check_id): {amount, status, reviewer_name}} for the KYC orders table."""
    _ensure()
    return {(r['tenant_slug'], r['check_id']): r for r in _platform_query(
        "SELECT tenant_slug, check_id, amount, status, reviewer_name FROM kyc_payouts;") or []}


def team_totals():
    """{member id: {rate, checks, due, paid}} for the KYC team panel."""
    _ensure()
    rates = {r['id']: r['rate_per_check'] for r in _platform_query(
        "SELECT id, rate_per_check FROM platform_admins WHERE role = 'kyc';") or []}
    out = {mid: {'rate': rate, 'checks': 0, 'due': 0.0, 'paid': 0.0} for mid, rate in rates.items()}
    for r in _platform_query("""
        SELECT reviewer_id, status, COUNT(*) AS n, SUM(amount) AS total FROM kyc_payouts GROUP BY 1, 2;
    """) or []:
        m = out.setdefault(r['reviewer_id'], {'rate': None, 'checks': 0, 'due': 0.0, 'paid': 0.0})
        m['checks'] += r['n']
        m['paid' if r['status'] == 'paid' else 'due'] += round(float(r['total'] or 0), 2)
    return out


def entries(limit=300):
    """The latest charges, newest first: when, which workspace, who checked it, how much, paid or not."""
    _ensure()
    names = {r['slug']: r['name'] for r in _platform_query("SELECT slug, name FROM tenants;") or []}
    rows = _platform_query("SELECT * FROM kyc_payouts ORDER BY id DESC LIMIT ?;", (int(limit),)) or []
    return [{**dict(r), 'workspace_name': names.get(r['tenant_slug'], r['tenant_slug'])} for r in rows]


def set_rate(member_id, value):
    _ensure()
    if value in (None, ''):
        rate = None
    else:
        try:
            rate = round(float(value), 2)
        except (TypeError, ValueError):
            raise ValueError("The rate must be a number")
        if rate < 0:
            raise ValueError("The rate cannot be below zero")
    _platform_execute("UPDATE platform_admins SET rate_per_check = ? WHERE id = ? AND role = 'kyc';",
                      (rate, int(member_id)))
    return rate


def mark_paid(member_id):
    """Everything due to the member is paid now. Returns the amount."""
    _ensure()
    due = _platform_query("SELECT COALESCE(SUM(amount), 0) AS s FROM kyc_payouts WHERE reviewer_id = ? AND status = 'due';",
                          (int(member_id),), one=True)['s']
    _platform_execute("UPDATE kyc_payouts SET status = 'paid', paid_at = datetime('now') "
                      "WHERE reviewer_id = ? AND status = 'due';", (int(member_id),))
    return round(float(due or 0), 2)
