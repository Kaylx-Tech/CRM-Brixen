"""Internal CRM Tasks & Kanban Routes (/api/tasks)
"""
import re
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response

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

    # ── GET /api/tasks (List) ──────────────────────────────────────────────
    if path == '/api/tasks' and method == 'GET':
        status_filter = (query.get('status') or [''])[0].strip()
        assigned_to = (query.get('assigned_to') or [''])[0].strip()

        params = []
        conditions = []

        if status_filter:
            conditions.append("t.status = ?")
            params.append(status_filter)

        if assigned_to:
            conditions.append("t.assigned_staff_id = ?")
            params.append(assigned_to)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = query_db(f"""
            SELECT t.*, u.full_name as assignee_name, c.name as company_name
            FROM tasks t
            LEFT JOIN users u ON t.assigned_staff_id = u.id
            LEFT JOIN companies c ON t.company_id = c.id
            {where_clause}
            ORDER BY t.created_at DESC;
        """, params)

        return success_response(start_response, data=[dict(r) for r in rows])

    # ── POST /api/tasks (Create Task) ─────────────────────────────────────
    if path == '/api/tasks' and method == 'POST':
        title = (body.get('title') or '').strip()
        description = body.get('description', '')
        priority = body.get('priority', 'Medium')
        status = body.get('status', 'Open')
        due_date = body.get('due_date')
        assigned_to = body.get('assigned_to') or body.get('assigned_staff_id') or user_id
        company_id = body.get('company_id')
        order_id = body.get('order_id')

        if not title:
            return error_response(start_response, "Task title is required", status_code=400)

        if status not in ('Open', 'In Progress', 'Completed', 'Cancelled'):
            status = 'Open'
        if priority not in ('Low', 'Medium', 'High', 'Urgent'):
            priority = 'Medium'

        task_id = execute_db("""
            INSERT INTO tasks (
                title, description, priority, status, due_date,
                assigned_staff_id, company_id, order_id, created_by_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'));
        """, (title, description, priority, status, due_date, assigned_to, company_id, order_id, user_id))

        return success_response(start_response, data={"id": task_id, "title": title}, message="Task created.", status_code=201)

    # ── PATCH /api/tasks/<id> (Update Task) ───────────────────────────────
    match_task = re.match(r'^/api/tasks/(\d+)$', path)
    if match_task and method in ('PUT', 'PATCH'):
        task_id = int(match_task.group(1))

        allowed_fields = ['title', 'description', 'priority', 'status', 'due_date']
        updates = []
        params = []

        for field in allowed_fields:
            if field in body:
                updates.append(f"{field} = ?")
                params.append(body[field])
        if 'assigned_to' in body or 'assigned_staff_id' in body:
            updates.append("assigned_staff_id = ?")
            params.append(body.get('assigned_staff_id') or body.get('assigned_to'))

        if updates:
            updates.append("updated_at = datetime('now')")
            params.append(task_id)
            execute_db(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?;", params)

        return success_response(start_response, message="Task updated successfully.")

    return None
