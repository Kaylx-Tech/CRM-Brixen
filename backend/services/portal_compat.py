"""Thin modular stand-ins for monolith app.py helpers used by compliance_alerts.
Keeps compliance runnable without importing the legacy app module.
"""
from db import query_db
from config import FRONTEND_URL, PORTAL_URL


def brand_settings():
    try:
        from services.settings_service import get_setting
        return {
            'company_name': get_setting('company_name', 'Brixen Consultants'),
            'brand_name': get_setting('brand_name', 'Brixen Consultants'),
            'support_email': get_setting('support_email', 'contact@brixenconsultants.com'),
            'support_phone': get_setting('support_phone', ''),
            # The public website in email signatures (not the CRM portal); a workspace without one shows its address
            'website': get_setting('wordpress_url') or get_setting('portal_url', PORTAL_URL) or 'https://brixenconsultants.com',
            # Unset: the settings default (Brixen's bundled logo; none for a new Finstap workspace)
            'logo_url': get_setting('logo_url'),
        }
    except Exception:
        return {
            'company_name': 'Brixen Consultants',
            'brand_name': 'Brixen Consultants',
            'support_email': 'contact@brixenconsultants.com',
            'support_phone': '',
            'website': 'https://brixenconsultants.com',
            'logo_url': '',
        }


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
    """Simple HTML/text email builder used by compliance render path."""
    subject = kwargs.get('subject') or headline
    badge = kwargs.get('badge') or ''
    extra = kwargs.get('extra_message') or ''
    cta_label = kwargs.get('cta_label') or ''
    cta_url = kwargs.get('cta_url') or ''
    footer_note = kwargs.get('footer_note') or ''
    greeting = kwargs.get('greeting_name') or (client or {}).get('full_name') or 'there'
    if ' ' in str(greeting):
        greeting = str(greeting).split()[0]

    body_text = f"Hello {greeting},\n\n{intro}\n\n{extra}\n"
    if cta_url:
        body_text += f"\n{cta_label or 'Open link'}: {cta_url}\n"
    if footer_note:
        body_text += f"\n{footer_note}\n"

    parts = [
        f"<p>Hello {greeting},</p>",
        f"<p><strong>{badge}</strong></p>" if badge else '',
        f"<p>{intro}</p>",
        f"<div>{extra.replace(chr(10), '<br>')}</div>" if extra else '',
    ]
    if cta_url:
        parts.append(
            f'<p><a href="{cta_url}" style="display:inline-block;padding:10px 16px;'
            f'background:#003971;color:#fff;text-decoration:none;border-radius:6px;">'
            f'{cta_label or "Continue"}</a></p>'
        )
    if footer_note:
        parts.append(f'<p style="color:#6b7280;font-size:12px;">{footer_note}</p>')
    body_html = ''.join(p for p in parts if p)
    return subject, body_text, body_html


class EmailService:
    @staticmethod
    def send_notification_email(recipient, subject, body_text, body_html=None):
        from services.email_service import send_email
        ok = send_email(recipient, subject, body_html or body_text, text_content=body_text, category='COMPLIANCE')
        return ok, 'sent' if ok else 'SMTP send failed or not configured'
