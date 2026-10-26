"""
Reusable Brixen CRM email engine.

One shared shell + components. Category controls footer, disclaimer, tone, and CTAs.
Do not invent client/company data — callers must supply verified values only.
"""
from __future__ import annotations

import os
import re
from html import escape as html_escape

EMAIL_TEMPLATE_VERSION = '2026.09.07.2'

EMAIL_FONT_STACK = (
    '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
)

EMAIL_CATEGORIES = (
    'COMPLIANCE',
    'COMPANIES_HOUSE',
    'KYC',
    'DOCUMENT',
    'CUSTOMER_UPLOAD',
    'INVOICE',
    'PAYMENT',
    'ORDER',
    'ACCOUNT',
    'SECURITY',
    'STAFF',
    'SYSTEM',
    'MARKETING',
)

COMPLIANCE_DISCLAIMER = (
    'This is a transactional compliance notice based on information held in our '
    'CRM and/or Companies House data. We are not Companies House.'
)

TRANSACTIONAL_ACCOUNT_NOTE = (
    'This is a transactional email about your account. '
    'It is not a marketing message.'
)

CATEGORY_META = {
    'COMPLIANCE': {
        'disclaimer': COMPLIANCE_DISCLAIMER,
        'tone': 'alert',
        'max_words': 180,
        'components': (
            'header', 'intro', 'issue', 'action', 'company', 'cta_ch', 'cta_wa',
            'signature', 'disclaimer',
        ),
    },
    'COMPANIES_HOUSE': {
        'disclaimer': COMPLIANCE_DISCLAIMER,
        'tone': 'alert',
        'max_words': 180,
        'components': (
            'header', 'intro', 'issue', 'action', 'company', 'cta_ch', 'cta_wa',
            'signature', 'disclaimer',
        ),
    },
    'KYC': {
        'disclaimer': COMPLIANCE_DISCLAIMER,
        'tone': 'alert',
        'max_words': 180,
        'components': (
            'header', 'intro', 'issue', 'action', 'company', 'cta_wa',
            'signature', 'disclaimer',
        ),
    },
    'DOCUMENT': {
        'disclaimer': TRANSACTIONAL_ACCOUNT_NOTE,
        'tone': 'info',
        'max_words': 160,
        'components': ('header', 'intro', 'info', 'cta', 'signature'),
    },
    'CUSTOMER_UPLOAD': {
        'disclaimer': None,
        'tone': 'info',
        'max_words': 140,
        'components': ('header', 'intro', 'info', 'signature'),
    },
    'INVOICE': {
        'disclaimer': TRANSACTIONAL_ACCOUNT_NOTE,
        'tone': 'payment',
        'max_words': 160,
        'components': ('header', 'intro', 'info', 'cta', 'signature'),
    },
    'PAYMENT': {
        'disclaimer': TRANSACTIONAL_ACCOUNT_NOTE,
        'tone': 'success',
        'max_words': 140,
        'components': ('header', 'intro', 'info', 'cta', 'signature'),
    },
    'ORDER': {
        'disclaimer': TRANSACTIONAL_ACCOUNT_NOTE,
        'tone': 'info',
        'max_words': 160,
        'components': ('header', 'intro', 'info', 'cta', 'signature'),
    },
    'ACCOUNT': {
        'disclaimer': TRANSACTIONAL_ACCOUNT_NOTE,
        'tone': 'info',
        'max_words': 160,
        'components': ('header', 'intro', 'cta', 'signature'),
    },
    'SECURITY': {
        'disclaimer': None,
        'tone': 'info',
        'max_words': 120,
        'components': ('header', 'intro', 'cta', 'signature'),
    },
    'STAFF': {
        'disclaimer': None,
        'tone': 'info',
        'max_words': 200,
        'components': ('intro', 'info'),
    },
    'SYSTEM': {
        'disclaimer': None,
        'tone': 'info',
        'max_words': 160,
        'components': ('intro', 'info'),
    },
    'MARKETING': {
        'disclaimer': None,
        'tone': 'info',
        'max_words': 220,
        'components': ('header', 'intro', 'cta', 'signature'),
    },
}


