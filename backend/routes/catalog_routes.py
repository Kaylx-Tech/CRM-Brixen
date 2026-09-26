"""Product & Service Catalog Routes (/api/catalog)
Decoupled & Database-Driven architecture.
"""
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response

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
    """Route handler for /api/catalog endpoints."""
    if not path.startswith('/api/catalog'):
        return None

    # ── GET /api/catalog/products or /services ─────────────────────────────
    if path in ('/api/catalog/products', '/api/catalog/services') and method == 'GET':
        # 1. Fetch live services from Database
        try:
            db_services = query_db("""
                SELECT id, name, description, category, price, duration,
                       vat_rate, estimated_delivery_time, status
                FROM services
                WHERE status = 'Active'
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
