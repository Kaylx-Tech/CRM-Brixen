"""Product & Service Catalog Routes (/api/catalog)
Decoupled & Database-Driven architecture.
"""
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response
import json
import re

# Optional fallback catalog import (never crashes if missing)
try:
    from services import product_catalog_config
    _HAS_CATALOG_CONFIG = True
except Exception:
    product_catalog_config = None
    _HAS_CATALOG_CONFIG = False

DEFAULT_DOCUMENT_REQUIREMENTS = [
    {
        "id": "id_document",
        "name": "ID Document (Passport / Driving Licence)",
        "description": "Valid photo ID. Accepted: PDF, JPG, PNG.",
        "required": True,
        "allowed_extensions": [".pdf", ".jpg", ".jpeg", ".png"]
    },
    {
        "id": "proof_of_address",
        "name": "Proof of Address (Utility bill / Bank statement)",
        "description": "Issued within the last 3 months.",
        "required": True,
        "allowed_extensions": [".pdf", ".jpg", ".jpeg", ".png"]
    }
]

# text = input box, file = document upload, radio = one choice from options,
# checkbox = tick box that opens its own sub-form (`fields`) when ticked
# company = name/number checked against Companies House (registered -> official name, else proposed name)
# company_name = proposed new name checked for availability at Companies House
FORM_FIELD_TYPES = ('text', 'file', 'radio', 'checkbox', 'company', 'company_name')
SUB_FORM_TYPES = ('text', 'file', 'radio', 'company', 'company_name')   # no checkbox inside a sub-form
MAX_FORM_FIELDS = 30
MAX_RADIO_OPTIONS = 20


def _clean_field_list(raw, allowed_types, used_ids, path=''):
    """Validate one level of fields. Returns (fields, error)."""
    if len(raw) > MAX_FORM_FIELDS:
        return None, f"An order form can have at most {MAX_FORM_FIELDS} fields{path}"
    fields = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = str(item.get('label') or '').strip()[:120]
        if not label:
            return None, f"Every form field needs a label{path}"
        ftype = str(item.get('type') or 'text').strip().lower()
        if ftype not in allowed_types:
            return None, f"Field '{label}' has a type that is not allowed here"
        base = re.sub(r'[^a-z0-9]+', '_', str(item.get('id') or label).lower()).strip('_')[:40] or 'field'
        fid, n = base, 2
        while fid in used_ids:
            fid, n = f"{base}_{n}", n + 1
        used_ids.add(fid)
        field = {
            'id': fid,
            'label': label,
            'type': ftype,
            'required': bool(item.get('required')),
            'placeholder': str(item.get('placeholder') or '').strip()[:160] if ftype in ('text', 'company', 'company_name') else '',
        }
        if ftype == 'radio':
            # option_fields[i] = fields asked when options[i] is chosen (only on top-level questions)
            raw_branches = item.get('option_fields') if isinstance(item.get('option_fields'), list) else []
            options, branches = [], []
            for i, opt in enumerate(item.get('options') or []):
                text = str(opt or '').strip()[:80]
                if not text or text in options:
                    continue
                options.append(text)
                sub_raw = raw_branches[i] if i < len(raw_branches) and isinstance(raw_branches[i], list) else []
                if sub_raw and path:
                    return None, f"Question '{label}' is inside a sub-form, so its answers cannot open more fields"
                sub, err = _clean_field_list(sub_raw, SUB_FORM_TYPES, used_ids, f" (inside '{label}: {text}')")
                if err:
                    return None, err
                branches.append(sub)
            if len(options) < 2:
                return None, f"Question '{label}' needs at least 2 options"
            if len(options) > MAX_RADIO_OPTIONS:
                return None, f"Question '{label}' can have at most {MAX_RADIO_OPTIONS} options"
            field['options'] = options
            if any(branches):
                field['option_fields'] = branches
        if ftype == 'checkbox':
            children = item.get('fields') or []
            if not isinstance(children, list):
                return None, f"Checkbox '{label}' has an invalid sub-form"
            sub, err = _clean_field_list(children, SUB_FORM_TYPES, used_ids, f" (inside '{label}')")
            if err:
                return None, err
            field['fields'] = sub
        fields.append(field)
    return fields, None


