"""Smart Intake passport checks (check digits, expiry, page vs MRZ, sample passports).

Run from backend/:  py -m unittest tests.test_document_checks -v
"""
import datetime
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.document_checks import check_passport, mrz_check_digit  # noqa: E402

TODAY = datetime.date(2026, 11, 18)


def make_line2(number='AB1234567', nat='GBR', dob='850314', sex='M', expiry='340101', personal='<' * 14):
    """A passport's bottom line with correct check digits."""
    n_cd = str(mrz_check_digit(number))
    d_cd = str(mrz_check_digit(dob))
    e_cd = str(mrz_check_digit(expiry))
    p_cd = '<' if set(personal) == {'<'} else str(mrz_check_digit(personal))
    composite = number + n_cd + dob + d_cd + expiry + e_cd + personal + p_cd
    return number + n_cd + nat + dob + d_cd + sex + expiry + e_cd + personal + p_cd + str(mrz_check_digit(composite))


LINE1 = 'P<GBRSMITH<<JOHN<JAMES<<<<<<<<<<<<<<<<<<<<<<'
PAGE = (
    'UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND\n'
    'PASSPORT\nSurname SMITH\nGiven names JOHN JAMES\nNationality BRITISH CITIZEN\n'
    'Date of birth 14 MAR 1985\nDate of issue 01 JAN 2024\nDate of expiry 01 JAN 2034\n'
)


def passport(line2=None, page=PAGE, line1=LINE1):
    return f'{page}{line1}\n{line2 or make_line2()}\n'


def failed(result):
    return {c['key'] for c in result['checks'] if not c['ok']}


class CheckDigitTests(unittest.TestCase):
    def test_icao_examples(self):
        # ICAO 9303 specimen: L898902C3 -> 6, 740812 -> 2, 120415 -> 9
        self.assertEqual(mrz_check_digit('L898902C3'), 6)
        self.assertEqual(mrz_check_digit('740812'), 2)
        self.assertEqual(mrz_check_digit('120415'), 9)


class PassportCheckTests(unittest.TestCase):
    def test_genuine_looking_passport_passes(self):
        result = check_passport(passport(), today=TODAY)
        self.assertEqual(result['status'], 'passed', result)
        self.assertEqual(result['label'], 'Looks Good')

    def test_edited_date_of_birth_is_caught(self):
        line2 = make_line2()
        tampered = line2[:13] + '860314' + line2[19:]  # 1985 changed to 1986, check digits left alone
        result = check_passport(passport(tampered), today=TODAY)
        self.assertEqual(result['status'], 'review')
        self.assertIn('dob_digit', failed(result))

    def test_edited_passport_number_is_caught(self):
        line2 = make_line2()
        tampered = 'AB1234568' + line2[9:]
        result = check_passport(passport(tampered), today=TODAY)
        self.assertIn('number_digit', failed(result))
        self.assertIn('line_digit', failed(result))

    def test_expired_passport(self):
        result = check_passport(passport(make_line2(expiry='240101')), today=TODAY)
        self.assertEqual(result['status'], 'review')
        self.assertIn('not_expired', failed(result))

    def test_page_date_of_birth_differs_from_mrz(self):
        page = PAGE.replace('14 MAR 1985', '20 JUN 1990')
        result = check_passport(passport(page=page), today=TODAY)
        self.assertIn('page_dob', failed(result))

    def test_page_name_differs_from_mrz(self):
        page = PAGE.replace('SMITH', 'BROWN')
        result = check_passport(passport(page=page), today=TODAY)
        self.assertIn('page_name', failed(result))

    def test_icao_specimen_is_flagged(self):
        text = (
            'PASSPORT SPECIMEN\nP<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n'
            'L898902C36UTO7408122F1204159ZE184226B<<<<<10\n'
        )
        result = check_passport(text, today=TODAY)
        self.assertEqual(result['status'], 'review')
        self.assertIn('not_specimen', failed(result))
        # Its check digits themselves are right
        self.assertNotIn('number_digit', failed(result))
        self.assertNotIn('line_digit', failed(result))

    def test_ocr_spaces_inside_mrz(self):
        line2 = make_line2()
        spaced = ' '.join(line2[i:i + 11] for i in range(0, 44, 11))
        result = check_passport(passport(spaced), today=TODAY)
        self.assertEqual(result['status'], 'passed', result)

    def test_no_mrz_is_not_checked(self):
        result = check_passport('Some photo with no passport lines', today=TODAY)
        self.assertEqual(result['status'], 'not_checked')
        self.assertEqual(result['label'], 'Could Not Check')


if __name__ == '__main__':
    unittest.main()
