"""The Companies House forms the Gov Forms engine knows (services/gov_forms.py does the work).

Each form is plain data: its sections and fields. A field says
  key, label, type      text | textarea | date | select | checkbox | checks | pick | country
  required              must be filled before the form is Ready
  source                where its value comes from ("company.name", "company.office.postcode", "today" …)
  pick                  for type pick: which list to choose from ("directors" / "pscs"), and `fill` = which
                        fields the chosen person fills ({field key: person attribute})
  check                 extra checks: postcode, company_number, past_date, adult_dob, personal_code
  when                  only shown when another field has a value ({"key": value})
  help                  one short hint
To add a form: add one entry to FORMS (no other code is needed).
"""

UK_COUNTRIES = ['England', 'Wales', 'Scotland', 'Northern Ireland']
JURISDICTION_COUNTRIES = {
    'england-wales': ['England', 'Wales'],
    'scotland': ['Scotland'],
    'northern-ireland': ['Northern Ireland'],
}

# Nature of control on a PSC notice (PSC01), as on the register
CONTROL_OPTIONS = [
    ('shares-25-to-50', 'Holds more than 25% but not more than 50% of the shares'),
    ('shares-50-to-75', 'Holds more than 50% but less than 75% of the shares'),
    ('shares-75-to-100', 'Holds 75% or more of the shares'),
    ('votes-25-to-50', 'Holds more than 25% but not more than 50% of the voting rights'),
    ('votes-50-to-75', 'Holds more than 50% but less than 75% of the voting rights'),
    ('votes-75-to-100', 'Holds 75% or more of the voting rights'),
    ('appoint-directors', 'Has the right to appoint or remove the majority of the board of directors'),
    ('significant-influence', 'Has the right to exercise, or actually exercises, significant influence or control'),
]


def _company():
    return {'title': 'Company', 'fields': [
        {'key': 'company_name', 'label': 'Company Name', 'type': 'text', 'required': True, 'source': 'company.name',
         'readonly': True},
        {'key': 'company_number', 'label': 'Company Number', 'type': 'text', 'required': True,
         'source': 'company.number', 'readonly': True, 'check': 'company_number'},
    ]}


def _address(prefix, title, source=None, required=True, help_text=''):
    """The parts of a UK-style address, as Companies House asks for them."""
    src = (lambda part: f"{source}.{part}") if source else (lambda part: None)
    fields = [
        {'key': f'{prefix}_premises', 'label': 'Building Name or Number', 'type': 'text', 'required': required,
         'source': src('premises')},
        {'key': f'{prefix}_line_1', 'label': 'Street', 'type': 'text', 'required': required,
         'source': src('address_line_1')},
        {'key': f'{prefix}_line_2', 'label': 'Area (Optional)', 'type': 'text', 'source': src('address_line_2')},
        {'key': f'{prefix}_town', 'label': 'Post Town', 'type': 'text', 'required': required,
         'source': src('locality')},
        {'key': f'{prefix}_region', 'label': 'County / Region (Optional)', 'type': 'text', 'source': src('region')},
        {'key': f'{prefix}_postcode', 'label': 'Postcode', 'type': 'text', 'required': required,
         'source': src('postal_code'), 'check': 'postcode'},
        {'key': f'{prefix}_country', 'label': 'Country', 'type': 'country', 'required': required,
         'source': src('country')},
    ]
    return {'title': title, 'help': help_text, 'fields': fields}


def _person(prefix='person', identity=True):
    fields = [
        {'key': 'title', 'label': 'Title (Optional)', 'type': 'text'},
        {'key': 'first_names', 'label': 'First Name(s)', 'type': 'text', 'required': True},
        {'key': 'surname', 'label': 'Surname', 'type': 'text', 'required': True},
        {'key': 'former_names', 'label': 'Former Names (Optional)', 'type': 'text',
         'help': 'Names used for business in the last 20 years'},
        {'key': 'date_of_birth', 'label': 'Date of Birth', 'type': 'date', 'required': True, 'check': 'adult_dob'},
        {'key': 'nationality', 'label': 'Nationality', 'type': 'text', 'required': True},
        {'key': 'country_of_residence', 'label': 'Country or State of Usual Residence', 'type': 'text',
         'required': True},
    ]
    if identity:
        fields.append({'key': 'personal_code', 'label': 'Companies House Personal Code', 'type': 'text',
                       'required': True, 'check': 'personal_code',
                       'help': 'From identity verification: 11 letters and numbers'})
    return {'title': 'Person', 'fields': fields}


