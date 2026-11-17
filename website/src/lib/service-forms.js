/**
 * The order form of each service ("details" pages), as on the WordPress site's service plugins.
 * A form is a list of sections; each field: { name, label, type, required, options, hint, role, priceAdd, showIf }.
 *   type: text | email | tel | date | textarea | select | country | radio | checkbox | file | repeat
 *   role: which answer is the customer's email / name / phone or the company (sent to the CRM by name)
 *   priceAdd: { value: extra £ } for a choice that changes the price (the CRM checks it too)
 * The standard "Your Details", "Your Address" and "Invoice Address" sections are added with DETAILS / ADDRESS.
 */

const COMPANY = {
  title: "Your Company Information",
  text: "Please provide details of your company:",
  fields: [
    { name: "company_name", label: "Your Company Name", required: true, role: "company_name" },
    { name: "company_number", label: "Your Company Number", required: true, role: "company_number" },
  ],
}
const COMPANY_DETAILS = {
  ...COMPANY,
  fields: [...COMPANY.fields, { name: "details", label: "Details", type: "textarea", required: true, hint: "Tell us anything we should know for this order." }],
}
const DETAILS = {
  title: "Your Details",
  text: "Please provide details of yourself:",
  fields: [
    { name: "first_name", label: "First Name", required: true, role: "first_name" },
    { name: "last_name", label: "Last Name", required: true, role: "last_name" },
    { name: "telephone", label: "Telephone Number", type: "tel", required: true, role: "phone" },
    { name: "email", label: "Email Address", type: "email", required: true, role: "email" },
  ],
}
const ADDRESS = [
  {
    title: "Your Address",
    text: "Please enter your correspondence address:",
    fields: [
      { name: "address_name", label: "Name/Company", required: true },
      { name: "address_line1", label: "Address Line 1", required: true, wide: true },
      { name: "address_line2", label: "Address Line 2", wide: true },
      { name: "house_number", label: "House Name/Number", required: true },
      { name: "town", label: "Town", required: true },
      { name: "county", label: "County", required: true },
      { name: "postcode", label: "Postcode", required: true },
      { name: "address_country", label: "Country", type: "country", required: true },
    ],
  },
  {
    title: "Your Invoice Address",
    text: "The name and address we will use to invoice you.",
    fields: [
      {
        name: "same_invoice_address",
        label: "Is your invoice address the same as Your Address (above)?",
        type: "radio",
        required: true,
        options: [["yes", "Yes"], ["no", "No"]],
        wide: true,
      },
      ...[
        ["invoice_name", "Name/Company", true],
        ["invoice_address_line1", "Address Line 1", true],
        ["invoice_address_line2", "Address Line 2", false],
        ["invoice_house_number", "House Name/Number", true],
        ["invoice_town", "Town", true],
        ["invoice_county", "County", true],
        ["invoice_postcode", "Postcode", true],
      ].map(([name, label, required]) => ({ name, label: `Invoice ${label}`, required, showIf: ["same_invoice_address", "no"] })),
      { name: "invoice_country", label: "Invoice Country", type: "country", required: true, showIf: ["same_invoice_address", "no"] },
    ],
  },
]
const DOB_HINT =
  "We require your date of birth to carry out a digital ID check under the Money Laundering Regulations, the London Local Authorities Act 2007 and Know Your Customer (KYC) requirements. You must be at least sixteen years old."
const FULL = (...sections) => [...sections, DETAILS, ...ADDRESS]
const SHORT = [COMPANY_DETAILS, DETAILS]

