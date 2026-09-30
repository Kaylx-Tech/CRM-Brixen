import re
import urllib.request

idx = urllib.request.urlopen("https://admin.brixenconsultants.com/", timeout=30).read().decode("utf-8", "ignore")
print("INDEX ok, len=", len(idx))
assets = re.findall(r'/assets/[^"\']+\.js', idx)
print("assets", assets)

for a in assets[:6]:
    url = "https://admin.brixenconsultants.com" + a
    js = urllib.request.urlopen(url, timeout=90).read().decode("utf-8", "ignore")
    found = sorted(
        set(
            re.findall(
                r"https://api\.brixenconsultants\.com/api|https://[^\"']*brixen[^\"']*|http://localhost:\d+|http://127\.0\.0\.1:\d+",
                js,
            )
        )
    )
    print(a, "size=", len(js), "urls=", found[:20])
    if "api.brixenconsultants.com/api" in js:
        print("  -> API base baked correctly")
    if "/api" in js and "api.brixenconsultants.com" not in js:
        # relative /api only?
        if 'VITE_API_URL||"/api"' in js or "VITE_API_URL||'/api'" in js or '("/api")' in js:
            print("  -> may fall back to relative /api")
