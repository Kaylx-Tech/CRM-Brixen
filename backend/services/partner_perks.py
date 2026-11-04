"""Partner Perks set by Finstap (admin.finstap.com › Partner Perks): partner links shown in every workspace's
Smart Operations › Partner Perks, next to the workspace's own links. Workspaces can open and copy them but
not change them; a change here shows everywhere at once."""
import re

from tenancy import _platform_execute, _platform_query


class PerkError(ValueError):
    """Shown to the owner as it is."""


def _ensure():
    _platform_execute("""
        CREATE TABLE IF NOT EXISTS partner_perks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            note TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)


def all_perks():
    _ensure()
    return _platform_query("SELECT * FROM partner_perks ORDER BY LOWER(category), sort_order, LOWER(title);") or []


def _clean(body):
    body = body if isinstance(body, dict) else {}
    out = {k: str(body.get(k) or '').strip()[:n] for k, n in (('category', 80), ('title', 160), ('url', 2000),
                                                             ('note', 1000))}
    for key in ('category', 'title', 'url'):
        if not out[key]:
            raise PerkError(f"{key.capitalize()} is required")
    if not re.match(r'^https?://', out['url'], re.I):
        out['url'] = f"https://{out['url']}"
    if not re.match(r'^https?://[^\s/$.?#][^\s]*$', out['url'], re.I):
        raise PerkError("Enter a valid link, e.g. https://www.tide.co/…")
    try:
        out['sort_order'] = int(body.get('sort_order') or 0)
    except (TypeError, ValueError):
        out['sort_order'] = 0
    return out


def save(body, perk_id=None):
    _ensure()
    f = _clean(body)
    if perk_id:
        _platform_execute("""
            UPDATE partner_perks SET category = ?, title = ?, url = ?, note = ?, sort_order = ?,
                   updated_at = datetime('now') WHERE id = ?;
        """, (f['category'], f['title'], f['url'], f['note'] or None, f['sort_order'], int(perk_id)))
    else:
        _platform_execute("INSERT INTO partner_perks (category, title, url, note, sort_order) VALUES (?, ?, ?, ?, ?);",
                          (f['category'], f['title'], f['url'], f['note'] or None, f['sort_order']))
    return all_perks()


def remove(perk_id):
    _ensure()
    _platform_execute("DELETE FROM partner_perks WHERE id = ?;", (int(perk_id),))
    return all_perks()


def for_workspace():
    """The perks as workspace links: read only, marked as Finstap's."""
    try:
        return [{**dict(p), 'id': f"fp-{p['id']}", 'from_finstap': True} for p in all_perks()]
    except Exception as exc:
        print(f"[Partner Perks] {exc}")
        return []