def normalize_email_category(value, default='ORDER'):
    text = str(value or '').strip().upper().replace('-', '_').replace(' ', '_')
    aliases = {
        'ACTIVITY': 'ORDER',
        'CELEBRATION': 'ACCOUNT',
        'WELCOME': 'ACCOUNT',
        'PASSWORD': 'SECURITY',
        'PASSWORD_RESET': 'SECURITY',
        'CH': 'COMPANIES_HOUSE',
        'COMPANIESHOUSE': 'COMPANIES_HOUSE',
    }
    text = aliases.get(text, text)
    if text in CATEGORY_META:
        return text
    return default


def _company_name():
    """The sending company's name (its Settings; never Brixen inside a Finstap workspace)."""
    from services.portal_compat import brand_name
    return brand_name()


def category_disclaimer(category, override=None):
    """Return disclaimer text for category. override='' suppresses; None uses category default."""
    if override is not None:
        return str(override).strip()
    meta = CATEGORY_META.get(normalize_email_category(category), {})
    note = meta.get('disclaimer')
    return str(note).strip() if note else ''


def category_has_compliance_disclaimer(category):
    note = category_disclaimer(category)
    return 'not Companies House' in note


def count_words(text):
    return len(re.findall(r"[A-Za-z0-9']+", str(text or '')))


def trim_email_copy(text, max_words=180):
    words = re.findall(r"\S+", str(text or '').strip())
    if len(words) <= max_words:
        return str(text or '').strip(), False
    return ' '.join(words[:max_words]).rstrip('.,;:') + '.', True


def normalize_legal_name(value):
    name = str(value or '').strip()
    name = re.sub(r'\bLTD\b', 'Ltd', name, flags=re.I)
    name = re.sub(r'\bLimited\b', 'Ltd', name, flags=re.I)
    return name.rstrip('.,;: ').strip()


def format_uk_phone_display(phone):
    digits = re.sub(r'\D', '', str(phone or ''))
    if not digits:
        return ''
    if digits.startswith('44') and len(digits) >= 12:
        return f"+44 {digits[2:6]} {digits[6:]}"
    if digits.startswith('0') and len(digits) >= 10:
        return f"+44 {digits[1:5]} {digits[5:]}"
    return f"+{digits}" if not str(phone).strip().startswith('+') else str(phone).strip()


def brand_contact_fields(brand):
    brand = brand or {}
    email = str(brand.get('support_email') or '').strip()
    phone_raw = str(brand.get('support_phone') or '').strip()
    phone = format_uk_phone_display(phone_raw)
    website = str(brand.get('website') or '').strip()
    website_label = website.replace('https://', '').replace('http://', '').rstrip('/')
    display = str(brand.get('company_name') or _company_name()).strip()
    display = re.sub(r'\bLTD\b', 'Ltd', display, flags=re.I).rstrip('.,;: ').strip()
    legal = normalize_legal_name(brand.get('legal_name') or display)
    return {
        'display_name': display or _company_name(),
        'legal_name': legal,
        'email': email,
        'phone': phone,
        'phone_digits': re.sub(r'\D', '', phone_raw),
        'website': website,
        'website_label': website_label,
    }


def email_signature_text(brand):
    c = brand_contact_fields(brand)
    lines = [
        'Kind regards,',
        '',
        f"The {c['display_name']} Team",
        c['legal_name'],
    ]
    if c['email']:
        lines.append(c['email'])
    if c['phone']:
        lines.append(c['phone'])
    if c['website_label']:
        lines.append(c['website_label'])
    return '\n'.join(lines)


