"""IndexNow: tells Bing, Yandex and the other IndexNow search engines straight away when a finstap.com
page is new or changed (Bing's index also feeds ChatGPT search and DuckDuckGo). Google does not take
IndexNow; it reads finstap.com/sitemap.xml instead.

The key is public by design: search engines check it against https://finstap.com/<key>.txt
(frontend/public). Only production sends anything; local and test servers just log what they would send.
"""
import json
import os
import threading
import urllib.request

INDEXNOW_KEY = os.environ.get('INDEXNOW_KEY', '016a2c68248e34c0c7f91f4f82ccff0d').strip()
ENDPOINT = 'https://api.indexnow.org/indexnow'


def site_host():
    return os.environ.get('TENANT_BASE_DOMAIN', 'finstap.com').strip() or 'finstap.com'


def _send(urls):
    host = site_host()
    payload = json.dumps({
        'host': host,
        'key': INDEXNOW_KEY,
        'keyLocation': f'https://{host}/{INDEXNOW_KEY}.txt',
        'urlList': urls,
    }).encode('utf-8')
    req = urllib.request.Request(ENDPOINT, data=payload, method='POST',
                                 headers={'Content-Type': 'application/json; charset=utf-8'})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            print(f"[IndexNow] sent {len(urls)} URL(s): HTTP {res.status}")
    except Exception as exc:  # search engines are a bonus: never let this break publishing
        print(f"[IndexNow] not sent ({exc})")


def notify(paths):
    """paths like 'blog/my-post' or '' (home); sent in the background."""
    if not INDEXNOW_KEY:
        return
    urls = [f"https://{site_host()}/{p.lstrip('/')}" for p in paths]
    from config import IS_PRODUCTION
    if not IS_PRODUCTION:
        print(f"[IndexNow] would send (production only): {urls}")
        return
    threading.Thread(target=_send, args=(urls,), daemon=True).start()
