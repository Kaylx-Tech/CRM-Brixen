"""Authentication & User Routes (/api/auth)
"""
import uuid
import datetime
from db import query_db, execute_db, verify_password, hash_password
from utils.response import json_response, success_response, error_response
from services.email_service import send_email

def handle_auth_routes(environ, start_response, path, method, user, body):
    """Route handler for /api/auth endpoints."""
    
    # ── POST /api/auth/login ───────────────────────────────────────────────
    if path == '/api/auth/login' and method == 'POST':
        email = (body.get('email') or '').strip().lower()
        password = body.get('password') or ''
        
        if not email or not password:
            return error_response(start_response, "Email and password are required.", status_code=400)
            
        user_row = query_db("""
            SELECT id, email, password_hash, full_name as name, role, status
            FROM users
            WHERE lower(email) = ?
            LIMIT 1;
        """, (email,), one=True)
        
        if not user_row or not verify_password(password, user_row['password_hash']):
            return error_response(start_response, "Invalid email or password.", status_code=401)
            
        if user_row.get('status') != 'Active':
            return error_response(start_response, "Account is disabled. Please contact support.", status_code=403)
            
        # Generate new DB session token (30 days validity)
        session_token = str(uuid.uuid4())
        execute_db("""
            INSERT INTO user_sessions (session_token, user_id, expires_at, last_activity_at)
            VALUES (?, ?, datetime('now', '+30 days'), datetime('now'));
        """, (session_token, user_row['id']))
        
        user_data = {
            "id": user_row['id'],
            "email": user_row['email'],
            "name": user_row['name'],
            "role": user_row['role']
        }
        
        return success_response(start_response, data={
            "token": session_token,
            "user": user_data
        }, message="Login successful.")

    # ── GET /api/auth/me ──────────────────────────────────────────────────
    if path == '/api/auth/me' and method == 'GET':
        if not user:
            return error_response(start_response, "Unauthorized", status_code=401)
            
        return success_response(start_response, data={
            "user": {
                "id": user['id'],
                "email": user['email'],
                "name": user['name'],
                "role": user['role']
            }
        })

    # ── POST /api/auth/logout ─────────────────────────────────────────────
    if path == '/api/auth/logout' and method == 'POST':
        if user and user.get('session_token'):
            execute_db("""
                UPDATE user_sessions
                SET revoked_at = datetime('now')
                WHERE session_token = ?;
            """, (user['session_token'],))
            
        return success_response(start_response, message="Logged out successfully.")

    # ── POST /api/auth/forgot-password ────────────────────────────────────
    if path == '/api/auth/forgot-password' and method == 'POST':
        email = (body.get('email') or '').strip().lower()
        if not email:
            return error_response(start_response, "Email is required.", status_code=400)
            
        user_row = query_db("SELECT id, email, name FROM users WHERE lower(email) = ? LIMIT 1;", (email,), one=True)
        if user_row:
            reset_token = str(uuid.uuid4())
            execute_db("""
                INSERT INTO password_resets (user_id, token, expires_at)
                VALUES (?, ?, datetime('now', '+1 hour'));
            """, (user_row['id'], reset_token))
            
            # Send reset email
            try:
                reset_link = f"https://admin.brixenconsultants.com/reset-password?token={reset_token}"
                send_email(
                    recipient=email,
                    subject="Brixen CRM - Password Reset Request",
                    html_content=f"<p>Hello {user_row['name'] or 'Client'},</p><p>You requested a password reset. Click below:</p><p><a href='{reset_link}'>{reset_link}</a></p><p>This link expires in 1 hour.</p>"
                )
            except Exception as e:
                print(f"[Email Error] Failed to send reset link: {e}")
                
        return success_response(start_response, message="If that email is registered, a password reset link has been sent.")

    return None