def email_signature_html(brand, *, align='left'):
    """Compact signature in the white body — never inside a giant navy footer."""
    c = brand_contact_fields(brand)
    align = 'left' if align != 'center' else 'center'
    ink = '#1d1d1f'
    muted = '#6e6e73'
    navy = '#003971'
    rows = [
        f'<p style="margin:0 0 12px;text-align:{align};font-family:{EMAIL_FONT_STACK};'
        f'font-size:15px;line-height:1.45;color:{ink};">Kind regards,</p>',
        f'<p style="margin:0;text-align:{align};font-family:{EMAIL_FONT_STACK};'
        f'font-size:15px;line-height:1.45;font-weight:600;color:{ink};">'
        f'The {html_escape(c["display_name"])} Team</p>',
        f'<p style="margin:2px 0 0;text-align:{align};font-family:{EMAIL_FONT_STACK};'
        f'font-size:14px;line-height:1.45;color:{muted};">{html_escape(c["legal_name"])}</p>',
    ]
    if c['email']:
        rows.append(
            f'<p style="margin:10px 0 0;text-align:{align};font-family:{EMAIL_FONT_STACK};'
            f'font-size:14px;line-height:1.45;">'
            f'<a href="mailto:{html_escape(c["email"])}" style="color:{navy};text-decoration:none;">'
            f'{html_escape(c["email"])}</a></p>'
        )
    if c['phone']:
        tel = c['phone_digits']
        rows.append(
            f'<p style="margin:4px 0 0;text-align:{align};font-family:{EMAIL_FONT_STACK};'
            f'font-size:14px;line-height:1.45;">'
            f'<a href="tel:+{html_escape(tel)}" style="color:{navy};text-decoration:none;">'
            f'{html_escape(c["phone"])}</a></p>'
        )
    if c['website'] and c['website_label']:
        rows.append(
            f'<p style="margin:4px 0 0;text-align:{align};font-family:{EMAIL_FONT_STACK};'
            f'font-size:14px;line-height:1.45;">'
            f'<a href="{html_escape(c["website"])}" style="color:{navy};text-decoration:none;">'
            f'{html_escape(c["website_label"])}</a></p>'
        )
    return '\n'.join(rows)


def email_disclaimer_html(note):
    text = str(note or '').strip()
    if not text:
        return ''
    return (
        f'<p style="margin:12px 0 0;text-align:left;font-family:{EMAIL_FONT_STACK};'
        f'font-size:11px;line-height:1.4;color:#86868b;">'
        f'{html_escape(text)}</p>'
    )


def bold_keywords_html(text, keywords=None):
    """Selective <strong> for key phrases — one hit each, no nested bold."""
    raw = str(text or '')
    if not raw:
        return ''
    ranges = []
    lower = raw.lower()
    for word in sorted({str(k).strip() for k in (keywords or []) if str(k).strip()}, key=len, reverse=True):
        needle = word.lower()
        start = 0
        while True:
            idx = lower.find(needle, start)
            if idx < 0:
                break
            end = idx + len(word)
            if any(not (end <= a or idx >= b) for a, b in ranges):
                start = end
                continue
            ranges.append((idx, end))
            break
    if not ranges:
        return html_escape(raw)
    ranges.sort()
    out = []
    cursor = 0
    for start, end in ranges:
        out.append(html_escape(raw[cursor:start]))
        out.append(
            f'<strong style="font-weight:600;color:#111827;">{html_escape(raw[start:end])}</strong>'
        )
        cursor = end
    out.append(html_escape(raw[cursor:]))
    return ''.join(out)


def email_high_alert_badge_html(label='Priority notice', title=''):
    """Refined red priority panel — letter-quality, not a marketing pill."""
    title_html = ''
    if str(title or '').strip():
        title_html = (
            f'<p style="margin:4px 0 0;font-family:{EMAIL_FONT_STACK};font-size:17px;line-height:1.3;'
            f'font-weight:600;letter-spacing:-0.01em;color:#111827;text-align:left;">'
            f'{html_escape(str(title).strip())}</p>'
        )
    return (
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        f'style="margin:0 0 10px;border-collapse:separate;">'
        f'<tr>'
        f'<td bgcolor="#fff7f7" style="background-color:#fff7f7;border-left:4px solid #b91c1c;'
        f'padding:8px 12px;">'
        f'<p style="margin:0;font-family:{EMAIL_FONT_STACK};font-size:10px;line-height:1.2;'
        f'font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#b91c1c;">'
        f'<font color="#b91c1c">⚠ {html_escape(label)}</font></p>'
        f'{title_html}'
        f'</td></tr></table>'
    )


