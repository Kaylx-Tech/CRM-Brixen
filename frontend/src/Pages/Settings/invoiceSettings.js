// Settings → Invoices: country bank-account forms and the JSON the server stores

const NAME = ['account_name', 'Account name', 'Acme Accountants Ltd']
const BANK = ['bank_name', 'Bank name', '']
const SWIFT = ['swift', 'SWIFT / BIC', '']

// Bank details each country's customers need to pay (code, name, currency, [field key, label, placeholder])
export const INVOICE_COUNTRIES = [
  ['GB', 'United Kingdom', 'GBP', [NAME, BANK, ['account_number', 'Account number', '12345678'], ['sort_code', 'Sort code', '00-00-00'], ['iban', 'IBAN', 'GB00 XXXX 0000 0000 0000 00'], SWIFT]],
  ['PK', 'Pakistan', 'PKR', [['account_name', 'Account title', ''], BANK, ['account_number', 'Account number', ''], ['iban', 'IBAN', 'PK00 XXXX 0000 0000 0000 0000'], ['branch_code', 'Branch code', ''], SWIFT]],
  ['AE', 'United Arab Emirates', 'AED', [NAME, BANK, ['account_number', 'Account number', ''], ['iban', 'IBAN', 'AE00 0000 0000 0000 0000 000'], SWIFT]],
  ['US', 'United States', 'USD', [NAME, BANK, ['account_number', 'Account number', ''], ['routing_number', 'Routing number (ABA)', '000000000'], ['account_type', 'Account type', 'Checking'], SWIFT]],
  ['EU', 'Ireland / Eurozone', 'EUR', [NAME, BANK, ['iban', 'IBAN', 'IE00 XXXX 0000 0000 0000 00'], ['bic', 'BIC / SWIFT', '']]],
  ['IN', 'India', 'INR', [NAME, BANK, ['account_number', 'Account number', ''], ['ifsc', 'IFSC code', 'ABCD0123456'], SWIFT]],
  ['CA', 'Canada', 'CAD', [NAME, BANK, ['account_number', 'Account number', ''], ['transit_number', 'Transit number', '00000'], ['institution_number', 'Institution number', '000'], SWIFT]],
  ['AU', 'Australia', 'AUD', [NAME, BANK, ['bsb', 'BSB', '000-000'], ['account_number', 'Account number', ''], SWIFT]],
  ['SA', 'Saudi Arabia', 'SAR', [NAME, BANK, ['iban', 'IBAN', 'SA00 0000 0000 0000 0000 0000'], SWIFT]],
  ['OTHER', 'Other country', '', [NAME, BANK, ['account_number', 'Account number', ''], ['iban', 'IBAN', ''], SWIFT, ['other', 'Other details', '']]],
]
export const COUNTRY = Object.fromEntries(INVOICE_COUNTRIES.map((c) => [c[0], c]))

let nextId = 1

function parseList(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
export const newId = () => `row-${nextId++}`

/** Saved JSON → rows the tab edits ({id, code, country, currency, values: {key: value}}). */
export function accountsFromSaved(raw) {
  return parseList(raw).map((item) => {
    const code = COUNTRY[item.code] ? item.code : 'OTHER'
    const defs = COUNTRY[code][3]
    const values = {}
    for (const field of item.fields || []) {
      const def = defs.find(([key, label]) => key === field.key || label === field.label)
      if (def) values[def[0]] = field.value
      else values.other = [values.other, `${field.label}: ${field.value}`].filter(Boolean).join('; ')
    }
    return { id: newId(), code, country: item.country || '', currency: item.currency || '', values }
  })
}

/** Rows → the JSON the server stores (labels kept, so invoices need no country table). */
export function accountsToSaved(rows) {
  return JSON.stringify(rows.map((row) => {
    const [code, name, currency, defs] = COUNTRY[row.code]
    return {
      code,
      country: code === 'OTHER' ? (row.country || '').trim() : name,
      currency: code === 'OTHER' ? (row.currency || '').trim().toUpperCase() : currency,
      fields: defs
        .map(([key, label]) => ({ key, label, value: (row.values[key] || '').trim() }))
        .filter((f) => f.value),
    }
  }).filter((a) => a.fields.length))
}

export function linksFromSaved(raw) {
  return parseList(raw).map((l) => ({ id: newId(), label: l.label || '', url: l.url || '' }))
}

export function linksToSaved(rows) {
  return JSON.stringify(rows
    // "www.acme.com" → "https://www.acme.com" (the server only accepts https:// or mailto: links)
    .map((l) => ({ label: l.label.trim(), url: l.url.trim().replace(/^(?!https?:\/\/|mailto:)(?=\S+\.\S)/i, 'https://') }))
    .filter((l) => l.url))
}
