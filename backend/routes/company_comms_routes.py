"""A company's emails, reminders and offers, for its Emails & Reminders tab (team only).

  GET  /api/admin/companies/<id>/communications → {reminders: {...}, emails: [...], offers: [...] | null}
  POST /api/admin/companies/<id>/send-reminder  → send the compliance reminder now (services/compliance_alerts.py)

emails: every email the Email log has for the company or its client (newest first);
reminders: whether automatic compliance reminders are on, where they go, this company's problems and its reminder
history; offers: Offer to Fix offers (Companies › Attention), where the CRM has them.
"""
import re

from db import query_db
from utils.response import error_response, success_response

TEAM_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
BLOCKED_TEXT = {
    'NO_VALID_EMAIL': 'The company has no usable email: add one on the Overview tab.',
    'UNVERIFIED_EMAIL': 'Only verified emails get reminders (Settings › Compliance).',
    'INVALID_EMAIL': 'The test email in Settings › Compliance is not valid.',
    'NO_ISSUES': 'Companies House shows nothing that needs doing.',
}


def _company(comp_id):
    row = query_db("SELECT * FROM companies WHERE id = ? LIMIT 1;", (comp_id,), one=True)
    return dict(row) if row else None


def _emails(company):
    from services import email_tracking
    email_tracking.ensure()
    rows = query_db("""
        SELECT id, recipient, subject, status, category, last_error, created_at, sent_at,
               opened_at, last_opened_at, open_count, clicked_at, click_count,
               CASE WHEN track_token IS NOT NULL THEN 1 ELSE 0 END AS tracked
        FROM email_outbox
        WHERE company_id = ? OR (company_id IS NULL AND ? IS NOT NULL AND user_id = ?)
        ORDER BY id DESC LIMIT 100;
    """, (company['id'], company.get('user_id'), company.get('user_id'))) or []
    return [dict(r) for r in rows]


def _offers(company_id):
    try:
        from services import attention_offers
    except ImportError:
        return None  # this CRM has no Offer to Fix
    attention_offers._ensure()
    rows = query_db("SELECT id, service_name, channel, recipient, status, sent_at, opened_at, accepted_at, order_id, "
                    "sent_by_name, followups, last_followup_at, contact_number, contact_requested_at FROM attention_offers WHERE company_id = ? "
                    "ORDER BY id DESC LIMIT 30;", (company_id,)) or []
    return [dict(r) for r in rows]


def _reminders(company):
    from services import compliance_alerts as ca
    settings = ca.compliance_alert_settings()
    recipient, problem = ca.resolve_compliance_recipient(company, settings)
    issues = ca.collect_compliance_attention_issues(company) or []
    return {
        'enabled': settings['enabled'],
        'interval_hours': settings['interval_hours'],
        'test_mode': settings['test_mode'],
        'recipient': recipient or '',
        'recipient_problem': BLOCKED_TEXT.get(problem, problem or ''),
        'issues': ca.issue_summary_lines(issues) if issues else [],
        'history': ca.compliance_notification_history(company['id'], limit=30),
    }


def handle_company_comms_routes(environ, start_response, path, method, user, body, query):
    m = re.match(r'^/api/admin/companies/(\d+)/(communications|send-reminder)$', path)
    if not m:
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if str(user.get('role') or '').upper() not in TEAM_ROLES:
        return error_response(start_response, "For the team only", status_code=403)
    company = _company(int(m.group(1)))
    if not company:
        return error_response(start_response, "Company not found", status_code=404)

    if m.group(2) == 'communications' and method == 'GET':
        return success_response(start_response, data={
            'reminders': _reminders(company), 'emails': _emails(company), 'offers': _offers(company['id'])})

    if m.group(2) == 'send-reminder' and method == 'POST':
        from services.compliance_alerts import send_compliance_attention_email
        result = send_compliance_attention_email(company, force=True, actor=user, trigger_source='staff')
        if not result.get('ok'):
            reason = result.get('blocked_reason') or 'Not sent'
            return error_response(start_response, BLOCKED_TEXT.get(reason, f"Not sent: {reason}"), status_code=400)
        return success_response(start_response, data={'recipient': result.get('recipient')},
                                message=f"Reminder sent to {result.get('recipient')}.")
    return error_response(start_response, "Not found", status_code=404)