def email_compliance_parts_html(blocks):
    """
    Premium advisory format: One clear issue heading, concise supporting paragraphs.
    NO "The issue / Why this matters / How we can help" subheadings.
    """
    parts_out = []
    for index, block in enumerate(blocks or []):
        title = str((block or {}).get('title') or 'Company record update').strip()
        issue_lines = (block or {}).get('issue_lines') or ('', '')
        cons_lines = (block or {}).get('consequence_lines') or ('', '')
        resolve_lines = (block or {}).get('resolve_lines') or ('', '')
        
        top = '0' if index == 0 else '24px'
        
        # Single clear issue heading (no red box warning blocks)
        heading = f"⚠️ {title}" if not title.startswith('⚠️') else title
        chunk = [
            f'<h3 style="margin:{top} 0 12px;font-family:{EMAIL_FONT_STACK};font-size:17px;line-height:1.4;'
            f'font-weight:600;letter-spacing:-0.01em;color:#111827;text-align:left;">'
            f'{html_escape(heading)}</h3>'
        ]
        
        # What did we notice?
        if issue_lines[0]:
            chunk.append(
                f'<p style="margin:0 0 12px;font-family:{EMAIL_FONT_STACK};font-size:15px;line-height:1.6;'
                f'color:#374151;text-align:left;">{html_escape(issue_lines[0])}'
                f'{" " + html_escape(issue_lines[1]) if issue_lines[1] else ""}</p>'
            )
            
        # Why might it matter?
        if cons_lines[0]:
            chunk.append(
                f'<p style="margin:0 0 12px;font-family:{EMAIL_FONT_STACK};font-size:15px;line-height:1.6;'
                f'color:#374151;text-align:left;">{html_escape(cons_lines[0])}'
                f'{" " + html_escape(cons_lines[1]) if cons_lines[1] else ""}</p>'
            )
            
        # What can be done / How can Brixen help?
        if resolve_lines[0]:
            chunk.append(
                f'<p style="margin:0 0 12px;font-family:{EMAIL_FONT_STACK};font-size:15px;line-height:1.6;'
                f'color:#374151;text-align:left;">{html_escape(resolve_lines[0])}'
                f'{" " + html_escape(resolve_lines[1]) if resolve_lines[1] else ""}</p>'
            )
            
        parts_out.append(''.join(chunk))
        
    return ''.join(parts_out)


def email_premium_header_html(wordmark_url=None, eyebrow='Client Compliance Update'):
    mark = html_escape(str(wordmark_url or '').strip())
    logo_cell = ''
    if mark:
        logo_cell = (
            f'<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:16px;">'
            f'<tr><td><img src="{mark}" alt="{html_escape(_company_name())}" width="120" '
            f'style="display:block;border:0;outline:none;text-decoration:none;width:120px;height:auto;"></td></tr>'
            f'</table>'
        )
    return f"""
          <tr>
            <td bgcolor="#ffffff" style="padding:24px 24px 16px;background:#ffffff;">
              {logo_cell}
              <p style="margin:0;font-family:{EMAIL_FONT_STACK};font-size:13px;line-height:1.4;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;color:#6b7280;">
                {html_escape(eyebrow)}
              </p>
            </td>
          </tr>"""



def email_graphic_footer_html(brand, wordmark_url=None, disclaimer=''):
    """
    Compact branded close: thin navy bar + website only.
    Contact details live in the signature — avoid a busy duplicate strip.
    """
    c = brand_contact_fields(brand)
    navy = '#003971'
    gold = '#c5a572'
    site = ''
    if c['website_label']:
        site = (
            f'<p style="margin:0;text-align:center;font-family:{EMAIL_FONT_STACK};font-size:12px;'
            f'line-height:1.6;color:#6e6e73;">'
            f'<a href="{html_escape(c["website"])}" style="color:{navy};text-decoration:none;">'
            f'{html_escape(c["website_label"])}</a></p>'
        )
    note = str(disclaimer or '').strip()
    note_html = (
        f'<p style="margin:10px 0 0;text-align:center;font-family:{EMAIL_FONT_STACK};'
        f'font-size:11px;line-height:1.45;color:#86868b;">{html_escape(note)}</p>'
        if note else ''
    )
    return f"""
          <tr>
            <td bgcolor="{navy}" style="height:3px;line-height:3px;font-size:0;background-color:{navy};">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" bgcolor="#f4f6f8" style="padding:10px 28px 12px;background-color:#f4f6f8;">
              {site}
              {note_html}
            </td>
          </tr>
          <tr><td bgcolor="{gold}" style="height:2px;line-height:2px;font-size:0;background-color:{gold};">&nbsp;</td></tr>
    """


def email_slim_brand_bar_html(gold='#c5a572'):
    """Thin brand accent only — not a signature block."""
    gold = html_escape(gold or '#c5a572')
    accent = brand_accent()
    if accent != BRIXEN_NAVY:
        # A company's own colour: one bar in its accent (Brixen keeps navy + gold)
        return (f'<tr><td bgcolor="{accent}" style="height:4px;line-height:4px;font-size:0;'
                f'background-color:{accent};">&nbsp;</td></tr>')
    return (
        f'<tr><td bgcolor="#003971" style="height:4px;line-height:4px;font-size:0;'
        f'background-color:#003971;">&nbsp;</td></tr>'
        f'<tr><td bgcolor="{gold}" style="height:2px;line-height:2px;font-size:0;'
        f'background-color:{gold};">&nbsp;</td></tr>'
    )


