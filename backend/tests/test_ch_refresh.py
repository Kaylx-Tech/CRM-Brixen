"""Companies House refresh: a fix filed at Companies House must clear the company's attention.

Run from backend/:  py -m unittest tests.test_ch_refresh -v
"""
import json
import os
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# A throw-away database, never a real one
_tmp_dir = tempfile.mkdtemp(prefix='finstap-intake-test-')
os.environ.setdefault('DATABASE_URL', os.path.join(_tmp_dir, 'test.db'))
os.environ.setdefault('FINSTAP_DATA_DIR', _tmp_dir)
os.environ.setdefault('STORAGE_PATH', os.path.join(_tmp_dir, 'storage'))

# argon2 is only needed for passwords; stub it where it is not installed (a laptop without the server's libraries)
try:
    import argon2  # noqa: F401
except ImportError:
    _argon2 = types.ModuleType('argon2')
    _argon2.PasswordHasher = lambda *a, **k: types.SimpleNamespace(
        hash=lambda p: 'x', verify=lambda h, p: True, check_needs_rehash=lambda h: False)
    _argon2.Type = types.SimpleNamespace(ID=2)
    _exc = types.ModuleType('argon2.exceptions')
    _exc.VerifyMismatchError = type('VerifyMismatchError', (Exception,), {})
    _exc.VerificationError = type('VerificationError', (Exception,), {})
    _exc.InvalidHashError = _exc.InvalidHash = type('InvalidHashError', (Exception,), {})
    _argon2.exceptions = _exc
    sys.modules['argon2'] = _argon2
    sys.modules['argon2.exceptions'] = _exc

from services import ch_refresh  # noqa: E402
from services.ch_attention import company_attention_issues  # noqa: E402

CARDIFF = 'PO Box 4385, 12345678 - Companies House Default Address, Cardiff, CF14 8LH'

FIXED_PROFILE = {
    'company_status': 'active',
    'date_of_creation': '2020-01-01',
    'registered_office_address': {
        'address_line_1': '71-75 Shelton Street', 'locality': 'London', 'postal_code': 'WC2H 9JQ',
        'country': 'United Kingdom'},
    'accounts': {'next_due': '2027-09-30', 'overdue': False},
    'confirmation_statement': {'next_due': '2027-06-01', 'overdue': False},
}


class RefreshClearsAttentionTests(unittest.TestCase):
    def test_new_address_replaces_the_cardiff_default(self):
        company = {'id': 7, 'company_number': '12345678', 'status': 'Active', 'reg_office': CARDIFF,
                   'ch_attention_json': json.dumps([{'code': 'default_address', 'title': 'Default'}])}
        self.assertTrue(any(i['code'] == 'default_address' for i in company_attention_issues(company)))

        saved = {}

        def fake_execute(sql, params=()):
            saved['sql'], saved['params'] = sql, params

        with mock.patch('services.companies_house_service.fetch_company_profile',
                        return_value={'success': True, 'data': FIXED_PROFILE}), \
                mock.patch.object(ch_refresh, 'execute_db', side_effect=fake_execute):
            self.assertTrue(ch_refresh.refresh_company(company))

        self.assertIn('reg_office', saved['sql'])
        params = saved['params']
        office = params[2]
        attention = json.loads(params[7])
        self.assertIn('Shelton Street', office)
        self.assertEqual(attention, [])
        # What the portal shows after the refresh: nothing needs attention
        after = {**company, 'reg_office': office, 'ch_attention_json': params[7],
                 'accounts_next_due': params[3], 'accounts_overdue': params[4],
                 'confirmation_next_due': params[5], 'confirmation_overdue': params[6]}
        self.assertEqual(company_attention_issues(after), [])


if __name__ == '__main__':
    unittest.main()