def clean_form_fields(raw):
    """Validate the order-form builder input. Returns (fields, error)."""
    if raw in (None, ''):
        return [], None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return None, "Order form is not valid"
    if isinstance(raw, dict):
        raw = raw.get('fields') or []
    if not isinstance(raw, list):
        return None, "Order form is not valid"
    return _clean_field_list(raw, FORM_FIELD_TYPES, set())


def form_fields_of(service_row):
    """The order-form fields saved on a service (empty list when none)."""
    fields, _err = clean_form_fields((service_row or {}).get('form_config_json'))
    return fields or []


def handle_catalog_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/catalog and /api/admin/services endpoints."""
    if not (path.startswith('/api/catalog') or path.startswith('/api/admin/services')):
        return None

    user_role = (user or {}).get('role', 'CLIENT')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    def _require_staff():
        if not user:
            return error_response(start_response, "Authentication required", 401)
        if not is_staff:
            return error_response(start_response, "Insufficient permissions", 403)
        return None

    # ── GET /api/catalog/products or /services (and /api/admin/services) ──
    if path in ('/api/catalog/products', '/api/catalog/services', '/api/admin/services') and method == 'GET':
        # Staff catalog UI needs Inactive rows too; public/client listing stays Active-only
        status_clause = "" if is_staff else "WHERE status = 'Active'"
        try:
            db_services = query_db(f"""
                SELECT id, name, description, category, price, duration,
                       vat_rate, estimated_delivery_time, status, cost_price, form_config_json
                FROM services
                {status_clause}
                ORDER BY category ASC, price ASC;
            """)
        except Exception:
            db_services = []

        if db_services:
            products = []
            for s in db_services:
                item = dict(s)
                item['form_fields'] = form_fields_of(item)
                item.pop('form_config_json', None)
                if user_role not in ('SUPER_ADMIN', 'ADMIN'):
                    item.pop('cost_price', None)   # buy price / profit: admins only (the team sees the sell price)
                products.append(item)
            return success_response(start_response, data=products)

        # 2. Fallback to product_catalog_config if DB services table is empty
        if _HAS_CATALOG_CONFIG and hasattr(product_catalog_config, 'PRODUCT_FORM_CONFIGS'):
            products = []
            for name, cfg in product_catalog_config.PRODUCT_FORM_CONFIGS.items():
                products.append({
                    "name": name,
                    "fields_count": len(cfg.get('fields', [])),
                    "has_documents": len(cfg.get('document_requirements', [])) > 0
                })
            return success_response(start_response, data=products)

        return success_response(start_response, data=[])

    # ── POST /api/catalog/services or /api/admin/services ─────────────────
    if path in ('/api/catalog/services', '/api/admin/services') and method == 'POST':
        denied = _require_staff()
        if denied:
            return denied
        if user.get('role') not in ('SUPER_ADMIN', 'ADMIN'):
            return error_response(start_response, "Only an admin can add services.", 403)

        name = body.get('name', '').strip()
        category = body.get('category', 'Corporate')
        description = body.get('description', '')
        duration = body.get('duration', '12 Months')

        if not name:
            return error_response(start_response, "Service name is required", 400)

        try:
            price = float(body.get('sellPrice') if body.get('sellPrice') not in (None, '') else body.get('price', 0) or 0)
            cost_price = float(body.get('originalPrice') if body.get('originalPrice') not in (None, '') else body.get('cost_price', 0) or 0)
        except (TypeError, ValueError):
            return error_response(start_response, "Sell price and original price must be valid numbers", 400)

        if price < 0 or cost_price < 0:
            return error_response(start_response, "Prices cannot be negative", 400)

        form_fields, form_err = clean_form_fields(body.get('form_fields'))
        if form_err:
            return error_response(start_response, form_err, 400)

        try:
            sid = execute_db("""
                INSERT INTO services (name, description, category, price, duration, cost_price, status, form_config_json)
                VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)
            """, (name, description, category, price, duration, cost_price,
                  json.dumps({'fields': form_fields}) if form_fields else None))
            return success_response(start_response, data={"id": sid}, message="Service created successfully")
        except Exception as e:
            return error_response(start_response, f"Failed to create service: {str(e)}", 500)

    # ── POST /api/catalog/services/bulk-delete ───────────────────────────────
    if path in ('/api/catalog/services/bulk-delete', '/api/admin/services/bulk-delete') and method == 'POST':
        denied = _require_staff()
        if denied:
            return denied
        if user.get('role') not in ('SUPER_ADMIN', 'ADMIN'):
            return error_response(start_response, "Bulk deletion is restricted to Administrator accounts only.", 403)

        service_ids = body.get('service_ids', [])
        if not isinstance(service_ids, list) or len(service_ids) == 0:
            return error_response(start_response, "service_ids array is required", 400)

        deleted = 0
        for sid in service_ids:
            try:
                sid = int(sid)
                execute_db("UPDATE orders SET service_id = NULL WHERE service_id = ?;", (sid,))
                execute_db("DELETE FROM services WHERE id = ?;", (sid,))
                deleted += 1
            except Exception:
                continue

        return success_response(start_response, message=f"Successfully deleted {deleted} service(s).", data={"deleted": deleted})

    # ── PUT/PATCH/DELETE /api/catalog/services/<id> and /api/admin/services/<id>
    match_svc = re.match(r'^/api/(?:catalog/services|admin/services)/(\d+)$', path)
    if match_svc and method in ('PUT', 'PATCH', 'DELETE'):
        denied = _require_staff()
        if denied:
            return denied
        sid = int(match_svc.group(1))
        existing = query_db("SELECT * FROM services WHERE id = ? LIMIT 1;", (sid,), one=True)
        if not existing:
            return error_response(start_response, "Service not found", 404)

        # Prices and products sync to the website, so only admins change the catalog (old portal rule)
        if user.get('role') not in ('SUPER_ADMIN', 'ADMIN'):
            return error_response(start_response, "Only an admin can change services.", 403)

        if method == 'DELETE':
            execute_db("UPDATE orders SET service_id = NULL WHERE service_id = ?;", (sid,))
            execute_db("DELETE FROM services WHERE id = ?;", (sid,))
            return success_response(start_response, message="Service deleted.", data={"service_id": sid})

        name = (body.get('name') if 'name' in body else existing.get('name') or '').strip()
        description = (body.get('description') if 'description' in body else existing.get('description') or '').strip()
        category = (body.get('category') if 'category' in body else existing.get('category') or '').strip() or 'Corporate'
        duration = (body.get('duration') if 'duration' in body else existing.get('duration') or '').strip() or '12 Months'
        if not name:
            return error_response(start_response, "Service name is required", 400)

        try:
            if 'sellPrice' in body or 'price' in body:
                price = float(body.get('sellPrice') if body.get('sellPrice') not in (None, '') else body.get('price', 0) or 0)
            else:
                price = float(existing.get('price') or 0)
            if 'originalPrice' in body or 'cost_price' in body:
                cost_price = float(body.get('originalPrice') if body.get('originalPrice') not in (None, '') else body.get('cost_price', 0) or 0)
            else:
                cost_price = float(existing.get('cost_price') or 0)
        except (TypeError, ValueError):
            return error_response(start_response, "Prices must be valid numbers", 400)

        if price < 0 or cost_price < 0:
            return error_response(start_response, "Prices cannot be negative", 400)

        status_raw = body.get('status') if 'status' in body else existing.get('status')
        status = 'Active' if str(status_raw or 'Active').strip().lower() in ('active', 'publish', '1', 'true') else 'Inactive'

        form_json = existing.get('form_config_json')
        if 'form_fields' in body:
            form_fields, form_err = clean_form_fields(body.get('form_fields'))
            if form_err:
                return error_response(start_response, form_err, 400)
            form_json = json.dumps({'fields': form_fields}) if form_fields else None

        execute_db("""
            UPDATE services
            SET name = ?, description = ?, category = ?, price = ?, cost_price = ?, duration = ?, status = ?,
                form_config_json = ?
            WHERE id = ?;
        """, (name, description or name, category, price, cost_price, duration, status, form_json, sid))
        updated = query_db("SELECT * FROM services WHERE id = ?;", (sid,), one=True)

        # Push only what changed to the linked WooCommerce product (CRM is the source of truth)
        changes = {}
        if name != (existing.get('name') or '').strip():
            changes['name'] = name
        if (description or name) != (existing.get('description') or '').strip():
            changes['description'] = description or name
        if abs(price - float(existing.get('price') or 0)) > 0.004:
            changes['price'] = price
        if status != (existing.get('status') or 'Active'):
            changes['active'] = status == 'Active'
        message = "Service updated."
        website = None
        if changes and str(existing.get('woocommerce_product_id') or '').strip().isdigit():
            from services import wordpress_service
            website = wordpress_service.update_woo_product(existing['woocommerce_product_id'], changes)
            if website.get('ok') and not website.get('skipped'):
                message = "Service updated here and on the website."
            elif not website.get('ok') and not website.get('skipped'):
                message = f"Service updated in the CRM, but the website was not updated: {website.get('message')}"
            try:
                from services.audit_service import log_activity
                log_activity((user or {}).get('id'),
                             'WEBSITE_PRODUCT_SYNCED' if website.get('ok') else 'WEBSITE_PRODUCT_SYNC_FAILED',
                             'services', sid, f"{', '.join(changes)} -> {website.get('message')}")
            except Exception:
                pass
        data = dict(updated) if updated else {"id": sid}
        data['form_fields'] = form_fields_of(data)
        data['website_sync'] = website
        return success_response(start_response, data=data, message=message)


    # ── GET /api/catalog/schema (Dynamic form config for service) ──────────
    if path == '/api/catalog/schema' and method == 'GET':
        product_name = (query.get('product') or [''])[0].strip()
        
        # Check if helper config has specific fields
        if _HAS_CATALOG_CONFIG and hasattr(product_catalog_config, 'get_product_form_config'):
            try:
                cfg = product_catalog_config.get_product_form_config(product_name)
                return success_response(start_response, data=cfg)
            except Exception:
                pass

        # Standard clean dynamic schema fallback
        default_schema = {
            "product_name": product_name,
            "fields": [
                {
                    "id": "company_name",
                    "name": "company_name",
                    "label": "Company or Trading Name",
                    "type": "text",
                    "required": True
                },
                {
                    "id": "special_instructions",
                    "name": "special_instructions",
                    "label": "Instructions / Requirements",
                    "type": "textarea",
                    "required": False
                }
            ],
            "document_requirements": DEFAULT_DOCUMENT_REQUIREMENTS
        }
        return success_response(start_response, data=default_schema)

    # ── GET /api/catalog/documents/standard ────────────────────────────────
    if path == '/api/catalog/documents/standard' and method == 'GET':
        if _HAS_CATALOG_CONFIG and hasattr(product_catalog_config, 'STANDARD_ORDER_DOCUMENT_REQUIREMENTS'):
            return success_response(start_response, data=product_catalog_config.STANDARD_ORDER_DOCUMENT_REQUIREMENTS)
        return success_response(start_response, data=DEFAULT_DOCUMENT_REQUIREMENTS)

    return None
