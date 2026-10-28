"""Cloudflare R2 document storage (Finstap): private bucket, S3 API, no expiring login token.

Objects are private; the CRM backend downloads and streams them itself, so no public link ever exists.
Each company workspace has its own prefix:  <workspace>/customers/<customer>/<order>/<id>_<file>
(Brixen's own database / no workspace: crm/...). A document stored here keeps "r2:<object key>" in
documents.drive_file_id, so everything that asks "is this file in cloud storage?" keeps working.

Env (Coolify): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
               (optional R2_ENDPOINT, default https://<account id>.r2.cloudflarestorage.com)
Nothing here deletes stored files.
"""
import hashlib
import os
import re
import threading
import uuid

REF_PREFIX = 'r2:'
_client = None
_client_lock = threading.Lock()


def _env(key):
    try:
        from services.platform_integrations import get  # Finstap: the owner portal's value, else the env
        return get(key)
    except ImportError:
        pass
    value = os.environ.get(key, '').strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1].strip()
    return value


def bucket():
    return _env('R2_BUCKET')


def endpoint():
    return _env('R2_ENDPOINT') or (f"https://{_env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com"
                                   if _env('R2_ACCOUNT_ID') else '')


def missing_settings():
    need = {'R2_ACCESS_KEY_ID': _env('R2_ACCESS_KEY_ID'), 'R2_SECRET_ACCESS_KEY': _env('R2_SECRET_ACCESS_KEY'),
            'R2_BUCKET': bucket(), 'R2_ACCOUNT_ID (or R2_ENDPOINT)': endpoint()}
    return [k for k, v in need.items() if not v]


def is_configured():
    return not missing_settings()


def is_r2_ref(file_id):
    return str(file_id or '').startswith(REF_PREFIX)


def get_client():
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                import boto3  # type: ignore
                from botocore.config import Config  # type: ignore
                _client = boto3.client(
                    's3', endpoint_url=endpoint(), region_name='auto',
                    aws_access_key_id=_env('R2_ACCESS_KEY_ID'), aws_secret_access_key=_env('R2_SECRET_ACCESS_KEY'),
                    # Checksums only when an API needs them: R2 does not take every default checksum header
                    config=Config(signature_version='s3v4', retries={'max_attempts': 3, 'mode': 'standard'},
                                  connect_timeout=10, read_timeout=60,
                                  request_checksum_calculation='when_required',
                                  response_checksum_validation='when_required'))
    return _client


def reset_client():
    global _client
    _client = None


def workspace_prefix():
    """This company's folder in the bucket (its workspace name); 'crm' for Brixen's own database."""
    try:
        from tenancy import current_tenant
        tenant = current_tenant()
    except ImportError:
        tenant = None
    if tenant and tenant.get('plan') != 'legacy' and tenant.get('slug'):
        return tenant['slug']
    return 'crm'


def _part(text, fallback):
    clean = re.sub(r'[\x00-\x1f/\\]+', ' ', str(text or '')).strip()
    clean = re.sub(r'\s+', ' ', clean)[:120]
    return clean or fallback


def object_key(customer_name, order_name, filename):
    return '/'.join([workspace_prefix(), 'customers', _part(customer_name, 'General Client'),
                     _part(order_name, 'general'), f"{uuid.uuid4().hex[:10]}_{_part(filename, 'document')}"])


def upload(key, file_bytes, mime_type=None):
    """Store the bytes; checks the stored copy's MD5. Returns {success, key, ref, size} or {success: False, error}."""
    try:
        res = get_client().put_object(Bucket=bucket(), Key=key, Body=file_bytes,
                                      ContentType=mime_type or 'application/octet-stream')
        etag = str(res.get('ETag') or '').strip('"')
        if etag and etag != hashlib.md5(file_bytes).hexdigest():
            return {'success': False, 'error': 'R2 stored a different file (checksum mismatch).'}
        return {'success': True, 'key': key, 'ref': REF_PREFIX + key, 'size': len(file_bytes)}
    except Exception as exc:
        return {'success': False, 'error': error_text(exc)}


def download(ref):
    """(bytes, {'name', 'mimeType', 'size'}) for "r2:<key>", only inside this workspace's own prefix."""
    key = str(ref or '')[len(REF_PREFIX):] if is_r2_ref(ref) else str(ref or '')
    if not key.startswith(workspace_prefix() + '/'):
        print(f"[R2] refused a file outside this workspace: {key[:80]}")
        return None, None
    try:
        obj = get_client().get_object(Bucket=bucket(), Key=key)
        data = obj['Body'].read()
        return data, {'name': key.rsplit('/', 1)[-1].split('_', 1)[-1], 'mimeType': obj.get('ContentType'),
                      'size': len(data)}
    except Exception as exc:
        print(f"[R2] download failed for {key[:80]}: {error_text(exc)}")
        return None, None


def error_text(exc):
    text = str(exc)
    if 'InvalidAccessKeyId' in text or 'SignatureDoesNotMatch' in text or 'Unauthorized' in text:
        return 'R2 refused the keys: check R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (an R2 API token with Object Read & Write).'
    if 'NoSuchBucket' in text:
        return f'The R2 bucket "{bucket()}" does not exist in this Cloudflare account (check R2_BUCKET / R2_ACCOUNT_ID).'
    if 'AccessDenied' in text:
        return 'The R2 token has no access to this bucket (give it Object Read & Write on the bucket).'
    if 'Could not connect' in text or 'EndpointConnectionError' in text or 'Name or service not known' in text:
        return 'Could not reach R2: check R2_ACCOUNT_ID / R2_ENDPOINT.'
    return text[:300]


def health():
    """Check the keys, the bucket and that this workspace can write and read. Shows no secrets."""
    steps = []

    def step(name, ok, detail=''):
        steps.append({'step': name, 'ok': bool(ok), 'detail': detail})
        return ok

    missing = missing_settings()
    if not step('R2 settings', not missing, f"bucket {bucket()}" if not missing else f"missing: {', '.join(missing)}"):
        return {'ok': False, 'steps': steps, 'error': f"R2 settings are missing on the server: {', '.join(missing)}"}
    try:
        import boto3  # noqa: F401  # type: ignore
    except ImportError:
        step('boto3 library', False, 'not installed (requirements.txt)')
        return {'ok': False, 'steps': steps, 'error': 'boto3 is not installed on the server.'}
    reset_client()
    key = f"{workspace_prefix()}/.storage-check"
    payload = b'Finstap storage check'
    try:
        put = upload(key, payload, 'text/plain')
        if not step('Write', put['success'], key if put['success'] else put['error']):
            return {'ok': False, 'steps': steps, 'error': put['error']}
        data, _meta = download(REF_PREFIX + key)
        if not step('Read back', data == payload, '' if data == payload else 'the file could not be read back'):
            return {'ok': False, 'steps': steps, 'error': 'R2 accepted the file but it could not be read back.'}
    except Exception as exc:
        reason = error_text(exc)
        step('R2', False, reason)
        return {'ok': False, 'steps': steps, 'error': reason}
    return {'ok': True, 'steps': steps, 'error': '', 'path': f"{bucket()}/{workspace_prefix()}/customers/..."}
