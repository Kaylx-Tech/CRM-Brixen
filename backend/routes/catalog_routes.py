"""Product & Service Catalog Routes (/api/catalog)
Decoupled & Database-Driven architecture.
"""
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response
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
                       vat_rate, estimated_delivery_time, status, cost_price
                FROM services
                {status_clause}
                ORDER BY category ASC, price ASC;
            """)
        except Exception:
            db_services = []

        if db_services:
            products = [dict(s) for s in db_services]
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

        try:
            sid = execute_db("""
                INSERT INTO services (name, description, category, price, duration, cost_price, status)
                VALUES (?, ?, ?, ?, ?, ?, 'Active')
            """, (name, description, category, price, duration, cost_price))
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

        if method == 'DELETE':
            if user.get('role') not in ('SUPER_ADMIN', 'ADMIN'):
                return error_response(start_response, "Deletion is restricted to Administrator accounts only.", 403)
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

        execute_db("""
            UPDATE services
            SET name = ?, description = ?, category = ?, price = ?, cost_price = ?, duration = ?, status = ?
            WHERE id = ?;
        """, (name, description or name, category, price, cost_price, duration, status, sid))
        updated = query_db("SELECT * FROM services WHERE id = ?;", (sid,), one=True)
        return success_response(start_response, data=dict(updated) if updated else {"id": sid}, message="Service updated.")


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
