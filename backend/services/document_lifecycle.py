"""Document lifecycle helpers — aligned with app.py public_document / approve / reject."""
from __future__ import annotations

import json
from typing import Any, Optional

from db import query_db, execute_db, get_db

LIFECYCLE_STAGES = (
    "CUSTOMER_UPLOADS",
    "PROCESSING",
    "REVIEW_REQUIRED",
    "READY_FOR_APPROVAL",
    "POSTED_DOCUMENTS",
    "QUARANTINE",
)

DOC_LIST_SQL = """
    SELECT d.*, u.full_name as client_name, u.email as client_email,
           c.name as company_name, c.company_number
    FROM documents d
    LEFT JOIN users u ON d.user_id = u.id
    LEFT JOIN companies c ON d.company_id = c.id
"""


def public_document(row, for_client=False):
    if not row:
        return None
    src = dict(row)
    uploaded_by = src.get("uploaded_by") or ""
    category = src.get("category") or ""
    is_customer_upload = (
        uploaded_by == "Customer Upload"
        or category == "Checkout Upload"
        or str(src.get("review_notes") or "").strip() == "Smart Document Intake"
        or str(src.get("lifecycle_status") or "").upper()
        in (
            "CUSTOMER_UPLOADS",
            "PROCESSING",
            "REVIEW_REQUIRED",
            "READY_FOR_APPROVAL",
            "QUARANTINE",
        )
    )
    lifecycle = str(src.get("lifecycle_status") or "").strip() or (
        "CUSTOMER_UPLOADS" if is_customer_upload else "POSTED_DOCUMENTS"
    )
    is_posted_raw = src.get("is_posted")
    if is_posted_raw is None:
        is_posted_val = 0 if is_customer_upload else 1
    else:
        is_posted_val = int(is_posted_raw)

    out = {
        "id": src.get("id"),
        "user_id": src.get("user_id"),
        "company_id": src.get("company_id"),
        "order_id": src.get("order_id"),
        "name": src.get("name"),
        "category": src.get("category"),
        "file_type": src.get("file_type"),
        "file_size": src.get("file_size"),
        "status": src.get("status"),
        "uploaded_by": uploaded_by,
        "created_at": src.get("created_at"),
        "company_name": src.get("company_name"),
        "order_number": src.get("order_number"),
        "client_name": src.get("client_name"),
        "client_email": src.get("client_email"),
        "client_visible": int(src.get("client_visible") or 0),
        "shared_at": src.get("shared_at"),
        "is_customer_upload": is_customer_upload,
        "file_hash": src.get("file_hash"),
        "ocr_status": src.get("ocr_status") or "COMPLETED",
        "identity_status": src.get("identity_status") or "COMPLETED",
        "crm_status": src.get("crm_status") or "MATCHED",
        "ch_status": src.get("ch_status") or "NOT_APPLICABLE",
        "overall_status": src.get("overall_status") or "COMPLETED",
        "lifecycle_status": lifecycle,
        "is_posted": is_posted_val,
        "ocr_confidence": float(
            src.get("ocr_confidence") if src.get("ocr_confidence") is not None else 100.0
        ),
        "classification_confidence": float(
            src.get("classification_confidence")
            if src.get("classification_confidence") is not None
            else 100.0
        ),
        "identity_confidence": float(
            src.get("identity_confidence")
            if src.get("identity_confidence") is not None
            else 100.0
        ),
        "customer_match_confidence": float(
            src.get("customer_match_confidence")
            if src.get("customer_match_confidence") is not None
            else 100.0
        ),
        "company_match_confidence": float(
            src.get("company_match_confidence")
            if src.get("company_match_confidence") is not None
            else 100.0
        ),
        "duplicate_confidence": float(
            src.get("duplicate_confidence")
            if src.get("duplicate_confidence") is not None
            else 0.0
        ),
        "uploaded_at": src.get("uploaded_at") or src.get("created_at"),
        "processed_at": src.get("processed_at"),
        "matched_at": src.get("matched_at"),
        "approved_at": src.get("approved_at"),
        "posted_at": src.get("posted_at"),
        "company_number": src.get("company_number") or src.get("companies_house_number"),
    }
    if not for_client:
        out["review_notes"] = src.get("review_notes")
        meta = None
        if src.get("match_meta_json"):
            try:
                meta = json.loads(src.get("match_meta_json"))
            except Exception:
                meta = None
        out["match_meta"] = meta
        out["matching_evidence"] = (meta or {}).get("matching_evidence") or (meta or {}).get(
            "reasons"
        ) or []
        out["conflicting_evidence"] = (meta or {}).get("conflicting_evidence") or []
        out["score_gap"] = (meta or {}).get("score_gap")
        out["top_candidates"] = (meta or {}).get("top_candidates") or []
    return out


