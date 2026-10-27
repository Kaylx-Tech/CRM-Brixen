"""Finstap's own content: the blog on finstap.com/blog and the email newsletter, managed in the owner
portal (Content).

Blog posts are plain text: a blank line starts a new paragraph, "## " a heading and "- " a bullet;
the website shows them as written (no HTML from the owner reaches the page).

Newsletter: people subscribe on finstap.com with their email (consent), every email has an
unsubscribe link, and unsubscribing works at once (PECR). Emails go from Finstap's no-reply mailbox
in the background; a sent issue keeps how many went out and how many failed. Nothing is deleted:
an unsubscribed address stays on the list as Unsubscribed so it is never emailed again.
"""
import html
import re
import secrets
import threading
import time

from tenancy import _platform_execute, _platform_query, use_tenant

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
SUBSCRIBE_LIMIT = 5
SUBSCRIBE_WINDOW = 3600
_subscribes = {}
_lock = threading.Lock()


class ContentError(ValueError):
    """Shown to the person as it is."""


# ── blog ────────────────────────────────────────────────────────────────────

def slugify(value):
    return re.sub(r'-{2,}', '-', re.sub(r'[^a-z0-9]+', '-', str(value or '').lower())).strip('-')[:80]


def _post_out(row, full=True):
    out = dict(row)
    if not full:
        out.pop('body', None)
    return out


def list_posts(published_only=False):
    sql = "SELECT * FROM blog_posts"
    if published_only:
        sql += " WHERE status = 'Published' AND datetime(published_at) <= datetime('now')"
    rows = _platform_query(sql + " ORDER BY COALESCE(published_at, created_at) DESC, id DESC;")
    return [_post_out(r, full=False) for r in rows]


def get_post(slug=None, post_id=None, published_only=False):
    if post_id is not None:
        row = _platform_query("SELECT * FROM blog_posts WHERE id = ?;", (post_id,), one=True)
    else:
        row = _platform_query("SELECT * FROM blog_posts WHERE slug = ?;", (slugify(slug),), one=True)
    if not row or (published_only and (row['status'] != 'Published')):
        return None
    return _post_out(row)


def save_post(data, admin, post_id=None):
    title = str(data.get('title') or '').strip()[:200]
    if not title:
        raise ContentError("Give the post a title")
    slug = slugify(data.get('slug') or title)
    if not slug:
        raise ContentError("The web address needs letters or numbers")
    clash = _platform_query("SELECT id FROM blog_posts WHERE slug = ? AND id != ?;", (slug, post_id or 0), one=True)
    if clash:
        raise ContentError("Another post already uses this web address")
    cover = str(data.get('cover_url') or '').strip()[:500]
    if cover and not cover.startswith('https://'):
        raise ContentError("The cover picture must be an https:// link")
    status = 'Published' if data.get('status') == 'Published' else 'Draft'
    values = (slug, title, str(data.get('excerpt') or '').strip()[:400] or None, str(data.get('body') or ''),
              cover or None, status, data.get('author') or (admin or {}).get('full_name'))
    if post_id:
        old = get_post(post_id=post_id)
        if not old:
            raise ContentError("Post not found")
        _platform_execute("""
            UPDATE blog_posts SET slug = ?, title = ?, excerpt = ?, body = ?, cover_url = ?, status = ?, author = ?,
                   published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
                   updated_at = datetime('now')
            WHERE id = ?;
        """, (*values, status, post_id))
    else:
        post_id = _platform_execute("""
            INSERT INTO blog_posts (slug, title, excerpt, body, cover_url, status, author, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'Published' THEN datetime('now') END);
        """, (*values, status))
    return get_post(post_id=post_id)


# ── newsletter ──────────────────────────────────────────────────────────────

def subscribe(email, source='website', ip=''):
    email = str(email or '').strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise ContentError("Enter a valid email address")
    now = time.time()
    with _lock:
        recent = [t for t in _subscribes.get(ip, []) if now - t < SUBSCRIBE_WINDOW]
        if len(recent) >= SUBSCRIBE_LIMIT:
            raise ContentError("Too many sign-ups from this network. Please try later.")
        _subscribes[ip] = recent + [now]
    _platform_execute("""
        INSERT INTO newsletter_subscribers (email, token, source, ip) VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET status = 'Subscribed', unsubscribed_at = NULL;
    """, (email, secrets.token_urlsafe(24), (source or 'website')[:40], (ip or '')[:64]))


def unsubscribe(token):
    row = _platform_query("SELECT id, email FROM newsletter_subscribers WHERE token = ?;", (str(token or ''),), one=True)
    if not row:
        raise ContentError("This unsubscribe link is not valid")
    _platform_execute("UPDATE newsletter_subscribers SET status = 'Unsubscribed', unsubscribed_at = datetime('now') "
                      "WHERE id = ?;", (row['id'],))
    return row['email']


def subscribers():
    rows = _platform_query("SELECT id, email, status, source, created_at, unsubscribed_at FROM newsletter_subscribers "
                           "ORDER BY id DESC;")
    return {'subscribers': rows, 'subscribed': sum(1 for r in rows if r['status'] == 'Subscribed'),
            'unsubscribed': sum(1 for r in rows if r['status'] != 'Subscribed')}


