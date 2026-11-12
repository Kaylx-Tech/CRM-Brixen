"""Partner Perks set by Finstap (admin.finstap.com › Partner Perks): partner links shown in every workspace's
Smart Operations › Partner Perks, next to the workspace's own links. Workspaces can open and copy them but
not change them; a change here shows everywhere at once.

Each perk can carry a reward from Finstap in pounds (reward_amount): what a workspace earns when an account
opened through the link is marked eligible (services/partner_rewards.py). The owner can give one workspace a
different reward for a perk (perk_rewards). The partner's own offer (note) is no longer asked or shown."""
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
    cols = {r['name'] for r in (_platform_query("PRAGMA table_info(partner_perks);") or [])}
    if 'reward_amount' not in cols:
        _platform_execute("ALTER TABLE partner_perks ADD COLUMN reward_amount REAL;")
    # One workspace's own reward for a perk (empty amount = the perk's general reward)
    _platform_execute("""
        CREATE TABLE IF NOT EXISTS perk_rewards (
            perk_id INTEGER NOT NULL,
            tenant_slug TEXT NOT NULL,
            amount REAL,
            updated_by TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (perk_id, tenant_slug)
        );
    """)


def _public(p):
    p = dict(p)
    p.pop('note', None)
    p.pop('reward', None)
    return p


def all_perks():
    _ensure()
    rows = _platform_query("SELECT * FROM partner_perks ORDER BY LOWER(category), sort_order, LOWER(title);") or []
    return [_public(p) for p in rows]


def get(perk_id):
    _ensure()
    row = _platform_query("SELECT * FROM partner_perks WHERE id = ?;", (int(perk_id),), one=True)
    return _public(row) if row else None


def money(value, label="Reward"):
    """'' / None → None; otherwise pounds, 0 to 10,000."""
    if value in (None, ''):
        return None
    try:
        amount = round(float(str(value).replace('£', '').replace(',', '').strip()), 2)
    except (TypeError, ValueError):
        raise PerkError(f"{label} must be an amount in pounds, e.g. 50")
    if not 0 <= amount <= 10000:
        raise PerkError(f"{label} must be between £0 and £10,000")
    return amount


def _clean(body):
    body = body if isinstance(body, dict) else {}
    out = {k: str(body.get(k) or '').strip()[:n] for k, n in (('category', 80), ('title', 160), ('url', 2000))}
    for key in ('category', 'title', 'url'):
        if not out[key]:
            raise PerkError(f"{key.capitalize()} is required")
    if not re.match(r'^https?://', out['url'], re.I):
        out['url'] = f"https://{out['url']}"
    if not re.match(r'^https?://[^\s/$.?#][^\s]*$', out['url'], re.I):
        raise PerkError("Enter a valid link, e.g. https://www.tide.co/…")
    out['reward_amount'] = money(body.get('reward_amount'))
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
            UPDATE partner_perks SET category = ?, title = ?, url = ?, reward_amount = ?, sort_order = ?,
                   updated_at = datetime('now') WHERE id = ?;
        """, (f['category'], f['title'], f['url'], f['reward_amount'], f['sort_order'], int(perk_id)))
    else:
        _platform_execute("""INSERT INTO partner_perks (category, title, url, reward_amount, sort_order)
                             VALUES (?, ?, ?, ?, ?);""",
                          (f['category'], f['title'], f['url'], f['reward_amount'], f['sort_order']))
    return all_perks()


def remove(perk_id):
    _ensure()
    _platform_execute("DELETE FROM partner_perks WHERE id = ?;", (int(perk_id),))
    return all_perks()


# ---------------------------------------------------------------- one workspace's rewards

def workspace_rewards(slug):
    """{perk_id: amount} set for this workspace (amount None = the perk's general reward)."""
    _ensure()
    rows = _platform_query("SELECT perk_id, amount FROM perk_rewards WHERE tenant_slug = ?;", (slug,)) or []
    return {r['perk_id']: r['amount'] for r in rows}


def reward_for(perk, slug):
    """The reward this workspace earns for the perk (its own one, else the perk's), or None."""
    own = workspace_rewards(slug).get(perk['id'])
    return own if own is not None else perk.get('reward_amount')


def set_workspace_reward(perk_id, slug, amount, admin_email=''):
    if not get(perk_id):
        raise PerkError("Perk not found")
    value = money(amount)
    _platform_execute("""
        INSERT INTO perk_rewards (perk_id, tenant_slug, amount, updated_by) VALUES (?, ?, ?, ?)
        ON CONFLICT (perk_id, tenant_slug) DO UPDATE SET amount = excluded.amount, updated_by = excluded.updated_by,
            updated_at = datetime('now');
    """, (int(perk_id), slug, value, admin_email))
    return perks_for_owner_workspace(slug)


def perks_for_owner_workspace(slug):
    """Every perk with its general reward and this workspace's own one (owner portal › workspace)."""
    own = workspace_rewards(slug)
    return [{**p, 'workspace_amount': own.get(p['id']), 'effective_amount': reward_for(p, slug)}
            for p in all_perks()]


def for_workspace(slug=None):
    """The perks as workspace links: read only, marked as Finstap's, with this workspace's reward."""
    try:
        if slug is None:
            from tenancy import current_tenant
            slug = (current_tenant() or {}).get('slug')
        return [{**p, 'id': f"fp-{p['id']}", 'perk_id': p['id'], 'from_finstap': True,
                 'reward_amount': reward_for(p, slug) if slug else p.get('reward_amount')}
                for p in all_perks()]
    except Exception as exc:
        print(f"[Partner Perks] {exc}")
        return []
