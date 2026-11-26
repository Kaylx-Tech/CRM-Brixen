"""Who reads the emails: opens and clicks of every email the CRM sends (Email log, Readers, company Reminders tab).

send_email (services/email_service.py) gives each email a token and, before it goes out:
  * adds a 1x1 picture at the end: a mail app that shows pictures loads it, which counts as "Opened";
  * points every web link at /api/public/email/c/<token>/<n>, which counts a click and sends the reader on.
The email log keeps the email as written (without these), so a resend gets the same token again.
The links are kept on the email's row (track_links), so a click only ever goes where the email pointed.

Not tracked: password resets and sign-in codes (category SECURITY / LOGIN, or bodies not kept in the log).
"Opened" is a good hint, not proof: some mail apps (Apple Mail) load pictures by themselves and some block them.
A click is proof the reader was there.
"""
import json
import re
import secrets

from db import execute_db, query_db

NOT_TRACKED = ('SECURITY', 'LOGIN')
PIXEL = (b'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00'
         b',\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;')
DEFAULT_API = 'https://api.brixenconsultants.com'
COLUMNS = (('track_token', 'TEXT'), ('track_links', 'TEXT'), ('opened_at', 'TIMESTAMP'),
           ('last_opened_at', 'TIMESTAMP'), ('open_count', 'INTEGER NOT NULL DEFAULT 0'),
           ('clicked_at', 'TIMESTAMP'), ('last_clicked_at', 'TIMESTAMP'),
           ('click_count', 'INTEGER NOT NULL DEFAULT 0'))
_HREF = re.compile(r'''(href\s*=\s*)(["'])(https?://[^"'\s>]+)\2''', re.I)

_ready = set()


def _db_key():
    try:
        from db import current_db_path
        return current_db_path()
    except Exception:
        return 'crm'


def ensure():
    """The tracking columns on email_outbox (added once per database)."""
    key = _db_key()
    if key in _ready:
        return
    from db import get_db
    conn = get_db()
    cols = {r[1] for r in conn.execute("PRAGMA table_info(email_outbox);").fetchall()}
    for col, ddl in COLUMNS:
        if col not in cols:
            conn.execute(f"ALTER TABLE email_outbox ADD COLUMN {col} {ddl};")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_email_outbox_track ON email_outbox(track_token);")
    conn.commit()
    _ready.add(key)


def _base():
    """This API's public address, plus ?workspace= so the link finds the right workspace."""
    from config import API_PUBLIC_URL
    workspace = ''
    try:
        from tenancy import current_tenant
        workspace = (current_tenant() or {}).get('slug') or ''
    except Exception:
        pass
    return (API_PUBLIC_URL or DEFAULT_API).rstrip('/'), (f"?workspace={workspace}" if workspace else '')


def wants_tracking(category, html_content, store_body=True):
    return bool(html_content) and store_body and str(category or '').upper() not in NOT_TRACKED


def new_token():
    return secrets.token_urlsafe(18)


def add_tracking(html, token):
    """(html with the picture and tracked links, [original links])."""
    base, query = _base()
    links = []

    def swap(m):
        url = m.group(3)
        if '/api/public/email/' in url:
            return m.group(0)
        links.append(url.replace('&amp;', '&'))
        return f'{m.group(1)}{m.group(2)}{base}/api/public/email/c/{token}/{len(links) - 1}{query}{m.group(2)}'

    html = _HREF.sub(swap, html or '')
    pixel = (f'<img src="{base}/api/public/email/o/{token}.gif{query}" width="1" height="1" alt="" '
             'style="display:block;width:1px;height:1px;border:0;opacity:0;" />')
    cut = html.lower().rfind('</body>')
    html = html[:cut] + pixel + html[cut:] if cut >= 0 else html + pixel
    return html, links


def save(log_id, token, links):
    if not log_id or not token:
        return
    ensure()
    execute_db("UPDATE email_outbox SET track_token = ?, track_links = ? WHERE id = ?;",
               (token, json.dumps(links), log_id))


def _row(token):
    if not re.match(r'^[A-Za-z0-9_-]{16,64}$', str(token or '')):
        return None
    ensure()
    row = query_db("SELECT id, track_links FROM email_outbox WHERE track_token = ? LIMIT 1;", (token,), one=True)
    return dict(row) if row else None


def record_open(token):
    row = _row(token)
    if row:
        execute_db("""
            UPDATE email_outbox SET opened_at = COALESCE(opened_at, datetime('now')),
                   last_opened_at = datetime('now'), open_count = COALESCE(open_count, 0) + 1 WHERE id = ?;
        """, (row['id'],))


def record_click(token, index):
    """The address the link pointed to (None when unknown). A click also counts as opened."""
    row = _row(token)
    if not row:
        return None
    try:
        url = json.loads(row.get('track_links') or '[]')[int(index)]
    except (ValueError, IndexError, TypeError):
        return None
    execute_db("""
        UPDATE email_outbox SET clicked_at = COALESCE(clicked_at, datetime('now')), last_clicked_at = datetime('now'),
               click_count = COALESCE(click_count, 0) + 1,
               opened_at = COALESCE(opened_at, datetime('now')), last_opened_at = COALESCE(last_opened_at, datetime('now')),
               open_count = MAX(COALESCE(open_count, 0), 1)
        WHERE id = ?;
    """, (row['id'],))
    return url if re.match(r'^https?://', url or '', re.I) else None


def readers(search='', limit=500):
    """One row per address: emails sent, how many were opened / clicked, and when last. Best readers first."""
    ensure()
    params = []
    where = "WHERE e.status = 'sent' AND e.track_token IS NOT NULL"
    if search:
        where += " AND (e.recipient LIKE ? OR u.full_name LIKE ?)"
        params += [f"%{search}%"] * 2
    rows = query_db(f"""
        SELECT LOWER(e.recipient) AS email, MAX(u.full_name) AS name, MAX(e.user_id) AS user_id,
               COUNT(*) AS sent,
               SUM(CASE WHEN COALESCE(e.open_count, 0) > 0 THEN 1 ELSE 0 END) AS opened,
               SUM(CASE WHEN COALESCE(e.click_count, 0) > 0 THEN 1 ELSE 0 END) AS clicked,
               MAX(e.sent_at) AS last_sent_at, MAX(e.last_opened_at) AS last_opened_at,
               MAX(e.last_clicked_at) AS last_clicked_at
        FROM email_outbox e LEFT JOIN users u ON u.id = e.user_id
        {where}
        GROUP BY LOWER(e.recipient)
        ORDER BY clicked DESC, opened DESC, sent DESC
        LIMIT ?;
    """, params + [int(limit)]) or []
    out = []
    for r in rows:
        r = dict(r)
        r['open_rate'] = round(100 * (r['opened'] or 0) / r['sent']) if r['sent'] else 0
        r['reader'] = 'clicks' if r['clicked'] else 'opens' if r['opened'] else 'never'
        out.append(r)
    return out
