"""Notifications for the Finstap owner portal (admin.finstap.com): the bell at the top of the owner's menu.

Something that needs the owner, or that they want to know about, adds one row (notify); every owner reads
the same list and marks it read for themselves only. Saving a notification never stops the action that
caused it (a failure is printed and forgotten).

Kinds: signup (a new workspace), topup (a bank transfer to approve), registered_office (a request to
confirm, or an address AutoAllot booked), payment (money that came in by card).
"""
from tenancy import _platform_execute, _platform_query

KINDS = ('signup', 'topup', 'registered_office', 'payment')
KEEP_DAYS = 180
LIST_LIMIT = 50


def notify(kind, title, body='', link='', tenant_slug=None):
    """Add a notification for every owner. Never raises."""
    try:
        _platform_execute("""
            INSERT INTO owner_notifications (kind, title, body, link, tenant_slug) VALUES (?, ?, ?, ?, ?);
        """, (kind if kind in KINDS else 'other', str(title or '')[:200], str(body or '')[:1000] or None,
              str(link or '')[:300] or None, tenant_slug or None))
        # Old ones go after half a year, with who read them
        _platform_execute(f"DELETE FROM owner_notification_reads WHERE notification_id IN "
                          f"(SELECT id FROM owner_notifications WHERE datetime(created_at) < datetime('now', '-{KEEP_DAYS} days'));")
        _platform_execute(f"DELETE FROM owner_notifications WHERE datetime(created_at) < datetime('now', '-{KEEP_DAYS} days');")
    except Exception as exc:
        print(f"[Owner notifications] not saved ({kind}): {exc}")


def for_admin(admin_id, limit=LIST_LIMIT):
    """The newest notifications with this owner's read state, and how many they have not read."""
    rows = _platform_query("""
        SELECT n.id, n.kind, n.title, n.body, n.link, n.tenant_slug, n.created_at,
               CASE WHEN r.admin_id IS NULL THEN 0 ELSE 1 END AS is_read
        FROM owner_notifications n
        LEFT JOIN owner_notification_reads r ON r.notification_id = n.id AND r.admin_id = ?
        ORDER BY n.id DESC LIMIT ?;
    """, (admin_id, limit))
    unread = _platform_query("""
        SELECT COUNT(*) AS n FROM owner_notifications n
        WHERE NOT EXISTS (SELECT 1 FROM owner_notification_reads r WHERE r.notification_id = n.id AND r.admin_id = ?);
    """, (admin_id,), one=True)
    return {
        'notifications': [{**row, 'is_read': bool(row['is_read'])} for row in rows],
        'unread': int((unread or {}).get('n') or 0),
    }


def mark_read(admin_id, ids=None):
    """Mark some notifications (ids) or all of them read for this owner."""
    if ids:
        clean = [int(i) for i in ids if str(i).isdigit()][:200]
        for notification_id in clean:
            _platform_execute("""
                INSERT OR IGNORE INTO owner_notification_reads (notification_id, admin_id)
                SELECT id, ? FROM owner_notifications WHERE id = ?;
            """, (admin_id, notification_id))
        return
    _platform_execute("""
        INSERT OR IGNORE INTO owner_notification_reads (notification_id, admin_id)
        SELECT id, ? FROM owner_notifications;
    """, (admin_id,))
