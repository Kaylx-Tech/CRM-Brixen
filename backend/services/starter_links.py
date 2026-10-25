"""Default Smart Operations links for a workspace: the partner and referral links from Brixen's own
Smart Operations. A new workspace gets them at signup; an existing one adds them with "Add default links".
The company edits or removes them and adds its own like any other link.
"""
from db import query_db, execute_db

STARTER_LINKS = [
    {'category': 'Name Cheap', 'title': 'XmP5MG', 'url': 'https://namecheap.pxf.io/XmP5MG'},
    {'category': 'TapTap Business', 'title': 'KAYLX', 'url': 'https://business.taptapsend.com/signup?ref=KAYLX'},
    {'category': 'TapTap Business', 'title': 'BRIX1756',
     'url': 'https://business.taptapsend.com/signup?ref=BRIX1756'},
    {'category': 'Tide', 'title': 'CATIER2F2', 'url': 'https://www.tide.co/partners-business-account/?ref=CATIERF2F'},
    {'category': 'Wise Business', 'title': 'Wise Business',
     'url': 'https://wise.com/register?clickref=1100lBMgc74a&partnerID=1110l20797&utm_medium=affiliate'
            '&utm_campaign=0&adref=&utm_source=brixenconsultants&partnerizecampaignID=1011l727#/email'},
    {'category': 'World First', 'title': 'zzOn1G', 'url': 'https://worldfirstaffiliateprogram.sjv.io/zzOn1G'},
]


def import_starter_links(user_id=None):
    """Add every default link the workspace does not already have (matched by link). Returns (added, skipped)."""
    existing = {str(r.get('url') or '').strip().lower() for r in (query_db("SELECT url FROM smart_links;") or [])}
    added = skipped = 0
    for link in STARTER_LINKS:
        if link['url'].lower() in existing:
            skipped += 1
            continue
        execute_db("""
            INSERT INTO smart_links (category, title, url, sort_order, created_by, created_at, updated_at)
            VALUES (?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM smart_links WHERE category = ?), 0), ?,
                    datetime('now'), datetime('now'));
        """, (link['category'], link['title'], link['url'], link['category'], user_id))
        existing.add(link['url'].lower())
        added += 1
    return added, skipped
