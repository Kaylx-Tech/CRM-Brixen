"""Keeping every company's Companies House data fresh (status, accounts and confirmation statement dates,
attention issues, the director's name), so a statement or accounts filed at Companies House show up quickly.

Who is checked, and how often:
  * overdue companies (accounts or confirmation statement overdue, or flagged in Attention): every 15 minutes,
    since they are the ones most likely to have just filed
  * urgent companies (never checked, something overdue or flagged, or a deadline within 30 days): every hour
  * every other live company: once a day
  * closed companies (dissolved, converted / closed): once a week
A background worker (start_worker) runs every few minutes within a budget of Companies House calls per run
(the key allows 600 requests per 5 minutes and is shared with every other feature).
Opening the Companies page also checks a few at once, and "Check Now" refreshes one company, or every company
needing attention, straight away.
"""
import json
import threading
import time

from db import execute_db, query_db

OVERDUE_MINUTES = 15
URGENT_HOURS = 1
NORMAL_HOURS = 24
CLOSED_DAYS = 7
RUN_EVERY_SECONDS = 5 * 60
CALLS_PER_RUN = 100        # Companies House calls a worker run may use
PAUSE_SECONDS = 0.25       # between calls, gently
CLOSED = "('dissolved', 'closed', 'converted-closed', 'removed')"

# Which companies are due a check, most urgent and longest waiting first
DUE_SQL = f"""
    SELECT id, company_number, name, status,
           CASE WHEN COALESCE(confirmation_overdue, 0) = 1 OR COALESCE(accounts_overdue, 0) = 1
                  OR (ch_attention_json IS NOT NULL AND ch_attention_json NOT IN ('', '[]'))
                THEN 1 ELSE 0 END AS overdue,
           CASE WHEN ch_checked_at IS NULL OR ch_attention_json IS NULL
                  OR COALESCE(confirmation_overdue, 0) = 1 OR COALESCE(accounts_overdue, 0) = 1
                  OR (ch_attention_json IS NOT NULL AND ch_attention_json NOT IN ('', '[]'))
                  OR date(confirmation_next_due) <= date('now', '+30 days')
                  OR date(accounts_next_due) <= date('now', '+30 days')
                THEN 1 ELSE 0 END AS urgent
    FROM companies
    WHERE length(trim(company_number)) >= 6
      AND company_number NOT LIKE 'REG-%' AND upper(company_number) NOT LIKE 'PENDING%'
      AND (
        ch_checked_at IS NULL
        OR (lower(COALESCE(status, '')) IN {CLOSED}
            AND datetime(ch_checked_at) < datetime('now', '-{CLOSED_DAYS} days'))
        OR (lower(COALESCE(status, '')) NOT IN {CLOSED} AND (
              datetime(ch_checked_at) < datetime('now', '-{NORMAL_HOURS} hours')
              OR (datetime(ch_checked_at) < datetime('now', '-{OVERDUE_MINUTES} minutes') AND (
                    COALESCE(confirmation_overdue, 0) = 1 OR COALESCE(accounts_overdue, 0) = 1
                    OR (ch_attention_json IS NOT NULL AND ch_attention_json NOT IN ('', '[]'))))
              OR (datetime(ch_checked_at) < datetime('now', '-{URGENT_HOURS} hours') AND (
                    ch_attention_json IS NULL
                    OR COALESCE(confirmation_overdue, 0) = 1 OR COALESCE(accounts_overdue, 0) = 1
                    OR (ch_attention_json NOT IN ('', '[]'))
                    OR date(confirmation_next_due) <= date('now', '+30 days')
                    OR date(accounts_next_due) <= date('now', '+30 days')))))
      )
    ORDER BY (ch_checked_at IS NULL) DESC, overdue DESC, urgent DESC, ch_checked_at ASC
    LIMIT ?;
"""