def email_cta_stack_html(buttons, apple_button_fn):
    """buttons: list of (url, label, background) with verified urls only."""
    parts = []
    for index, item in enumerate(buttons or []):
        if not item:
            continue
        url, label, background = item[0], item[1], (item[2] if len(item) > 2 else brand_accent())
        if not url or not label:
            continue
        gap = '<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>' if parts else ''
        parts.append(gap + apple_button_fn(url, label, background))
    return ''.join(parts)


def email_company_details_html(company_name, company_number=None):
    name = str(company_name or '').strip()
    number = str(company_number or '').strip()
    if not name and not number:
        return ''
    rows = []
    if name:
        rows.append(
            f'<p style="margin:0;font-family:{EMAIL_FONT_STACK};font-size:15px;line-height:1.6;color:#374151;">'
            f'Company: <strong style="font-weight:600;color:#111827;">{html_escape(name)}</strong></p>'
        )
    if number:
        rows.append(
            f'<p style="margin:0;font-family:{EMAIL_FONT_STACK};font-size:15px;line-height:1.6;color:#374151;">'
            f'Company number: {html_escape(number)}</p>'
        )
    inner = ''.join(rows)
    return f'<div style="margin:20px 0;">{inner}</div>'

def email_issue_card_html(blocks):
    """Issue → short explanation → action. Max one emoji per issue heading."""
    parts = []
    for index, block in enumerate(blocks or []):
        title = str((block or {}).get('title') or '').strip()
        explanation = str((block or {}).get('explanation') or '').strip()
        action = str((block or {}).get('action') or '').strip()
        if not title and not explanation:
            continue
        top = '0' if index == 0 else '18px'
        if title:
            heading = title if title.startswith('⚠️') else f'⚠️ {title}'
            parts.append(
                f'<p style="margin:{top} 0 0;font-family:{EMAIL_FONT_STACK};font-size:16px;'
                f'line-height:1.4;font-weight:600;color:#1d1d1f;text-align:left;">'
                f'{html_escape(heading)}</p>'
            )
            top = '8px'
        if explanation:
            parts.append(
                f'<p style="margin:{top} 0 0;font-family:{EMAIL_FONT_STACK};font-size:15px;'
                f'line-height:1.5;color:#6e6e73;text-align:left;">{html_escape(explanation)}</p>'
            )
            top = '8px'
        if action:
            parts.append(
                f'<p style="margin:{top} 0 0;font-family:{EMAIL_FONT_STACK};font-size:15px;'
                f'line-height:1.5;color:#1d1d1f;text-align:left;">{html_escape(action)}</p>'
            )
    return ''.join(parts)


# The company logo at the top of every client/team email. The bundled logo travels inside the email
# (cid:, attached by email_service), so it shows without the reader allowing remote images.
EMAIL_LOGO_CID = 'brand-logo'
# A Finstap company's own logo (Settings > Branding) inside an email, e.g. invoice emails
COMPANY_LOGO_CID = 'company-logo'
BUNDLED_LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                 'static', 'img', 'brixen-logo.png')


# ── Company look (Finstap: each company's own logo and accent colour; Brixen keeps navy and its logo) ──

BRIXEN_NAVY = '#003971'

# Hover lift for the glossy buttons, in mail apps that read <style> (Apple Mail, iOS Mail…)
GLASS_BUTTON_CSS = (
    '.glass-btn{transition:transform .18s ease,box-shadow .18s ease,filter .18s ease;}'
    '.glass-btn:hover{transform:translateY(-1px);filter:brightness(1.06);'
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 6px 14px rgba(17,24,39,.18)!important;}'
    '.glass-btn:active{transform:translateY(0) scale(.98);}'
)


def _in_workspace():
    from services.portal_compat import _workspace_name
    return bool(_workspace_name())


def brand_accent():
    """The company's accent colour (Settings > Branding) as #rrggbb; Brixen navy otherwise."""
    if not _in_workspace():
        return BRIXEN_NAVY
    from services.settings_service import get_setting
    accent = str(get_setting('accent_color') or '').strip()
    return accent if re.match(r'^#[0-9a-fA-F]{6}$', accent) else BRIXEN_NAVY


