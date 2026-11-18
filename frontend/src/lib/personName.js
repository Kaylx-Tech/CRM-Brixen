/**
 * A form question that asks for a person's name ("Full Name", "Director Full Name", "Applicant Name", "Name"),
 * not a company, trading, bank or user name. Those questions get First Name + Last Name boxes.
 */
const NOT_A_PERSON = /\b(company|business|trading|proposed|brand|bank|account|user|domain|website|file|product|service|shop|store|event|project|team|group|reference|nature|sic)\b/i

export function isPersonNameLabel(label) {
  const text = String(label || "").trim()
  if (!/\bname\b/i.test(text) || NOT_A_PERSON.test(text)) return false
  return true
}

/** Which of the customer's own details a form question asks for: 'name', 'email', 'phone', 'dob', 'address' or null. */
export function customerDetailFor(label) {
  const text = String(label || "").toLowerCase()
  if (isPersonNameLabel(label)) return "name"
  if (/e-?mail/.test(text)) return "email"
  if (/phone|mobile|contact number|telephone/.test(text)) return "phone"
  if (/date of birth|\bdob\b|birth date/.test(text)) return "dob"
  if (/address/.test(text) && !/compan|registered|office|business|trading|email|e-mail/.test(text)) return "address"
  return null
}
