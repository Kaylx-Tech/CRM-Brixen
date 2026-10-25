"""Smart Operations (/api/admin/smart-links): the team's quick links, grouped by company or provider
(Tide, TapTap, Wise …): partner portals, referral links, forms. Every team member can open and copy them;
admins and managers add, edit and remove them.

GET    /api/admin/smart-links            all links (+ the list of categories)
POST   /api/admin/smart-links            {category, title, url, note}
PUT    /api/admin/smart-links/<id>       any of {category, title, url, note, sort_order}
DELETE /api/admin/smart-links/<id>
"""
import re

from db import query_db, execute_db
from utils.response import success_response, error_response

TEAM_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
MANAGE_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER')


def _clean(body, partial=False):
    """Validated fields from the request. Returns (fields, error)."""
    body = body if isinstance(body, dict) else {}
    out = {}
    for key, limit in (('category', 80), ('title', 160), ('url', 2000), ('note', 1000)):
        if key in body or not partial:
            out[key] = str(body.get(key) or '').strip()[:limit]
    for key in ('category', 'title', 'url'):
        if key in out and not out[key]:
            return None, f"{key.capitalize()} is required"
    if 'url' in out:
        if not re.match(r'^https?://', out['url'], re.I):
            out['url'] = f"https://{out['url']}"
        if not re.match(r'^https?://[^\s/$.?#][^\s]*$', out['url'], re.I):
            return None, "Enter a valid link, e.g. https://www.tide.co/…"
    if 'sort_order' in body:
        try:
            out['sort_order'] = int(body.get('sort_order') or 0)
        except (TypeError, ValueError):
            return None, "Sort order must be a number"
    return out, None


def _row(link_id):
    row = query_db("""
        SELECT l.*, u.full_name AS created_by_name FROM smart_links l
        LEFT JOIN users u ON u.id = l.created_by WHERE l.id = ?;
    """, (link_id,), one=True)
    return dict(row) if row else None


def handle_smart_link_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/admin/smart-links'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    role = user.get('role')
    if role not in TEAM_ROLES:
        return error_response(start_response, "Smart Operations is for the team only.", status_code=403)

    if path == '/api/admin/smart-links' and method == 'GET':
        rows = query_db("""
            SELECT l.*, u.full_name AS created_by_name FROM smart_links l
            LEFT JOIN users u ON u.id = l.created_by
            ORDER BY LOWER(l.category), l.sort_order, LOWER(l.title);
        """) or []
        links = [dict(r) for r in rows]
        categories = sorted({l['category'] for l in links}, key=str.lower)
        return success_response(start_response, data={
            'links': links, 'categories': categories, 'can_manage': role in MANAGE_ROLES,
        })

    if role not in MANAGE_ROLES:
        return error_response(start_response, "Only admins and managers can change Smart Operations links.",
                              status_code=403)

    # The default partner and referral links (the ones a new workspace starts with)
    if path == '/api/admin/smart-links/import-starter' and method == 'POST':
        from services.starter_links import import_starter_links
        added, skipped = import_starter_links(user.get('id'))
        message = f"Added {added} default link(s)." if added else "You already have every default link."
        return success_response(start_response, data={'added': added, 'skipped': skipped}, message=message)

    if path == '/api/admin/smart-links' and method == 'POST':
        fields, err = _clean(body)
        if err:
            return error_response(start_response, err, status_code=400)
        link_id = execute_db("""
            INSERT INTO smart_links (category, title, url, note, sort_order, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM smart_links WHERE category = ?), 0), ?,
                    datetime('now'), datetime('now'));
        """, (fields['category'], fields['title'], fields['url'], fields['note'] or None, fields['category'],
              user.get('id')))
        return success_response(start_response, data=_row(link_id), message="Link added.", status_code=201)

    match = re.match(r'^/api/admin/smart-links/(\d+)$', path)
    if match:
        link_id = int(match.group(1))
        if not _row(link_id):
            return error_response(start_response, "Link not found", status_code=404)
        if method in ('PUT', 'PATCH'):
            fields, err = _clean(body, partial=True)
            if err:
                return error_response(start_response, err, status_code=400)
            if fields:
                sets = ', '.join(f"{k} = ?" for k in fields)
                params = [(v or None) if k == 'note' else v for k, v in fields.items()]
                execute_db(f"UPDATE smart_links SET {sets}, updated_at = datetime('now') WHERE id = ?;",
                           tuple(params + [link_id]))
            return success_response(start_response, data=_row(link_id), message="Link updated.")
        if method == 'DELETE':
            execute_db("DELETE FROM smart_links WHERE id = ?;", (link_id,))
            return success_response(start_response, message="Link removed.")

    return error_response(start_response, "Not found", status_code=404)
