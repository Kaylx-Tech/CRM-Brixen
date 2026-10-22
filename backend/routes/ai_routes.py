"""AI assistant (/api/ai): the "Ask AI" box at the bottom of the CRM.

POST /api/ai/chat   {prompt, history: [{role: user|assistant, content}]}  ->  {reply, tools}
Team members only; the assistant can read the CRM with the member's own permissions and changes nothing.
"""
from utils.response import success_response, error_response


def handle_ai_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/ai/'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    if path == '/api/ai/chat' and method == 'POST':
        from services.ai_assistant import AiError, ask
        payload = body if isinstance(body, dict) else {}
        try:
            result = ask(user, payload.get('prompt'), payload.get('history'))
        except AiError as exc:
            # Shown as the assistant's answer, so the member knows what to do
            return error_response(start_response, str(exc), status_code=400)
        return success_response(start_response, data=result)

    return error_response(start_response, "Not found", status_code=404)
