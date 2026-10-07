"""OAuth2 One-Click Token Generator for Google Drive
"""
import os
import sys
import urllib.parse
import urllib.request
import json
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Load .env
def load_env():
    fpath = BASE_DIR / '.env'
    if fpath.exists():
        with open(fpath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip("'").strip('"')
                    if k and k not in os.environ:
                        os.environ[k] = v

load_env()

CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '').strip()
REDIRECT_URI = "http://localhost:8080/"
SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file"

if not CLIENT_ID or not CLIENT_SECRET:
    print("Error: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not found in .env")
    sys.exit(1)

auth_code = None

class OAuthCallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        
        if 'code' in params:
            auth_code = params['code'][0]
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            html = """
            <html>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f4f4f5;">
                <div style="max-width:500px; margin:auto; background:white; padding:30px; border-radius:12px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                    <h2 style="color:#16a34a; margin-top:0;">✅ Google Drive Successfully Connected!</h2>
                    <p style="color:#52525b; font-size:16px;">Authorization code received. You can close this browser tab and return to your IDE.</p>
                </div>
            </body>
            </html>
            """
            self.wfile.write(html.encode('utf-8'))
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Failed to receive authorization code.")

def save_refresh_token_to_env(refresh_token):
    env_path = BASE_DIR / '.env'
    content = ""
    if env_path.exists():
        with open(env_path, 'r', encoding='utf-8') as f:
            content = f.read()
    
    if 'GOOGLE_REFRESH_TOKEN=' in content:
        lines = []
        for line in content.splitlines():
            if line.startswith('GOOGLE_REFRESH_TOKEN='):
                lines.append(f'GOOGLE_REFRESH_TOKEN={refresh_token}')
            else:
                lines.append(line)
        content = "\n".join(lines)
    else:
        content += f"\nGOOGLE_REFRESH_TOKEN={refresh_token}\n"
        
    with open(env_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"\n[SUCCESS] Saved GOOGLE_REFRESH_TOKEN to .env!")

def main():
    auth_url_params = {
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': SCOPES,
        'access_type': 'offline',
        'prompt': 'consent',
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(auth_url_params)
    
    print("=" * 65)
    print(">>> Brixen CRM - Google Drive OAuth Token Generator")
    print("=" * 65)
    print("\nOpening your browser for Google Authorization...")
    print(f"\nIf browser doesn't open automatically, please open this link:\n\n{auth_url}\n")
    print("Waiting for authentication callback on http://localhost:8080/ ...")
    
    webbrowser.open(auth_url)
    
    server_address = ('', 8080)
    httpd = HTTPServer(server_address, OAuthCallbackHandler)
    
    while auth_code is None:
        httpd.handle_request()
        
    print("\nAuthorization code received! Exchanging for Refresh Token...")
    
    # Exchange code for token
    token_url = "https://oauth2.googleapis.com/token"
    data = urllib.parse.urlencode({
        'code': auth_code,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'redirect_uri': REDIRECT_URI,
        'grant_type': 'authorization_code'
    }).encode('utf-8')
    
    req = urllib.request.Request(token_url, data=data, headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = json.loads(resp.read().decode('utf-8'))
            refresh_token = resp_body.get('refresh_token')
            if refresh_token:
                save_refresh_token_to_env(refresh_token)
                print(f"Refresh Token: {refresh_token[:10]}... (hidden for security)")
                print("\n[SUCCESS] Google Drive is now permanently connected via OAuth 2.0!")
            else:
                print(f"Response: {resp_body}")
                print("Warning: No refresh_token returned. Try revoking app permissions and trying again with prompt=consent.")
    except Exception as e:
        print(f"Error during token exchange: {e}")

if __name__ == '__main__':
    main()