FORMS = {
    'AD01': {
        'title': 'Change of Registered Office Address',
        'purpose': 'Move the company\'s registered office to a new address.',
        'webfiling': 'Change of registered office address (AD01)',
        'sections': [
            _company(),
            {'title': 'Current Registered Office', 'fields': [
                {'key': 'current_office', 'label': 'Current Address', 'type': 'textarea', 'readonly': True,
                 'source': 'company.office_text'},
            ]},
            _address('new', 'New Registered Office',
                     help_text='Must be in the same country the company is registered in, and an address where '
                               'post can be received (not a PO Box only).'),
            {'title': 'Signed By', 'fields': [
                {'key': 'signer', 'label': 'Director or Secretary', 'type': 'pick', 'required': True,
                 'pick': 'directors', 'fill': {'signer_name': 'name'}},
                {'key': 'signer_name', 'label': 'Name', 'type': 'text', 'required': True},
            ]},
        ],
    },
    'AP01': {
        'title': 'Appoint a Director',
        'purpose': 'Add a new individual director (the person must have verified their identity).',
        'webfiling': 'Appointment of director (AP01)',
        'sections': [
            _company(),
            {'title': 'Appointment', 'fields': [
                {'key': 'appointment_date', 'label': 'Date of Appointment', 'type': 'date', 'required': True,
                 'source': 'today', 'check': 'past_date'},
                {'key': 'occupation', 'label': 'Occupation', 'type': 'text', 'required': True},
            ]},
            _person(),
            _address('service', 'Service Address (Public)',
                     help_text='Shown on the public register. Can be the registered office.'),
            {'title': 'Usual Residential Address', 'fields': [
                {'key': 'home_same_as_service', 'label': 'Same as the service address', 'type': 'checkbox'},
            ]},
            {**_address('home', 'Home Address (Kept Private)', required=True),
             'when': {'home_same_as_service': False}},
            {'title': 'Consent', 'fields': [
                {'key': 'consent', 'label': 'The person has agreed to act as a director', 'type': 'checkbox',
                 'required': True},
            ]},
        ],
    },
    'TM01': {
        'title': 'Remove a Director',
        'purpose': 'A director resigned or was removed.',
        'webfiling': 'Termination of appointment of director (TM01)',
        'sections': [
            _company(),
            {'title': 'Director Leaving', 'fields': [
                {'key': 'officer', 'label': 'Director', 'type': 'pick', 'required': True, 'pick': 'directors',
                 'fill': {'officer_name': 'name', 'officer_dob': 'date_of_birth',
                          'officer_appointed': 'appointed_on'}},
                {'key': 'officer_name', 'label': 'Full Name', 'type': 'text', 'required': True, 'readonly': True},
                {'key': 'officer_dob', 'label': 'Date of Birth (Month and Year)', 'type': 'text', 'readonly': True},
                {'key': 'officer_appointed', 'label': 'Appointed On', 'type': 'text', 'readonly': True},
                {'key': 'termination_date', 'label': 'Date the Appointment Ended', 'type': 'date', 'required': True,
                 'source': 'today', 'check': 'past_date'},
            ]},
        ],
    },
    'CH01': {
        'title': 'Change a Director\'s Details',
        'purpose': 'A director\'s name, nationality, occupation, residence or addresses changed.',
        'webfiling': 'Change of director\'s details (CH01)',
        'sections': [
            _company(),
            {'title': 'Director', 'fields': [
                {'key': 'officer', 'label': 'Director', 'type': 'pick', 'required': True, 'pick': 'directors',
                 'fill': {'officer_name': 'name', 'officer_dob': 'date_of_birth'}},
                {'key': 'officer_name', 'label': 'Name on the Register', 'type': 'text', 'required': True,
                 'readonly': True},
                {'key': 'officer_dob', 'label': 'Date of Birth (Month and Year)', 'type': 'text', 'readonly': True},
                {'key': 'change_date', 'label': 'Date of Change', 'type': 'date', 'required': True,
                 'source': 'today', 'check': 'past_date'},
            ]},
            {'title': 'What Changed', 'help': 'Fill in only what changed.', 'fields': [
                {'key': 'new_name', 'label': 'New Full Name', 'type': 'text'},
                {'key': 'new_nationality', 'label': 'New Nationality', 'type': 'text'},
                {'key': 'new_occupation', 'label': 'New Occupation', 'type': 'text'},
                {'key': 'new_residence', 'label': 'New Country or State of Usual Residence', 'type': 'text'},
                {'key': 'address_changed', 'label': 'The service or home address changed', 'type': 'checkbox'},
            ]},
            {**_address('service', 'New Service Address', required=False), 'when': {'address_changed': True}},
        ],
        'needs_one_of': ['new_name', 'new_nationality', 'new_occupation', 'new_residence', 'address_changed'],
    },
    'PSC01': {
        'title': 'Add a Person With Significant Control',
        'purpose': 'Someone now owns or controls the company (more than 25% of shares or votes, or control).',
        'webfiling': 'Notice of individual person with significant control (PSC01)',
        'sections': [
            _company(),
            {'title': 'Date', 'fields': [
                {'key': 'notified_date', 'label': 'Date They Became a PSC', 'type': 'date', 'required': True,
                 'source': 'today', 'check': 'past_date'},
            ]},
            _person(),
            _address('service', 'Service Address (Public)'),
            {'title': 'Nature of Control', 'fields': [
                {'key': 'control', 'label': 'How They Control the Company', 'type': 'checks', 'required': True,
                 'options': CONTROL_OPTIONS},
            ]},
        ],
    },
    'PSC07': {
        'title': 'Remove a Person With Significant Control',
        'purpose': 'Someone is no longer a person with significant control.',
        'webfiling': 'Notice of ceasing to be a person with significant control (PSC07)',
        'sections': [
            _company(),
            {'title': 'Person', 'fields': [
                {'key': 'psc', 'label': 'Person With Significant Control', 'type': 'pick', 'required': True,
                 'pick': 'pscs', 'fill': {'psc_name': 'name', 'psc_notified': 'notified_on'}},
                {'key': 'psc_name', 'label': 'Name', 'type': 'text', 'required': True, 'readonly': True},
                {'key': 'psc_notified', 'label': 'Became a PSC On', 'type': 'text', 'readonly': True},
                {'key': 'ceased_date', 'label': 'Date They Stopped Being a PSC', 'type': 'date', 'required': True,
                 'source': 'today', 'check': 'past_date'},
            ]},
        ],
    },
    'AA01': {
        'title': 'Change the Year End (Accounting Reference Date)',
        'purpose': 'Shorten or extend the current or previous financial year.',
        'webfiling': 'Change of accounting reference date (AA01)',
        'sections': [
            _company(),
            {'title': 'Accounting Period', 'fields': [
                {'key': 'period_start', 'label': 'Current Period Started On', 'type': 'date',
                 'source': 'company.period_start', 'readonly': True},
                {'key': 'current_end', 'label': 'Current Period Ends On', 'type': 'date', 'required': True,
                 'source': 'company.period_end'},
                {'key': 'new_end', 'label': 'New Period End Date', 'type': 'date', 'required': True},
                {'key': 'extended_before', 'label': 'The year end was extended in the last 5 years',
                 'type': 'checkbox',
                 'help': 'A period can be extended only once in 5 years (some exceptions), up to 18 months.'},
            ]},
        ],
    },
    'CS01': {
        'title': 'Confirmation Statement',
        'purpose': 'Confirm once a year that what Companies House holds about the company is right.',
        'webfiling': 'Confirmation statement (CS01)',
        'sections': [
            _company(),
            {'title': 'Confirmation Period', 'fields': [
                {'key': 'made_up_to', 'label': 'Confirmation Date (Made Up To)', 'type': 'date', 'required': True,
                 'source': 'company.cs_made_up_to', 'check': 'past_date',
                 'help': 'The date the statement confirms the details on; at most 12 months after the last one.'},
                {'key': 'due', 'label': 'Due By', 'type': 'text', 'source': 'company.cs_due', 'readonly': True},
            ]},
            {'title': 'Company Details', 'fields': [
                {'key': 'registered_office', 'label': 'Registered Office (on the register)', 'type': 'textarea',
                 'source': 'company.office_text', 'readonly': True,
                 'help': 'To change it, file AD01 first.'},
                {'key': 'sic_codes', 'label': 'SIC Codes (What the Company Does)', 'type': 'text', 'required': True,
                 'source': 'company.sic_text', 'help': 'Up to 4 codes, separated by commas.'},
            ]},
            {'title': 'Shares and Shareholders', 'fields': [
                {'key': 'no_capital_change', 'label': 'No change to the share capital since the last statement',
                 'type': 'checkbox'},
                {'key': 'capital_changes', 'label': 'What Changed in the Share Capital', 'type': 'textarea',
                 'required': True, 'when': {'no_capital_change': False},
                 'help': 'Class, number and value of shares now, and what was paid for them.'},
                {'key': 'no_shareholder_change', 'label': 'No change to the shareholders since the last statement',
                 'type': 'checkbox'},
                {'key': 'shareholder_changes', 'label': 'Shareholder Changes', 'type': 'textarea', 'required': True,
                 'when': {'no_shareholder_change': False},
                 'help': 'Who now holds shares and how many (and any transfers).'},
            ]},
            {'title': 'Codes for Filing', 'fields': [
                {'key': 'auth_code', 'label': 'Company Authentication Code', 'type': 'text', 'required': True,
                 'source': 'company.auth_code', 'check': 'auth_code',
                 'help': 'The 6-character code Companies House posted to the registered office.'},
                {'key': 'personal_code', 'label': "Director's Personal Code", 'type': 'text', 'required': True,
                 'source': 'company.personal_code', 'check': 'personal_code',
                 'help': 'From identity verification: 11 letters and numbers.'},
            ]},
            {'title': 'Statement', 'help': 'Directors, secretary and PSC changes are filed on their own forms first '
                                          '(AP01, TM01, CH01, PSC01, PSC07).', 'fields': [
                {'key': 'people_correct', 'label': 'The directors and PSCs on the register are right',
                 'type': 'checkbox', 'required': True},
                {'key': 'lawful_purpose', 'label': "The company's intended future activities are lawful",
                 'type': 'checkbox', 'required': True},
            ]},
        ],
    },
    'RT01': {
        'title': 'Restore a Struck-Off Company (Administrative Restoration)',
        'purpose': 'Bring a company that Companies House struck off back to the register, within 6 years.',
        'webfiling': 'Application for administrative restoration to the register (RT01)',
        'sections': [
            _company(),
            {'title': 'Dissolution', 'fields': [
                {'key': 'dissolved_on', 'label': 'Date the Company Was Dissolved', 'type': 'date', 'required': True,
                 'source': 'company.dissolved_on', 'check': 'within_6_years',
                 'help': 'Restoration this way is possible for 6 years after dissolution.'},
                {'key': 'struck_off_by_registrar', 'label': 'Companies House struck it off (the company did not '
                                                          'apply to close itself)', 'type': 'checkbox',
                 'required': True, 'help': 'A company that applied to be struck off (DS01) is restored by court.'},
            ]},
            {'title': 'Applicant', 'help': 'A former director or a former member (shareholder).', 'fields': [
                {'key': 'applicant_name', 'label': 'Full Name', 'type': 'text', 'required': True},
                {'key': 'applicant_capacity', 'label': 'Applying As', 'type': 'select', 'required': True,
                 'options': [['director', 'Former director'], ['member', 'Former member (shareholder)']]},
            ]},
            _address('applicant', 'Applicant Address'),
            {'title': 'Conditions', 'help': 'All must be met before Companies House restores the company.',
             'fields': [
                 {'key': 'was_trading', 'label': 'The company was in business or in operation when struck off',
                  'type': 'checkbox', 'required': True},
                 {'key': 'records_up_to_date', 'label': 'All overdue documents (accounts, confirmation statements) '
                                                       'go with the application', 'type': 'checkbox',
                  'required': True},
                 {'key': 'penalties_paid', 'label': 'Late filing penalties from before dissolution will be paid',
                  'type': 'checkbox', 'required': True},
                 {'key': 'bona_vacantia', 'label': "The Crown representative's (Bona Vacantia) waiver letter is "
                                                  'included', 'type': 'checkbox', 'required': True,
                  'help': "The company's property went to the Crown when it was dissolved; their consent is needed."},
                 {'key': 'fee_paid', 'label': 'The restoration fee is paid', 'type': 'checkbox', 'required': True},
             ]},
        ],
    },
    'DS01': {
        'title': 'Close the Company (Striking Off Application)',
        'purpose': 'Ask Companies House to strike off a company that has stopped trading.',
        'webfiling': 'Striking off application by a company (DS01)',
        'sections': [
            _company(),
            {'title': 'Checks Before Applying', 'help': 'All must be true; otherwise strike-off is the wrong route.',
             'fields': [
                 {'key': 'no_trading', 'label': 'No trading or business in the last 3 months', 'type': 'checkbox',
                  'required': True},
                 {'key': 'no_name_change', 'label': 'No change of name in the last 3 months', 'type': 'checkbox',
                  'required': True},
                 {'key': 'no_insolvency', 'label': 'Not insolvent and no insolvency proceedings', 'type': 'checkbox',
                  'required': True},
                 {'key': 'will_notify', 'label': 'A copy will go to shareholders, creditors, employees and any '
                                                 'directors who do not sign, within 7 days', 'type': 'checkbox',
                  'required': True},
             ]},
            {'title': 'Directors Signing', 'help': 'A majority of the directors must sign.', 'fields': [
                {'key': 'signers', 'label': 'Signing Directors', 'type': 'checks', 'required': True,
                 'options_from': 'directors'},
            ]},
        ],
    },
}
