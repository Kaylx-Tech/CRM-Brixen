"""Standard API Response Helpers
"""
import json
import decimal
import datetime

class APIJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle dates, decimals, and UUIDs properly."""
    def default(self, obj):
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, bytes):
            return obj.decode('utf-8', errors='ignore')
        return super().default(obj)

def json_response(start_response, data, status_code=200, headers=None):
    """Standardized JSON response wrapper."""
    if headers is None:
        headers = []
    
    status_map = {
        200: '200 OK',
        201: '201 Created',
        204: '204 No Content',
        400: '400 Bad Request',
        401: '401 Unauthorized',
        403: '403 Forbidden',
        404: '404 Not Found',
        409: '409 Conflict',
        422: '422 Unprocessable Entity',
        500: '500 Internal Server Error'
    }
    status = status_map.get(status_code, f"{status_code} Response")
    
    payload = json.dumps(data, cls=APIJSONEncoder).encode('utf-8')
    
    resp_headers = [
        ('Content-Type', 'application/json; charset=utf-8'),
        ('Content-Length', str(len(payload))),
    ]
    resp_headers.extend(headers)
    
    start_response(status, resp_headers)
    return [payload]

def error_response(start_response, message="An error occurred", status_code=400, details=None, headers=None):
    """Standardized JSON error response."""
    data = {
        "success": False,
        "error": message
    }
    if details:
        data["details"] = details
    return json_response(start_response, data, status_code=status_code, headers=headers)

def success_response(start_response, data=None, message=None, status_code=200, headers=None):
    """Standardized JSON success response."""
    resp_data = {"success": True}
    if message:
        resp_data["message"] = message
    if data is not None:
        resp_data["data"] = data
    return json_response(start_response, resp_data, status_code=status_code, headers=headers)
