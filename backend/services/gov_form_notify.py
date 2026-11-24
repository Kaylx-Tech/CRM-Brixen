"""A Gov Form marked Filed (services/gov_forms.py calls filed()): the client hears about it and gets the form.

  * The filled-in Companies House form (in the company's Documents) becomes visible in the client's portal.
  * The client gets one email and an in-app notice: which form was filed for which company, the order it completed,
    and where to find the form (the order's client, else the company's account holder; as order emails do).
  * The team gets "Order completed" when the form completed an order.
Nothing here stops the filing: a failed email is only logged.
"""
from db import execute_db, query_db
from services.gov_forms_templates import FORMS


def filed(filing, user=None):
    code = filing['form_code']
    title = FORMS.get(code, {}).get('title') or code
    actor = (user or {}).get('id')
    try:
        if filing.get('document_id'):
            execute_db("UPDATE documents SET client_visible = 1, order_id = COALESCE(order_id, ?) WHERE id = ?;",
                       (filing.get('order_id'), filing['document_id']))
        from services import client_mail
        from services.client_mail import _order_context, notify_client
        brand = (client_mail.brand_name() if hasattr(client_mail, 'brand_name')
                 else (client_mail.brand_settings().get('company_name') or ''))
        order, company = _order_context(filing['order_id']) if filing.get('order_id') else (None, None)
        row = query_db("SELECT id, user_id, name, registered_email FROM companies WHERE id = ?;",
                       (filing['company_id'],), one=True)
        row = dict(row or {})
        if not company and row:
            company = {'id': row['id'], 'name': row.get('name'), 'registered_email': row.get('registered_email')}
        user_id = (order or {}).get('user_id') or row.get('user_id')
        name = str((company or {}).get('name') or 'your company').strip()
        number = (order or {}).get('order_number')
        if user_id:
            points = [f'✅ {code} {title}', f'🏢 {name}']
            if number:
                points.append(f'📦 Order {number} is complete')
            points.append('📁 The filed form is in your documents')
            details = [('Company', name), ('Form', f'{code}: {title}')]
            if number:
                details.append(('Order', number))
            notify_client(
                user_id, title=f'{code} filed with Companies House', headline=f'Your {code} has been filed',
                message=f'Good news: {title} for {name} has been filed with Companies House.',
                ntype='order_complete', link='/documents',
                subject=f"{code} filed with Companies House: {name}{f' — {brand}' if brand else ''}", points=points,
                details=details, cta_label='View your documents', category='COMPLIANCE',
                company=company, order=order, triggered_by=actor, account_owner=True)
        if order:
            from services.notification_service import notify_staff
            notify_staff('Order completed',
                         f"Order {number or order.get('id')} ({order.get('service_name') or 'order'}) is completed: "
                         f"{code} filed.", 'order_complete', '/admin/orders', exclude_user_id=actor)
    except Exception as exc:
        print(f"[Gov forms] filed {code} {filing.get('id')}: client not told: {exc}")