export const SERVICE_FORMS = {
  "kyc-verification": SHORT,
  "vat-registration": SHORT,
  "business-mail-forwarding-address": SHORT,
  "confirmation-statement": FULL(
    {
      title: "Service",
      text: "Please select below if you wish to order the Standard or Express service.",
      fields: [
        {
          name: "service_type",
          label: "Service type",
          type: "radio",
          required: true,
          wide: true,
          options: [
            ["Standard (Confirmation statement filed in accordance with due date)", "Standard (Confirmation statement filed in accordance with due date)"],
            ["Express (Confirmation statement filed within 24 hours)", "Express (Confirmation statement filed within 24 hours)"],
          ],
        },
      ],
    },
    COMPANY
  ),
  "company-dissolution": FULL(
    { title: "Director Information", text: "Please provide the full names of the company's directors:", fields: [{ name: "directors", label: "Director's Full Name", type: "repeat", required: true, max: 6 }] },
    COMPANY
  ),
  "company-name-change": FULL({
    title: "Company Information",
    text: "Please provide details of your company:",
    fields: [
      { name: "existing_company_name", label: "Existing Company Name", required: true, role: "company_name" },
      { name: "company_number", label: "Your Company Number", required: true, role: "company_number" },
      { name: "new_company_name", label: "New Company Name", required: true },
      { name: "resolution_date", label: "Date of Resolution", type: "date", required: true, hint: "The date of the resolution to change the company name." },
      { name: "shareholders", label: "Shareholder's Full Name", type: "repeat", required: true, max: 8, wide: true, hint: "If there are multiple shareholders, you can add more." },
    ],
  }),
  "dormant-company-accounts": FULL(
    {
      title: "Director & Shares",
      fields: [
        { name: "director_name", label: "Director's Full Name", required: true },
        {
          name: "share_status",
          label: "Were the shares issued at incorporation paid for?",
          type: "radio",
          required: true,
          wide: true,
          options: [["shares_paid", "Shares Paid"], ["shares_unpaid", "Shares Unpaid"], ["dont_know", "Don't Know"]],
          hint: "If you don't know if the shares are paid or unpaid, we will submit your accounts with the shares marked 'paid'. This ensures the shareholders do not incur a potential S419 tax claim from HMRC, due to the company lending the shareholders the value of the shares.",
        },
      ],
    },
    COMPANY
  ),
  "directors-appointment-or-resignation": FULL(
    {
      title: "Director Information",
      text: "Please choose director appointment or director resignation, and give the director's details:",
      fields: [
        { name: "service_type", label: "Service", type: "radio", required: true, wide: true, options: [["appointment", "Director appointment"], ["resignation", "Director resignation"]] },
        { name: "director_full_name", label: "Full Name", required: true },
        { name: "director_dob", label: "Date of Birth", type: "date", required: true },
        { name: "director_occupation", label: "Occupation", required: true },
        { name: "director_nationality", label: "Nationality", required: true },
        { name: "action_date", label: "Appointment/Resignation Date", type: "date", required: true },
        { name: "director_residential_address", label: "Residential Address", required: true, wide: true, hint: "Include the full address with postcode." },
        { name: "director_service_address", label: "Service Address", required: true, wide: true },
      ],
    },
    COMPANY
  ),
  "company-secretary": FULL(COMPANY),
  "certification-of-good-standing": FULL(
    {
      title: "Delivery",
      text: "Please choose a preferred delivery option:",
      fields: [
        {
          name: "delivery_option",
          label: "Delivery Option",
          type: "radio",
          required: true,
          wide: true,
          options: [["royal_mail", "Royal Mail Normal Delivery"], ["dhl_delivery", "DHL Delivery (+£50)"]],
          priceAdd: { dhl_delivery: 50 },
          hint: "The international tracked & signed mail service is subject to availability, as in some countries it might not be available.",
        },
      ],
    },
    COMPANY
  ),
  "apostilled-documents": FULL(
    {
      title: "Documents",
      fields: [
        {
          name: "document",
          label: "Document to be Apostilled",
          type: "radio",
          required: true,
          wide: true,
          options: ["Certificate of Incorporation", "Memorandum & Articles of Association", "IN01 form from Companies House", "Certificate of Good Standing (CoGS)"].map((d) => [d, d]),
        },
        { name: "country", label: "Country the documents are for", type: "country", required: true },
        {
          name: "delivery",
          label: "Delivery Option",
          type: "radio",
          required: true,
          wide: true,
          options: [
            "Royal Mail Recorded Delivery",
            "Courier (next business day)",
            "Royal Mail International Tracked & Signed (5 to 15 business days)",
            "International Courier (1 to 5 business days)",
          ].map((d) => [d, `${d} · Free`]),
        },
      ],
    },
    COMPANY
  ),
  "registered-office-address": FULL(
    {
      title: "Start Date",
      fields: [
        { name: "start_date", label: "Your start date", type: "date", required: true },
        { name: "date_of_birth", label: "Your date of birth", type: "date", required: true, hint: DOB_HINT },
      ],
    },
    COMPANY
  ),
  "directors-service-address": FULL(
    {
      title: "Start Date",
      fields: [
        { name: "start_date", label: "Your start date", type: "date", required: true },
        {
          name: "number_of_officers",
          label: "Number of officers (directors, shareholders or PSCs)",
          type: "select",
          required: true,
          options: Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]),
        },
        { name: "date_of_birth", label: "Your date of birth", type: "date", required: true, hint: DOB_HINT, wide: true },
      ],
    },
    COMPANY
  ),
  "tide-business-bank": [
    {
      title: "Company Information",
      text: "Please provide details of your company:",
      fields: [
        { name: "company_name", label: "Company Name", required: true, role: "company_name" },
        { name: "company_number", label: "Company Number", required: true, role: "company_number" },
      ],
    },
    {
      title: "Required Documents",
      text: "Please upload the required documents (PDF, JPG, PNG or Word, max 15 MB each):",
      fields: [
        { name: "valid_passport", label: "Valid Passport", type: "file", required: true },
        { name: "trading_proof", label: "Business Trading Proof (Website or Selling Platform)", hint: "If you don't have one yet, we can create it." },
        { name: "bank_statement", label: "Local Bank Statement (Last 3 months)", type: "file", required: true, multiple: true },
      ],
    },
    {
      title: "Contact Information",
      text: "Please provide your contact details:",
      fields: [
        { name: "full_name", label: "Your Full Name", required: true, role: "name" },
        { name: "email", label: "Email Address", type: "email", required: true, role: "email" },
        { name: "uk_contact", label: "UK Contact Number", type: "tel", required: true, role: "phone", defaultCode: "+44" },
      ],
    },
  ],
  ...Object.fromEntries(["zempler", "wise", "countingup", "ifast", "monzo", "transwap"].map((b) => [`${b}-business-bank`, SHORT])),
  "companies-house-id-verification": [
    {
      title: "Company Information",
      fields: [
        { name: "company_name", label: "Company Name", required: true, role: "company_name" },
        { name: "company_crn", label: "Company Registration Number (CRN)", role: "company_number", hint: "If already registered." },
        {
          name: "registration_status",
          label: "How was your company registered?",
          type: "radio",
          required: true,
          wide: true,
          options: [
            ["registered_elsewhere", "I registered it myself or through another service provider."],
            ["not_registered", "Not registered yet. I would like to register a new company."],
          ],
        },
      ],
    },
    {
      title: "Director Details",
      fields: [
        { name: "director_name", label: "Director Full Name", required: true, role: "name" },
        { name: "date_of_birth", label: "Date of Birth", type: "date", required: true },
        { name: "passport_cnic", label: "Passport/CNIC No.", required: true },
        { name: "issuance_country", label: "Country of issuance for your Passport/CNIC", type: "country", required: true },
        { name: "registered_email", label: "Registered Email", type: "email", required: true, role: "email" },
        { name: "phone", label: "Phone Number", type: "tel", required: true, role: "phone" },
        { name: "company_role", label: "Role in Company", type: "radio", required: true, wide: true, options: [["director", "Director"], ["psc", "PSC (Person with Significant control)"], ["both", "Director & PSC Both"]] },
      ],
    },
    {
      title: "Director Home Address",
      fields: [
        { name: "address_street", label: "Street Address", required: true, wide: true },
        { name: "address_line2", label: "Address Line 2", wide: true },
        { name: "address_city", label: "City", required: true },
        { name: "address_zip", label: "Zip/Postal Code", required: true },
        { name: "address_country", label: "Country", type: "country", required: true },
      ],
    },
    {
      title: "Document Upload",
      text: "PDF, JPG or PNG, max 15 MB each.",
      fields: [
        { name: "photo_id", label: "Director Photo ID", type: "file", required: true, multiple: true, wide: true, hint: "Passport, National ID or Driving licence. All 4 corners and the security features must be visible." },
        { name: "address_proof", label: "Proof of Address", type: "file", required: true, multiple: true, wide: true, hint: "Bank statement or utility bill dated within the last 3 months. Mobile phone bills are not accepted." },
        { name: "has_second_director", label: "This company has more than 1 director or PSC", type: "checkbox", wide: true },
      ],
    },
    {
      title: "Second Director / PSC Details",
      showIf: ["has_second_director", true],
      fields: [
        { name: "director2_name", label: "Director Full Name", required: true },
        { name: "director2_date_of_birth", label: "Date of Birth", type: "date", required: true },
        { name: "director2_passport_cnic", label: "Passport/CNIC No.", required: true },
        { name: "director2_issuance_country", label: "Country of issuance for Passport/CNIC", type: "country", required: true },
        { name: "director2_registered_email", label: "Registered Email", type: "email", required: true },
        { name: "director2_company_role", label: "Role in Company", type: "radio", required: true, wide: true, options: [["director", "Director"], ["psc", "PSC (Person with Significant control)"], ["both", "Director & PSC Both"]] },
        { name: "director2_address_street", label: "Home Street Address", required: true, wide: true },
        { name: "director2_address_line2", label: "Address Line 2", wide: true },
        { name: "director2_address_city", label: "City", required: true },
        { name: "director2_address_zip", label: "Zip/Postal Code", required: true },
        { name: "director2_address_country", label: "Country", type: "country", required: true },
        { name: "director2_photo_id", label: "Second Director Photo ID", type: "file", required: true, multiple: true },
        { name: "director2_address_proof", label: "Second Director Proof of Address", type: "file", required: true, multiple: true },
      ],
    },
    {
      title: "ACSP Compliance Questions",
      fields: [
        {
          name: "verification_purpose",
          label: "Purpose of Verification",
          type: "radio",
          required: true,
          wide: true,
          options: [["uk_incorporation", "UK Company Incorporation"], ["director_psc", "Director / PSC Verification"], ["ongoing_compliance", "Ongoing Compliance (ACSP requirement)"]],
        },
        ...[
          ["is_pep", "Are you a Politically Exposed Person (PEP)?"],
          ["pep_associate", "Are you a family member or close associate of a PEP?"],
          ["subject_to_sanctions", "Are you subject to any sanctions, investigations, or legal proceedings?"],
          ["financial_crime", "Have you ever been convicted of a financial crime?"],
        ].map(([name, label]) => ({ name, label, type: "radio", required: true, wide: true, options: [["yes", "Yes"], ["no", "No"]] })),
        {
          name: "non_refund_ack",
          label:
            "I understand that the verification fee covers the cost of identity and address checks. If my verification fails due to invalid, false, altered, or unverifiable documents, or unsuccessful live biometric verification, the fee is not refundable.",
          type: "checkbox",
          required: true,
          wide: true,
        },
      ],
    },
  ],
}