def list_issues():
    return _platform_query("SELECT * FROM newsletter_issues ORDER BY id DESC;")


def save_issue(data, admin, issue_id=None):
    subject = str(data.get('subject') or '').strip()[:200]
    body = str(data.get('body') or '').strip()
    if not subject or not body:
        raise ContentError("Write a subject and the message")
    if issue_id:
        row = _platform_query("SELECT status FROM newsletter_issues WHERE id = ?;", (issue_id,), one=True)
        if not row:
            raise ContentError("Newsletter not found")
        if row['status'] != 'Draft':
            raise ContentError("A newsletter that was sent cannot be changed")
        _platform_execute("UPDATE newsletter_issues SET subject = ?, body = ? WHERE id = ?;", (subject, body, issue_id))
    else:
        issue_id = _platform_execute("INSERT INTO newsletter_issues (subject, body, created_by) VALUES (?, ?, ?);",
                                     (subject, body, (admin or {}).get('email')))
    return _platform_query("SELECT * FROM newsletter_issues WHERE id = ?;", (issue_id,), one=True)


def text_to_html(body):
    """The owner's plain text as safe HTML: paragraphs, "## " headings and "- " bullets."""
    blocks, out = re.split(r'\n\s*\n', str(body or '').strip()), []
    for block in blocks:
        lines = [l.rstrip() for l in block.splitlines() if l.strip()]
        if not lines:
            continue
        if lines[0].startswith('## '):
            out.append(f'<h2 style="font-size:20px;margin:24px 0 8px;">{html.escape(lines[0][3:])}</h2>')
            lines = lines[1:]
        if lines and all(l.lstrip().startswith('- ') for l in lines):
            out.append('<ul style="padding-left:20px;margin:0 0 16px;">' + ''.join(
                f'<li style="margin:4px 0;">{html.escape(l.lstrip()[2:])}</li>' for l in lines) + '</ul>')
        elif lines:
            out.append('<p style="margin:0 0 16px;line-height:1.6;">' + '<br>'.join(html.escape(l) for l in lines) + '</p>')
    return ''.join(out)


def _issue_email(subject, body, unsubscribe_url):
    return f"""<!doctype html><html><body style="margin:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;
font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#18181b;">
<tr><td style="height:4px;background:#5f5cff;border-radius:16px 16px 0 0;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 36px 8px;font-size:18px;font-weight:700;">Finstap</td></tr>
<tr><td style="padding:8px 36px 0;font-size:24px;font-weight:700;">{html.escape(subject)}</td></tr>
<tr><td style="padding:16px 36px 24px;font-size:15px;color:#3f3f46;">{text_to_html(body)}</td></tr>
<tr><td style="padding:20px 36px 28px;border-top:1px solid #ececef;font-size:12px;color:#a1a1aa;line-height:1.6;">
You get this because you subscribed to the Finstap newsletter.
<a href="{html.escape(unsubscribe_url)}" style="color:#71717a;">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>"""


def _send_one(email, subject, body, unsubscribe_url):
    from services.email_service import send_email
    text = f"{subject}\n\n{body}\n\n---\nUnsubscribe: {unsubscribe_url}"
    with use_tenant(None):
        return send_email(email, subject, _issue_email(subject, body, unsubscribe_url), text, category='NEWSLETTER',
                          log=False, sender_name='Finstap', mailbox='platform')


def send_test(issue_id, email):
    issue = _platform_query("SELECT * FROM newsletter_issues WHERE id = ?;", (issue_id,), one=True)
    if not issue:
        raise ContentError("Newsletter not found")
    if not _send_one(email, f"[Test] {issue['subject']}", issue['body'], 'https://finstap.com/unsubscribe'):
        raise ContentError("The test email could not be sent. Check the server's email settings.")


def send_issue(issue_id, base_url):
    """Send to every subscriber in the background; the issue shows the counts as it goes."""
    issue = _platform_query("SELECT * FROM newsletter_issues WHERE id = ?;", (issue_id,), one=True)
    if not issue:
        raise ContentError("Newsletter not found")
    if issue['status'] != 'Draft':
        raise ContentError("This newsletter was already sent")
    people = _platform_query("SELECT email, token FROM newsletter_subscribers WHERE status = 'Subscribed';")
    if not people:
        raise ContentError("Nobody is subscribed yet")
    _platform_execute("UPDATE newsletter_issues SET status = 'Sending', recipients = ?, sent_at = datetime('now') "
                      "WHERE id = ?;", (len(people), issue_id))

    def run():
        sent = failed = 0
        for person in people:
            ok = False
            try:
                ok = _send_one(person['email'], issue['subject'], issue['body'],
                               f"{base_url.rstrip('/')}/unsubscribe?token={person['token']}")
            except Exception as exc:
                print(f"[Newsletter] {person['email']}: {exc}")
            sent, failed = sent + (1 if ok else 0), failed + (0 if ok else 1)
            _platform_execute("UPDATE newsletter_issues SET sent_count = ?, failed_count = ? WHERE id = ?;",
                              (sent, failed, issue_id))
            time.sleep(0.3)  # stay well inside the mail server's sending limits
        _platform_execute("UPDATE newsletter_issues SET status = 'Sent' WHERE id = ?;", (issue_id,))

    threading.Thread(target=run, daemon=True).start()
    return len(people)
