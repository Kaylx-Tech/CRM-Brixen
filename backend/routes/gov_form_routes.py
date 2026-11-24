"""Gov Forms (services/gov_forms.py), for the team:

  GET  /api/admin/gov-forms                              → the forms
  GET  /api/admin/gov-forms/<code>?company_id=           → the form filled in for that company (+ its saved ones)
  POST /api/admin/gov-forms/<code>/check {company_id, values}                 → {errors}
  POST /api/admin/gov-forms/<code>/save {company_id, values, status, filing_id?} → draft / ready / filed
  GET  /api/admin/gov-forms/filings?company_id=          → saved forms
  GET  /api/admin/gov-forms/filings/<id>/sheet           → the Filing Sheet PDF
  GET  /api/admin/gov-forms/queue                        → orders that need a form (services/gov_form_orders.py)
  GET  /api/admin/gov-forms/orders                       → recent orders to choose for a form
  GET  /api/admin/gov-forms/services                     → every service and its form
  POST /api/admin/gov-forms/services {service_id, form_code|null} → set a service's form (admins)
"""
import re

from utils.response import success_response, error_response

TEAM_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')


def _q(query, key):
    value = (query or {}).get(key) or ['']
    return str(value[0] if isinstance(value, list) else value).strip()


def _company_id(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def handle_gov_form_routes(environ, start_response, path, method, user, body, query):
    if not (path == '/api/admin/gov-forms' or path.startswith('/api/admin/gov-forms/')):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if str(user.get('role') or '').upper() not in TEAM_ROLES:
        return error_response(start_response, "For the team only", status_code=403)
    from services import gov_forms
    body = body if isinstance(body, dict) else {}
    try:
        if path == '/api/admin/gov-forms' and method == 'GET':
            return success_response(start_response, data={'forms': gov_forms.forms_list()})
        from services import gov_form_orders
        if path == '/api/admin/gov-forms/queue' and method == 'GET':
            return success_response(start_response, data={'items': gov_form_orders.queue()})
        if path == '/api/admin/gov-forms/orders' and method == 'GET':
            return success_response(start_response, data={'orders': gov_form_orders.pick_list()})
        if path == '/api/admin/gov-forms/services' and method == 'GET':
            return success_response(start_response, data={'services': gov_form_orders.services_map()})
        if path == '/api/admin/gov-forms/services' and method == 'POST':
            if str(user.get('role') or '').upper() not in ('SUPER_ADMIN', 'ADMIN'):
                return error_response(start_response, "Only an admin can change this", status_code=403)
            sid = _company_id(body.get('service_id'))
            if not sid:
                return error_response(start_response, "Choose a service", status_code=400)
            try:
                gov_form_orders.set_service_form(sid, body.get('form_code'))
            except ValueError as exc:
                return error_response(start_response, str(exc), status_code=400)
            return success_response(start_response, data={'services': gov_form_orders.services_map()},
                                    message="Saved.")
        if path == '/api/admin/gov-forms/filings' and method == 'GET':
            return success_response(start_response,
                                    data={'filings': gov_forms.filings(_company_id(_q(query, 'company_id')))})
        sheet = re.match(r'^/api/admin/gov-forms/filings/(\d+)/sheet$', path)
        if sheet and method == 'GET':
            filing, pdf = gov_forms.sheet_for_filing(int(sheet.group(1)), user)
            name = f"{filing['form_code']}-filing-sheet-{filing['id']}.pdf"
            start_response('200 OK', [('Content-Type', 'application/pdf'), ('Content-Length', str(len(pdf))),
                                      ('Content-Disposition', f'attachment; filename="{name}"')])
            return [pdf]
        one = re.match(r'^/api/admin/gov-forms/([A-Za-z0-9]{2,8})(/check|/save)?$', path)
        if one:
            code, action = one.group(1).upper(), one.group(2) or ''
            company_id = _company_id(_q(query, 'company_id') if method == 'GET' else body.get('company_id'))
            if not company_id:
                return error_response(start_response, "Choose a company first", status_code=400)
            if not action and method == 'GET':
                return success_response(start_response, data=gov_forms.prepare(
                    code, company_id, _company_id(_q(query, 'order_id'))))
            if action == '/check' and method == 'POST':
                errors = gov_forms.check(code, body.get('values'), gov_forms.context(company_id))
                return success_response(start_response, data={'errors': errors},
                                        message="All good." if not errors else "Some answers need a look.")
            if action == '/save' and method == 'POST':
                filing, errors = gov_forms.save(code, company_id, body.get('values'), body.get('status'), user,
                                                _company_id(body.get('filing_id')), _company_id(body.get('order_id')))
                if errors:
                    return error_response(start_response, "Some answers need a look before it is ready.",
                                          status_code=400, details={'errors': errors})
                messages = {'draft': 'Draft saved.',
                            'ready': 'Ready: the Filing Sheet is in Documents and a task to file it was made.',
                            'filed': 'Marked as filed.' + (' The order is completed.' if filing.get('order_id') else '')}
                return success_response(start_response, data=filing, message=messages.get(filing['status']))
    except gov_forms.FormError as exc:
        return error_response(start_response, str(exc), status_code=400)
    return error_response(start_response, "Not found", status_code=404)
