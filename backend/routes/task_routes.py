"""Internal CRM Tasks & Kanban Routes (/api/tasks)
"""
import datetime
import re
from db import query_db, execute_db
from utils.response import success_response, error_response
from services.notification_service import notify_user
from services.permissions import check_permission, departments_from_user


VALID_STATUSES = ('Open', 'In Progress', 'Completed', 'Cancelled')
VALID_PRIORITIES = ('Low', 'Medium', 'High', 'Urgent')
TASK_MANAGER_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER')


def _staff_can_access(user, task):
    """Same rule as the old portal: staff see their own tasks and unassigned tasks in their departments."""
    if not user or not task:
        return False
    if user.get('role') in TASK_MANAGER_ROLES:
        return True
    if task.get('assigned_staff_id') == user.get('id'):
        return True
    dept = (task.get('department') or '').strip()
    return (not task.get('assigned_staff_id')) and bool(dept) and dept in departments_from_user(user)


def calculate_incentive_grade(completed, assigned, on_time, overdue):
    """Monthly grade used by Performance (ported from app.py calculate_staff_incentive_grade)."""
    completed, assigned, on_time = int(completed or 0), int(assigned or 0), int(on_time or 0)
    completion = (completed / assigned * 100.0) if assigned > 0 else (100.0 if completed > 0 else 0.0)
    sla = (on_time / completed * 100.0) if completed > 0 else 100.0
    if completion >= 90.0 and sla >= 85.0 and completed >= 1:
        grade, label, badge = 'A+', 'Top Performer (Grade A+)', '100% Incentive Bonus Eligible'
    elif completion >= 80.0 and sla >= 75.0:
        grade, label, badge = 'A', 'High Performer (Grade A)', '85% Incentive Bonus Eligible'
    elif completion >= 65.0:
        grade, label, badge = 'B', 'Good Standing (Grade B)', 'Standard Incentive Bonus'
    elif completion >= 40.0:
        grade, label, badge = 'C', 'Needs Improvement (Grade C)', 'Partial Incentive Tier'
    else:
        grade, label, badge = 'D', 'Underperforming (Grade D)', 'Incentive Locked'
    return {'grade': grade, 'grade_label': label, 'bonus_badge': badge,
            'completion_rate': round(completion, 1), 'sla_rate': round(sla, 1)}


def _count(sql, params):
    return int((query_db(sql, params, one=True) or {}).get('c') or 0)


