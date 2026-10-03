"""Internal CRM Tasks & Kanban Routes (/api/tasks)
"""
import re
from db import query_db, execute_db
from utils.response import success_response, error_response


VALID_STATUSES = ('Open', 'In Progress', 'Completed', 'Cancelled')
VALID_PRIORITIES = ('Low', 'Medium', 'High', 'Urgent')


def handle_task_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/tasks endpoints."""
    if not path.startswith('/api/tasks'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    if not is_staff:
        return error_response(start_response, "Access denied. Staff only.", status_code=403)

    body = body or {}
    query = query or {}

    # ── GET /api/tasks (List) ──────────────────────────────────────────────
    if path == '/api/tasks' and method == 'GET':
        status_filter = (query.get('status') or [''])[0].strip()
        assigned_to = (query.get('assigned_to') or [''])[0].strip()
        department = (query.get('department') or [''])[0].strip()

        params = []
        conditions = []

        if status_filter and status_filter.lower() != 'all':
            conditions.append("t.status = ?")
            params.append(status_filter)

        if assigned_to:
            conditions.append("t.assigned_staff_id = ?")
            params.append(assigned_to)

        if department:
            conditions.append("t.department = ?")
            params.append(department)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = query_db(f"""
            SELECT t.*,
                   u.full_name as assignee_name,
                   creator.full_name as creator_name,
                   c.name as company_name
            FROM tasks t
            LEFT JOIN users u ON t.assigned_staff_id = u.id
            LEFT JOIN users creator ON t.created_by_id = creator.id
            LEFT JOIN companies c ON t.company_id = c.id
            {where_clause}
            ORDER BY
              CASE t.priority
                WHEN 'Urgent' THEN 0
                WHEN 'High' THEN 1
                WHEN 'Medium' THEN 2
                ELSE 3
              END,
              CASE t.status
                WHEN 'Open' THEN 0
                WHEN 'In Progress' THEN 1
                WHEN 'Completed' THEN 2
                ELSE 3
              END,
              t.due_date IS NULL,
              t.due_date ASC,
              t.created_at DESC;
        """, params)

        return success_response(start_response, data=[dict(r) for r in rows])

    # ── POST /api/tasks (Create Task) ─────────────────────────────────────
    if path == '/api/tasks' and method == 'POST':
        title = (body.get('title') or '').strip()
        description = body.get('description', '')
        priority = body.get('priority', 'Medium')
        status = body.get('status', 'Open')
        due_date = body.get('due_date') or None
        department = (body.get('department') or '').strip() or None
        assigned_to = body.get('assigned_to') or body.get('assigned_staff_id') or user_id
        company_id = body.get('company_id') or None
        order_id = body.get('order_id') or None
        client_id = body.get('client_id') or None

        if not title:
            return error_response(start_response, "Task title is required", status_code=400)

        if status not in VALID_STATUSES:
            status = 'Open'
        if priority not in VALID_PRIORITIES:
            priority = 'Medium'

        completed_at = "datetime('now')" if status == 'Completed' else 'NULL'

        task_id = execute_db(f"""
            INSERT INTO tasks (
                title, description, priority, status, due_date, department,
                assigned_staff_id, company_id, order_id, client_id, created_by_id,
                completed_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, {completed_at}, datetime('now'), datetime('now'));
        """, (
            title, description, priority, status, due_date, department,
            assigned_to, company_id, order_id, client_id, user_id,
        ))

        return success_response(
            start_response,
            data={"id": task_id, "title": title},
            message="Task created.",
            status_code=201,
        )

    # ── PATCH/PUT/DELETE /api/tasks/<id> ──────────────────────────────────
    match_task = re.match(r'^/api/tasks/(\d+)$', path)
    if match_task:
        task_id = int(match_task.group(1))

        if method == 'DELETE':
            existing = query_db("SELECT id FROM tasks WHERE id = ?;", (task_id,), one=True)
            if not existing:
                return error_response(start_response, "Task not found", status_code=404)
            execute_db("DELETE FROM tasks WHERE id = ?;", (task_id,))
            return success_response(start_response, message="Task deleted.")

        if method in ('PUT', 'PATCH'):
            existing = query_db("SELECT id, status FROM tasks WHERE id = ?;", (task_id,), one=True)
            if not existing:
                return error_response(start_response, "Task not found", status_code=404)

            allowed_fields = [
                'title', 'description', 'priority', 'status',
                'due_date', 'department', 'company_id', 'order_id', 'client_id',
                'internal_notes',
            ]
            updates = []
            params = []

            for field in allowed_fields:
                if field not in body:
                    continue
                value = body[field]
                if field == 'status' and value not in VALID_STATUSES:
                    continue
                if field == 'priority' and value not in VALID_PRIORITIES:
                    continue
                if field in ('title', 'department') and isinstance(value, str):
                    value = value.strip() or None
                    if field == 'title' and not value:
                        return error_response(start_response, "Task title is required", status_code=400)
                updates.append(f"{field} = ?")
                params.append(value)

            if 'assigned_to' in body or 'assigned_staff_id' in body:
                updates.append("assigned_staff_id = ?")
                params.append(body.get('assigned_staff_id') or body.get('assigned_to'))

            if 'status' in body and body['status'] in VALID_STATUSES:
                if body['status'] == 'Completed' and existing['status'] != 'Completed':
                    updates.append("completed_at = datetime('now')")
                elif body['status'] != 'Completed':
                    updates.append("completed_at = NULL")

            if updates:
                updates.append("updated_at = datetime('now')")
                params.append(task_id)
                execute_db(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?;", params)

            return success_response(start_response, message="Task updated successfully.")

    return None