def log_document_audit(
    document_id,
    actor_type,
    actor_id,
    actor_name,
    action,
    previous_state,
    new_state,
    reason=None,
):
    try:
        execute_db(
            """
            INSERT INTO document_audit_log (
                document_id, actor_type, actor_id, actor_name, action,
                previous_state, new_state, reason_evidence_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                document_id,
                actor_type,
                actor_id,
                actor_name,
                action,
                previous_state,
                new_state,
                json.dumps(reason) if reason is not None else None,
            ),
        )
    except Exception:
        pass


def lifecycle_counts() -> dict:
    return {
        "CUSTOMER_UPLOADS": (
            query_db(
                "SELECT COUNT(*) as c FROM documents WHERE lifecycle_status = 'CUSTOMER_UPLOADS' AND COALESCE(is_posted, 0) = 0;",
                one=True,
            )
            or {}
        ).get("c", 0),
        "PROCESSING": (
            query_db(
                "SELECT COUNT(*) as c FROM documents WHERE lifecycle_status = 'PROCESSING' AND COALESCE(is_posted, 0) = 0;",
                one=True,
            )
            or {}
        ).get("c", 0),
        "REVIEW_REQUIRED": (
            query_db(
                "SELECT COUNT(*) as c FROM documents WHERE lifecycle_status = 'REVIEW_REQUIRED' AND COALESCE(is_posted, 0) = 0;",
                one=True,
            )
            or {}
        ).get("c", 0),
        "READY_FOR_APPROVAL": (
            query_db(
                "SELECT COUNT(*) as c FROM documents WHERE lifecycle_status = 'READY_FOR_APPROVAL' AND COALESCE(is_posted, 0) = 0;",
                one=True,
            )
            or {}
        ).get("c", 0),
        "POSTED_DOCUMENTS": (
            query_db(
                "SELECT COUNT(*) as c FROM documents WHERE is_posted = 1 OR lifecycle_status = 'POSTED_DOCUMENTS';",
                one=True,
            )
            or {}
        ).get("c", 0),
        "QUARANTINE": (
            query_db(
                "SELECT COUNT(*) as c FROM documents WHERE lifecycle_status = 'QUARANTINE';",
                one=True,
            )
            or {}
        ).get("c", 0),
    }


def list_lifecycle_documents(stage: str) -> list:
    stage = (stage or "").strip().upper()
    if stage and stage in LIFECYCLE_STAGES:
        if stage == "POSTED_DOCUMENTS":
            rows = query_db(
                DOC_LIST_SQL + " WHERE d.is_posted = 1 ORDER BY d.id DESC LIMIT 200;"
            )
        else:
            rows = query_db(
                DOC_LIST_SQL
                + " WHERE d.lifecycle_status = ? AND COALESCE(d.is_posted, 0) = 0 ORDER BY d.id DESC LIMIT 200;",
                (stage,),
            )
    else:
        rows = query_db(DOC_LIST_SQL + " ORDER BY d.id DESC LIMIT 200;")
    return [public_document(r) for r in (rows or [])]


def fetch_document(doc_id: int) -> Optional[dict]:
    row = query_db("SELECT * FROM documents WHERE id = ?;", (doc_id,), one=True)
    return dict(row) if row else None


def fetch_document_enriched(doc_id: int) -> Optional[dict]:
    row = query_db(
        DOC_LIST_SQL + " WHERE d.id = ?;",
        (doc_id,),
        one=True,
    )
    return public_document(row) if row else None


def approve_document(doc_id: int, user: dict) -> tuple[Optional[dict], Optional[str]]:
    doc = fetch_document(doc_id)
    if not doc:
        return None, "Document not found"

    prev = doc.get("lifecycle_status")
    conn = get_db()
    try:
        conn.execute(
            """
            UPDATE documents SET
                lifecycle_status = 'POSTED_DOCUMENTS',
                is_posted = 1,
                status = 'Approved',
                approved_at = CURRENT_TIMESTAMP,
                approved_by_id = ?,
                posted_at = CURRENT_TIMESTAMP,
                posted_by_id = ?
            WHERE id = ?;
            """,
            (user.get("id"), user.get("id"), doc_id),
        )
        try:
            conn.execute(
                """
                INSERT INTO document_audit_log (
                    document_id, actor_type, actor_id, actor_name, action,
                    previous_state, new_state, reason_evidence_json
                ) VALUES (?, 'HUMAN', ?, ?, 'POST_APPROVED', ?, 'POSTED_DOCUMENTS', ?);
                """,
                (
                    doc_id,
                    user.get("id"),
                    user.get("full_name") or user.get("name") or "Staff",
                    prev,
                    json.dumps({"approved_by": user.get("full_name") or user.get("name")}),
                ),
            )
        except Exception:
            pass
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return None, f"Atomic posting failed: {exc}"
    finally:
        conn.close()

    return fetch_document_enriched(doc_id), None


def reject_document(doc_id: int, user: dict, reason: str) -> tuple[bool, Optional[str]]:
    doc = fetch_document(doc_id)
    if not doc:
        return False, "Document not found"
    reason = (reason or "Rejected by staff").strip()
    execute_db(
        "UPDATE documents SET lifecycle_status = 'QUARANTINE', is_posted = 0, status = 'Rejected', review_notes = ? WHERE id = ?;",
        (reason, doc_id),
    )
    log_document_audit(
        doc_id,
        "HUMAN",
        user.get("id"),
        user.get("full_name") or user.get("name") or "Staff",
        "REJECT_QUARANTINE",
        doc.get("lifecycle_status"),
        "QUARANTINE",
        {"reason": reason},
    )
    return True, None


def reassign_document(doc_id: int, user: dict, data: dict) -> tuple[Optional[dict], Optional[str]]:
    doc = fetch_document(doc_id)
    if not doc:
        return None, "Document not found"

    def optional_id(val):
        if val is None or val == "":
            return None
        try:
            return int(val)
        except (TypeError, ValueError):
            return None

    new_client_id = optional_id(data.get("client_id"))
    new_company_id = optional_id(data.get("company_id"))
    new_category = (data.get("category") or "").strip() or None
    prev = doc.get("lifecycle_status")

    if new_client_id:
        client_ok = query_db("SELECT id FROM users WHERE id = ?;", (new_client_id,), one=True)
        if not client_ok:
            return None, "Client not found"
    if new_company_id:
        company_ok = query_db(
            "SELECT id, user_id FROM companies WHERE id = ?;", (new_company_id,), one=True
        )
        if not company_ok:
            return None, "Company not found"
        if new_client_id and int(company_ok["user_id"]) != int(new_client_id):
            return None, "Company does not belong to client"

    execute_db(
        """
        UPDATE documents SET
            user_id = COALESCE(?, user_id),
            company_id = COALESCE(?, company_id),
            category = COALESCE(?, category),
            lifecycle_status = 'READY_FOR_APPROVAL',
            is_posted = 0,
            matched_at = CURRENT_TIMESTAMP,
            matched_by_id = ?,
            review_notes = COALESCE(?, review_notes)
        WHERE id = ?;
        """,
        (
            new_client_id,
            new_company_id,
            new_category,
            user.get("id"),
            (data.get("review_notes") or None),
            doc_id,
        ),
    )
    log_document_audit(
        doc_id,
        "HUMAN",
        user.get("id"),
        user.get("full_name") or user.get("name") or "Staff",
        "REASSIGNED",
        prev,
        "READY_FOR_APPROVAL",
        {
            "client_id": new_client_id,
            "company_id": new_company_id,
            "category": new_category,
        },
    )
    return fetch_document_enriched(doc_id), None


def bulk_approve_sync(doc_ids: list, user: dict, override: bool = False) -> dict:
    approved = failed = skipped = 0
    errors = []
    for did in doc_ids:
        try:
            did = int(did)
        except (TypeError, ValueError):
            skipped += 1
            continue
        d = fetch_document(did)
        if not d:
            skipped += 1
            continue
        status = d.get("lifecycle_status")
        allowed = status == "READY_FOR_APPROVAL" or (
            override
            and status
            in ("REVIEW_REQUIRED", "CUSTOMER_UPLOADS", "PROCESSING", "READY_FOR_APPROVAL")
        )
        if not allowed:
            skipped += 1
            continue
        _, err = approve_document(did, user)
        if err:
            failed += 1
            errors.append(f"Doc #{did}: {err}")
        else:
            approved += 1
    return {
        "approved": approved,
        "failed": failed,
        "skipped": skipped,
        "errors": errors,
    }


def bulk_quarantine(doc_ids: list, user: dict, reason: str) -> int:
    reason = (reason or "Bulk quarantined by staff").strip()
    moved = 0
    for did in doc_ids:
        try:
            did = int(did)
        except (TypeError, ValueError):
            continue
        d = fetch_document(did)
        if not d or d.get("lifecycle_status") == "POSTED_DOCUMENTS":
            continue
        execute_db(
            "UPDATE documents SET lifecycle_status = 'QUARANTINE', is_posted = 0, status = 'Rejected', review_notes = ? WHERE id = ?;",
            (reason, did),
        )
        log_document_audit(
            did,
            "HUMAN",
            user.get("id"),
            user.get("full_name") or user.get("name") or "Staff",
            "BULK_QUARANTINE",
            d.get("lifecycle_status"),
            "QUARANTINE",
            {"reason": reason},
        )
        moved += 1
    return moved


def delete_document(doc_id: int) -> tuple[bool, Optional[str]]:
    doc = fetch_document(doc_id)
    if not doc:
        return False, "Document not found"
    execute_db("DELETE FROM documents WHERE id = ?;", (doc_id,))
    return True, None
