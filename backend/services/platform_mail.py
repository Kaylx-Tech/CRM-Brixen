"""Finstap's own emails (the owner portal, the KYC team, balance top-ups to approve): one branded look.

The Finstap logo sits centred at the top (sent inside the email as cid:brand-logo), then a headline, a few
lines, and a code or a button when there is one, on the same light card as the signup and login code
emails. send() sends it from Finstap's own mailbox in Finstap's name.
"""
from html import escape

FONT = "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
MONO = "font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;"
ACCENT = '#6559ff'


def logo():
    """(png bytes, 'png') of the Finstap logo for cid:brand-logo, or None."""
    from services.login_otp import FINSTAP_LOGO_PATH
    try:
        with open(FINSTAP_LOGO_PATH, 'rb') as fh:
            return fh.read(), 'png'
    except OSError:
        return None


def html(headline, lines, *, code=None, button=None, note='', preheader=''):
    """The email: `lines` are short paragraphs (plain text), `code` a one-time code, `button` (label, url)."""
    has_logo = bool(logo())
    top = ('<img src="cid:brand-logo" alt="Finstap" height="40" style="display:block;margin:0 auto;height:40px;'
           'width:auto;max-width:200px;border:0;outline:none;text-decoration:none;">' if has_logo else
           f'<p style="margin:0;font-size:22px;font-weight:700;color:#1d1d1f;">Finstap</p>')
    body = ''.join(f'<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.6;color:#424245;">'
                   f'{escape(line)}</td></tr>' for line in lines if line)
    if code:
        body += (f'<tr><td align="center" style="padding:10px 0 24px;"><div style="background:#f5f5f7;'
                 f'border-radius:16px;padding:26px 16px;{MONO}font-size:38px;line-height:1;font-weight:600;'
                 f'letter-spacing:10px;color:#1d1d1f;">{escape(str(code))}</div></td></tr>')
    if button:
        label, url = button
        body += (f'<tr><td align="center" style="padding:10px 0 24px;"><a href="{escape(url)}" '
                 f'style="display:inline-block;background:{ACCENT};color:#ffffff;text-decoration:none;'
                 f'font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px;">{escape(label)}</a>'
                 f'</td></tr><tr><td style="padding:0 0 14px;font-size:12px;line-height:1.5;color:#86868b;'
                 f'word-break:break-all;">If the button does not work, copy this link: {escape(url)}</td></tr>')
    foot = (f'<tr><td style="padding:8px 0 0;border-top:1px solid #e8e8ed;font-size:13px;line-height:1.6;'
            f'color:#6e6e73;">{escape(note)}</td></tr>') if note else ''
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f5f5f7;">
<div style="display:none;max-height:0;overflow:hidden;">{escape(preheader or headline)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 24px rgba(0,0,0,0.05);{FONT}color:#1d1d1f;">
      <tr><td style="padding:40px 40px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:0 0 32px;">{top}</td></tr>
          <tr><td style="padding:0 0 16px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#1d1d1f;">{escape(headline)}</td></tr>
          {body}
          {foot}
        </table>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;{FONT}font-size:12px;line-height:1.5;color:#86868b;">Finstap · Corporate management software · finstap.com</p>
  </td></tr>
</table>
</body></html>"""


def send(email, subject, text, page, *, mailbox='platform', log=False, store_body=False, category='SECURITY'):
    """Send a page made by html() from Finstap's own mailbox, in Finstap's name. True when it went out."""
    from services.email_service import send_email
    from tenancy import use_tenant
    with use_tenant(None):  # Finstap's own mailbox, never a company's
        return send_email(email, subject, page, text, category=category, log=log, store_body=store_body,
                          logo=logo(), sender_name='Finstap', mailbox=mailbox)