def refresh_company(company):
    """Update one company from its Companies House profile now. True when Companies House answered."""
    from services.ch_attention import issues_from_profile
    from services.companies_house_service import fetch_company_profile
    from services.smart_intake import companies_house_status_value
    profile = fetch_company_profile(company['company_number'])
    if not (profile.get('success') and profile.get('data')):
        # Mark it checked so one bad number never blocks the queue; stored dates still drive attention
        execute_db("UPDATE companies SET ch_checked_at = datetime('now'), "
                   "ch_attention_json = COALESCE(ch_attention_json, '[]') WHERE id = ?;", (company['id'],))
        return False
    d = profile['data']
    accounts = d.get('accounts') or {}
    confirmation = d.get('confirmation_statement') or {}
    execute_db("""
        UPDATE companies
        SET status = ?, inc_date = COALESCE(?, inc_date),
            accounts_next_due = ?, accounts_overdue = ?,
            confirmation_next_due = ?, confirmation_overdue = ?,
            ch_attention_json = ?, ch_checked_at = datetime('now')
        WHERE id = ?;
    """, (companies_house_status_value(d.get('company_status'), d.get('company_status_detail')),
          d.get('date_of_creation'),
          accounts.get('next_due') or (accounts.get('next_accounts') or {}).get('due_on'),
          1 if accounts.get('overdue') else 0,
          confirmation.get('next_due'), 1 if confirmation.get('overdue') else 0,
          json.dumps(issues_from_profile(d)), company['id']))
    return True


def refresh_due(limit):
    """Check up to `limit` companies that are due. Returns how many were checked."""
    from services.companies_house_service import get_ch_api_key
    if limit <= 0 or not get_ch_api_key():
        return 0
    done = 0
    for company in query_db(DUE_SQL, (int(limit),)) or []:
        try:
            refresh_company(company)
        except Exception as exc:
            print(f"[CH refresh] {company.get('company_number')}: {exc}")
        done += 1
        time.sleep(PAUSE_SECONDS)
    return done


def refresh_now(company_ids):
    """Check these companies straight away (Check Now). Returns {checked, updated}."""
    checked = updated = 0
    for cid in [int(c) for c in company_ids if str(c).isdigit()][:100]:
        row = query_db("SELECT id, company_number FROM companies WHERE id = ? AND length(trim(company_number)) >= 6 "
                       "AND company_number NOT LIKE 'REG-%' LIMIT 1;", (cid,), one=True)
        if not row:
            continue
        checked += 1
        if refresh_company(dict(row)):
            updated += 1
        if checked > 1:
            time.sleep(PAUSE_SECONDS)
    return {'checked': checked, 'updated': updated}


# ── the director's name ─────────────────────────────────────────────────────
_DIRECTOR_LOOKED_UP = {}
DIRECTOR_RETRY_SECONDS = 12 * 3600


def is_placeholder_director(value):
    return str(value or '').strip().lower() in ('', 'director', 'directors')


def fill_missing_directors(limit=5):
    """Give companies saved without a director's name (only the stand-in word "Director") their real one:
    from the company's own directors list, else the first active director at Companies House. Each company is
    looked up at most every 12 hours. Returns how many Companies House calls were made."""
    rows = query_db("""
        SELECT id, company_number FROM companies
        WHERE (director IS NULL OR lower(trim(director)) IN ('', 'director', 'directors'))
          AND length(trim(company_number)) >= 6 AND company_number NOT LIKE 'REG-%'
        ORDER BY id DESC LIMIT 50;
    """) or []
    now = time.time()
    calls = 0
    for row in rows:
        known = query_db("SELECT name FROM company_directors WHERE company_id = ? AND trim(name) != '' "
                         "AND lower(trim(name)) != 'director' ORDER BY id LIMIT 1;", (row['id'],), one=True)
        if known:
            execute_db("UPDATE companies SET director = ? WHERE id = ?;", (known['name'], row['id']))
            continue
        key = row['company_number']
        if now - _DIRECTOR_LOOKED_UP.get(key, 0) < DIRECTOR_RETRY_SECONDS:
            continue
        if calls >= limit:
            break
        _DIRECTOR_LOOKED_UP[key] = now
        calls += 1
        from services.smart_intake import fetch_companies_house_primary_director
        name = fetch_companies_house_primary_director(row['company_number'])
        if name and not is_placeholder_director(name):
            execute_db("UPDATE companies SET director = ? WHERE id = ?;", (name, row['id']))
    return calls


# ── the worker ──────────────────────────────────────────────────────────────

def run_once():
    """One pass within the call budget. Returns how many Companies House calls were made."""
    used = refresh_due(CALLS_PER_RUN)
    used += fill_missing_directors(limit=min(3, max(0, CALLS_PER_RUN - used)))
    return used


def start_worker():
    def _loop():
        time.sleep(60)  # let the server start first
        while True:
            try:
                checked = run_once()
                if checked:
                    print(f"[CH refresh] checked {checked} compan{'y' if checked == 1 else 'ies'}")
            except Exception as exc:
                print(f"[CH refresh] run skipped: {exc}")
            time.sleep(RUN_EVERY_SECONDS)
    threading.Thread(target=_loop, name='ch-refresh', daemon=True).start()
