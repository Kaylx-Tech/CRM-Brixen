"""Thin modular stand-ins for monolith app.py helpers used by compliance_alerts.
Keeps compliance runnable without importing the legacy app module.
"""
from db import query_db
from config import FRONTEND_URL, PORTAL_URL


def _workspace_name():
    """The company's own name inside a Finstap workspace (None for Brixen's own database)."""
    try:
        from tenancy import current_tenant
        tenant = current_tenant()
    except ImportError:
        return None
    if tenant and tenant.get('plan') != 'legacy':
        return tenant.get('name') or tenant.get('slug')
    return None


def brand_settings():
    """Who the emails, invoices and documents come from. Values come from the company's own Settings (their
    defaults are Brixen's only in Brixen's own database); a Finstap company never falls back to Brixen."""
    workspace = _workspace_name()
    try:
        from services.settings_service import get_setting
        name = get_setting('company_name') or get_setting('brand_name') or workspace or 'Our team'
        return {
            'company_name': name,
            'brand_name': get_setting('brand_name') or name,
            'legal_name': get_setting('legal_name') or name,
            'support_email': get_setting('support_email') or '',
            'support_phone': get_setting('support_phone') or '',
            # The public website in email signatures (not the CRM portal); a workspace without one shows its address
            'website': get_setting('wordpress_url') or get_setting('portal_url') or ('' if workspace else PORTAL_URL),
            # Unset: the settings default (Brixen's bundled logo; none for a new Finstap workspace)
            'logo_url': get_setting('logo_url'),
        }
    except Exception:
        name = workspace or 'Our team'
        return {'company_name': name, 'brand_name': name, 'legal_name': name, 'support_email': '',
                'support_phone': '', 'website': '', 'logo_url': ''}


def brand_name():
    """The company's display name for emails and documents (never Brixen inside a Finstap workspace)."""
    return brand_settings().get('company_name') or 'Our team'


def portal_base_url():
    try:
        from services.settings_service import get_setting
        return (get_setting('portal_url') or PORTAL_URL or FRONTEND_URL).rstrip('/')
    except Exception:
        return (PORTAL_URL or FRONTEND_URL).rstrip('/')


def companies_house_company_url(company_number):
    number = str(company_number or '').strip().upper()
    if not number:
        return 'https://find-and-update.company-information.service.gov.uk/'
    return f'https://find-and-update.company-information.service.gov.uk/company/{number}'


def is_pending_company_number(company_number):
    text = str(company_number or '').strip().lower()
    if not text:
        return True
    return text.startswith('pending') or text in ('n/a', 'na', '-', 'tbc')


def resolve_client_user(user_id):
    if not user_id:
        return None
    return query_db(
        "SELECT id, email, full_name, phone, role, status, client_type, is_b2b FROM users WHERE id = ? LIMIT 1;",
        (user_id,),
        one=True,
    )


def company_attention_issues(company):
    """Companies House attention (stored sync result + stored due dates) plus KYC / PSC issues."""
    from services.ch_attention import company_attention_issues as ch_issues
    if not company:
        return []
    issues = list(ch_issues(dict(company)))
    identity = str(company.get('identity_verified') or '').strip()
    if identity == 'Failed':
        issues.append({
            'code': 'identity_failed',
            'title': 'Identity verification requires attention',
            'detail': 'KYC / identity verification failed and needs client action.',
        })
    psc = str(company.get('psc_verified') or '').strip()
    if psc in ('Failed', 'Update required'):
        issues.append({
            'code': 'psc_attention',
            'title': 'PSC verification requires attention',
            'detail': f'PSC status is {psc}.',
        })
    return issues


def build_client_notification_email(client, headline, intro, **kwargs):
    """Compliance alerts and other client notices in the same design as every email: the company's logo,
    the headline, the message (structured_html when given, e.g. compliance issue blocks), glossy buttons
    in the company's colour, signature and footer note. Returns (subject, text, html)."""
    from html import escape as html_escape
    from services import email_engine as eng
    subject = kwargs.get('subject') or headline
    badge = kwargs.get('badge') or ''
    extra = kwargs.get('extra_message') or ''
    structured = kwargs.get('structured_html') or ''
    cta_label = kwargs.get('cta_label') or ''
    cta_url = kwargs.get('cta_url') or ''
    footer_note = kwargs.get('footer_note') or ''
    greeting = kwargs.get('greeting_name') or (client or {}).get('full_name') or 'there'
    if ' ' in str(greeting):
        greeting = str(greeting).split()[0]

    body_text = f"Hello {greeting},\n\n{intro}\n\n{extra}\n"
    if cta_url:
        body_text += f"\n{cta_label or 'Open link'}: {cta_url}\n"
    if kwargs.get('extra_cta_url'):
        body_text += f"\n{kwargs.get('extra_cta_label') or 'Open link'}: {kwargs['extra_cta_url']}\n"
    if footer_note:
        body_text += f"\n{footer_note}\n"

    accent = eng.brand_accent()
    # The intro may already greet the client ("Hi Sam,<br><br>…"); otherwise it gets "Hello …,"
    greets = str(intro).lstrip().lower().startswith(('hi ', 'hello ', 'dear '))
    parts = [
        '' if greets else (f'<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#111827;">'
                           f'Hello {html_escape(str(greeting))},</p>'),
        (f'<p style="margin:0 0 12px;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;'
         f'background:{eng.shade(accent, 0.88)};color:{accent};font-size:12px;font-weight:700;letter-spacing:0.02em;">'
         f'{html_escape(badge)}</span></p>') if badge else '',
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">{intro}</p>',
        structured or (f'<p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">'
                       f'{html_escape(extra).replace(chr(10), "<br>")}</p>' if extra else ''),
        eng.email_details_box_html('', [('Company', kwargs.get('company_name')),
                                        ('Company number', kwargs.get('company_number'))]),
        eng.email_buttons_html([(cta_url, cta_label or 'Continue'),
                                (kwargs.get('extra_cta_url'), kwargs.get('extra_cta_label') or 'Open',
                                 kwargs.get('extra_cta_background'))]),
    ]
    brand = brand_settings()
    brand_for_sig = {**brand, 'legal_name': brand.get('legal_name') or brand.get('company_name')}
    body_html = eng.build_transactional_shell_html(
        subject=subject,
        head_html=f'<head><meta charset="utf-8"><title>{html_escape(subject)}</title></head>',
        hero_html=eng.email_brand_header_html(brand, headline),
        body_inner_html=''.join(p for p in parts if p),
        signature_html=eng.email_signature_html(brand_for_sig),
        disclaimer_html=eng.email_disclaimer_html(footer_note),
    )
    return subject, body_text, body_html


class EmailService:
    @staticmethod
    def send_notification_email(recipient, subject, body_text, body_html=None):
        from services.email_service import send_email
        ok = send_email(recipient, subject, body_html or body_text, text_content=body_text, category='COMPLIANCE')
        return ok, 'sent' if ok else 'SMTP send failed or not configured'