def _rgb(hex_colour):
    return tuple(int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))


def text_on(hex_colour):
    """White text on the colour, or near-black on a very light one."""
    r, g, b = _rgb(hex_colour)
    return '#111827' if (0.299 * r + 0.587 * g + 0.114 * b) > 186 else '#ffffff'


def shade(hex_colour, amount):
    """hex_colour mixed towards white (amount > 0) or black (amount < 0)."""
    target = 255 if amount > 0 else 0
    return '#' + ''.join(f'{round(c + (target - c) * abs(amount)):02x}' for c in _rgb(hex_colour))


def company_logo_image():
    """(image bytes, subtype) of a Finstap company's logo from Settings > Branding, or None (Brixen keeps
    its bundled logo; an SVG or ICO logo cannot go into emails)."""
    if not _in_workspace():
        return None
    from services.login_otp import _image_from_data_url
    from services.settings_service import get_setting
    return _image_from_data_url(get_setting('brand_logo'))


def email_button_html(url, label, colour=None):
    """A glossy pill button (Apple-style: soft top highlight, fine edge, coloured shadow) in the company's
    colour; mail apps that support it lift it on hover (GLASS_BUTTON_CSS)."""
    fill = colour if re.match(r'^#[0-9a-fA-F]{6}$', str(colour or '')) else brand_accent()
    r, g, b = _rgb(fill)
    return (
        f'<a href="{html_escape(str(url), quote=True)}" class="glass-btn" style="display:inline-block;'
        f'margin:0 8px 8px 0;padding:9px 18px;border-radius:999px;background-color:{fill};'
        f'background-image:linear-gradient(180deg,{shade(fill, 0.16)} 0%,{fill} 55%,{shade(fill, -0.06)} 100%);'
        f'border:1px solid {shade(fill, -0.18)};color:{text_on(fill)};font-family:{EMAIL_FONT_STACK};'
        f'font-size:13px;font-weight:600;letter-spacing:-0.01em;line-height:1;text-decoration:none;'
        f'box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 2px 6px rgba({r},{g},{b},.22);">'
        f'{html_escape(str(label))}</a>'
    )


def email_buttons_html(buttons):
    """A row of email_button_html for [(url, label) or (url, label, colour)]; '' when none has a url."""
    parts = [email_button_html(b[0], b[1], b[2] if len(b) > 2 else None) for b in (buttons or []) if b and b[0] and b[1]]
    return f'<div style="margin:18px 0 0;">{"".join(parts)}</div>' if parts else ''


def email_details_box_html(title, rows):
    """A light box with a small coloured title and label / value rows (empty values left out)."""
    rows = [(k, v) for k, v in (rows or []) if str(v or '').strip()]
    if not rows and not title:
        return ''
    body = ''.join(
        f'<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">{html_escape(str(k))}</td>'
        f'<td style="padding:6px 0 6px 16px;color:#111827;font-size:13px;font-weight:600;text-align:right;">'
        f'{html_escape(str(v))}</td></tr>' for k, v in rows)
    heading = (f'<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.04em;'
               f'text-transform:uppercase;color:{brand_accent()};">{html_escape(title)}</p>') if title else ''
    return (
        '<div style="margin:16px 0 0;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">'
        f'{heading}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        f'style="width:100%;border-collapse:collapse;margin:{8 if title else 0}px 0 0;">{body}</table></div>'
    )


def email_logo_src(brand):
    """<img src> for the brand logo: a full image URL from Settings, the bundled logo, or '' (name only)."""
    url = str((brand or {}).get('logo_url') or '').strip()
    if re.match(r'^https?://', url, re.I):
        return url
    if url.startswith('/static/img/') and os.path.isfile(BUNDLED_LOGO_PATH):
        return f'cid:{EMAIL_LOGO_CID}'
    return ''


def email_html_for_preview(html):
    """The bundled logo as an inline image, for showing a sent email in the browser (Email log); a company's
    own logo comes from its Settings > Branding."""
    company = f'cid:{COMPANY_LOGO_CID}'
    if html and company in html:
        from services.settings_service import get_setting
        html = html.replace(company, str(get_setting('brand_logo') or ''))
    marker = f'cid:{EMAIL_LOGO_CID}'
    if not html or marker not in html or not os.path.isfile(BUNDLED_LOGO_PATH):
        return html
    import base64
    with open(BUNDLED_LOGO_PATH, 'rb') as fh:
        data = base64.b64encode(fh.read()).decode('ascii')
    return html.replace(marker, f'data:image/png;base64,{data}')