def _staff_month_metrics(staff_id, month):
    """month is 'YYYY-MM'."""
    assigned = _count("SELECT COUNT(*) c FROM tasks WHERE assigned_staff_id = ? AND strftime('%Y-%m', created_at) = ?;",
                      (staff_id, month))
    completed = _count("""SELECT COUNT(*) c FROM tasks WHERE assigned_staff_id = ? AND status = 'Completed'
                          AND strftime('%Y-%m', completed_at) = ?;""", (staff_id, month))
    on_time = _count("""SELECT COUNT(*) c FROM tasks WHERE assigned_staff_id = ? AND status = 'Completed'
                        AND strftime('%Y-%m', completed_at) = ?
                        AND (due_date IS NULL OR date(completed_at) <= date(due_date));""", (staff_id, month))
    overdue = _count("""SELECT COUNT(*) c FROM tasks WHERE assigned_staff_id = ?
                        AND status NOT IN ('Completed', 'Cancelled') AND due_date IS NOT NULL
                        AND date(due_date) < date('now');""", (staff_id,))
    open_c = _count("SELECT COUNT(*) c FROM tasks WHERE assigned_staff_id = ? AND status = 'Open';", (staff_id,))
    in_prog = _count("SELECT COUNT(*) c FROM tasks WHERE assigned_staff_id = ? AND status = 'In Progress';", (staff_id,))
    return {'assigned_count': assigned, 'completed_count': completed, 'on_time_count': on_time,
            'overdue_count': overdue, 'open_count': open_c, 'in_progress_count': in_prog,
            **calculate_incentive_grade(completed, assigned, on_time, overdue)}


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

    # ── GET /api/tasks/my-dashboard (Performance: the signed-in member's own work) ──
    if path == '/api/tasks/my-dashboard' and method == 'GET':
        month = datetime.date.today().strftime('%Y-%m')
        metrics = _staff_month_metrics(user_id, month)
        metrics['completed_all_time'] = _count(
            "SELECT COUNT(*) c FROM tasks WHERE assigned_staff_id = ? AND status = 'Completed';", (user_id,))
        rows = query_db("""
            SELECT t.*, c.name AS company_name, creator.full_name AS creator_name
            FROM tasks t
            LEFT JOIN companies c ON t.company_id = c.id
            LEFT JOIN users creator ON t.created_by_id = creator.id
            WHERE t.assigned_staff_id = ? AND t.status NOT IN ('Completed', 'Cancelled')
            ORDER BY CASE WHEN t.due_date IS NOT NULL AND date(t.due_date) < date('now') THEN 0 ELSE 1 END,
                     CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
                     t.due_date IS NULL, t.due_date ASC, t.created_at DESC
            LIMIT 50;
        """, (user_id,)) or []
        return success_response(start_response, data={
            "month": month, "metrics": metrics, "my_tasks": [dict(r) for r in rows]})

    # ── GET /api/tasks/incentives-report (team leaderboard: admin + manager) ──
    if path == '/api/tasks/incentives-report' and method == 'GET':
        if user_role not in TASK_MANAGER_ROLES:
            return error_response(start_response, "Only admins and managers can view team incentives", status_code=403)
        month = (query.get('month') or [''])[0].strip()
        if not re.match(r'^\d{4}-\d{2}$', month):
            month = datetime.date.today().strftime('%Y-%m')
        staff_rows = query_db("""
            SELECT id, full_name, email, role, department FROM users
            WHERE role IN ('STAFF', 'MANAGER', 'ADMIN', 'SUPER_ADMIN') AND status = 'Active' AND removed_at IS NULL
            ORDER BY full_name COLLATE NOCASE;
        """) or []
        report = [{"staff": dict(s), **_staff_month_metrics(s['id'], month)} for s in staff_rows]
        order = {'A+': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4}
        report.sort(key=lambda r: (order.get(r['grade'], 5), -r['completed_count']))
        return success_response(start_response, data={"month": month, "leaderboard": report})

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

        if user_role not in TASK_MANAGER_ROLES:
            # Staff: own tasks, plus unassigned tasks in their departments
            depts = departments_from_user(user)
            if depts:
                marks = ','.join('?' for _ in depts)
                conditions.append(f"(t.assigned_staff_id = ? OR (t.assigned_staff_id IS NULL AND t.department IN ({marks})))")
                params.extend([user_id, *depts])
            else:
                conditions.append("t.assigned_staff_id = ?")
                params.append(user_id)

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
        if not check_permission(user, 'tasks.create'):
            return error_response(start_response, "Only admins and managers can create tasks", status_code=403)
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

        notify_user(
            assigned_to,
            'New task assigned',
            f"{title} ({priority} priority){' - due ' + str(due_date) if due_date else ''}",
            'task_assigned', '/admin/tasks',
            exclude_user_id=user_id,
        )

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
            if user_role not in TASK_MANAGER_ROLES:
                return error_response(start_response, "Only admins and managers can delete tasks", status_code=403)
            existing = query_db("SELECT id FROM tasks WHERE id = ?;", (task_id,), one=True)
            if not existing:
                return error_response(start_response, "Task not found", status_code=404)
            execute_db("DELETE FROM tasks WHERE id = ?;", (task_id,))
            return success_response(start_response, message="Task deleted.")

        if method in ('PUT', 'PATCH'):
            existing = query_db("SELECT id, title, status, assigned_staff_id, department FROM tasks WHERE id = ?;",
                                (task_id,), one=True)
            if not existing:
                return error_response(start_response, "Task not found", status_code=404)
            if not _staff_can_access(user, existing):
                return error_response(start_response, "This task is not assigned to you", status_code=403)
            # Re-assigning or moving a task between departments needs tasks.assign (admins / managers)
            reassigning = ('assigned_to' in body or 'assigned_staff_id' in body) and \
                str(body.get('assigned_staff_id') or body.get('assigned_to') or '') != str(existing.get('assigned_staff_id') or '')
            moving = 'department' in body and (body.get('department') or None) != existing.get('department')
            if (reassigning or moving) and not check_permission(user, 'tasks.assign'):
                return error_response(start_response, "Only admins and managers can re-assign tasks", status_code=403)

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

            new_assignee = body.get('assigned_staff_id') or body.get('assigned_to')
            if reassigning and new_assignee:
                notify_user(new_assignee, 'Task assigned to you', existing.get('title') or 'Task',
                            'task_assigned', '/admin/tasks', exclude_user_id=user_id)

            return success_response(start_response, message="Task updated successfully.")

    return None