def email_brand_header_html(brand, headline, logo_src=None, logo_height=36):
    """Hero row: the logo (or the company name when there is none) above the email's headline.
    logo_src (e.g. cid:brand-logo for a company's own logo sent with the email) replaces the Settings logo."""
    name = (brand or {}).get('company_name') or _company_name()
    if not logo_src and company_logo_image():
        # The company's own logo goes inside the email as cid:company-logo (email_service attaches it)
        logo_src, logo_height = f'cid:{COMPANY_LOGO_CID}', 44
    src = logo_src or email_logo_src(brand)
    if src:
        top = (f'<img src="{html_escape(src)}" alt="{html_escape(name)}" height="{logo_height}" '
               f'style="display:block;height:{logo_height}px;width:auto;max-width:220px;border:0;outline:none;'
               'text-decoration:none;">')
    else:
        top = (f'<p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;'
               f'color:{brand_accent()};font-weight:700;">{html_escape(name)}</p>')
    return (
        f'<tr><td style="padding:24px 24px 8px;background:#ffffff;">{top}'
        f'<h1 style="margin:{16 if src else 8}px 0 0;font-size:22px;line-height:1.3;color:#111827;">'
        f'{html_escape(headline)}</h1></td></tr>'
    )


def build_transactional_shell_html(
    *,
    subject,
    head_html,
    hero_html,
    body_inner_html,
    signature_html,
    disclaimer_html='',
    footer_html='',
    ivory='#f9fafb',
):
    closing = footer_html or email_slim_brand_bar_html()
    if 'glass-btn{' not in (head_html or '') and '</head>' in (head_html or ''):
        head_html = head_html.replace('</head>', f'<style>{GLASS_BUTTON_CSS}</style></head>')
    return f"""<!DOCTYPE html>
<html lang="en">
{head_html}
<body style="margin:0;padding:0;background:{ivory};font-family:{EMAIL_FONT_STACK};color:#111827;-webkit-font-smoothing:antialiased;width:100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="{ivory}" style="background:{ivory};padding:32px 0;width:100%;">
    <tr>
      <td align="center" style="padding:0 20px;">
        <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          {hero_html}
          <tr>
            <td align="left" class="email-pad" style="padding:0 24px 16px;background:#ffffff;word-break:break-word;text-align:left;">
              {body_inner_html}
            </td>
          </tr>
          <tr>
            <td align="left" class="email-pad" style="padding:16px 24px 24px;background:#ffffff;word-break:break-word;text-align:left;">
              {signature_html}
              {disclaimer_html}
            </td>
          </tr>
          {closing}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""



def email_signature_html(brand, *, align='left'):
    c = brand_contact_fields(brand)
    bname = c.get("brand_name") or c.get("display_name") or _company_name()
    cname = c.get("company_name") or c.get("legal_name") or _company_name()
    return (
        f'<div style="margin:24px 0 0;font-family:{EMAIL_FONT_STACK};font-size:15px;line-height:1.5;color:#374151;text-align:{align};">'
        f'<p style="margin:0 0 8px;font-weight:400;">Kind regards,</p>'
        f'<p style="margin:0;font-weight:600;color:#111827;">The {html_escape(bname)} Team</p>'
        f'<p style="margin:0;">{html_escape(cname)}</p>'
        f'<p style="margin:8px 0 0;font-size:14px;">'
        f'<a href="mailto:{html_escape(c["email"])}" style="color:{brand_accent()};text-decoration:none;">{html_escape(c["email"])}</a><br>'
        f'{html_escape(c["phone"])}<br>'
        f'<a href="{html_escape(c["website"])}" style="color:{brand_accent()};text-decoration:none;">{html_escape(c["website"])}</a>'
        f'</p></div>'
    )

def email_disclaimer_html(note):
    """Small, visually secondary disclaimer."""
    note = str(note or '').strip()
    if not note:
        return ''
    return (
        f'<div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid #e5e7eb;">'
        f'<p style="margin:0;font-family:{EMAIL_FONT_STACK};font-size:12px;line-height:1.5;color:#6b7280;text-align:left;">'
        f'{html_escape(note)}</p></div>'
    )
