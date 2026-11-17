"use client"

import { useEffect, useState } from "react"
import { SITE } from "@/lib/site"

/**
 * The order forms made in the CRM (Services > order form). A service that has one there shows that form on its
 * order page; the others keep their WordPress-style form (src/lib/service-forms.js). The CRM sends them from
 * GET /api/public/service-forms; crmSections() turns one into the sections the order form draws.
 */
let request = null
function loadForms() {
  if (!request) {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 6000))
    const fetched = fetch(`${SITE.apiUrl}/public/service-forms`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && d.forms) || {})
      .catch(() => null)
    request = Promise.race([fetched, timeout]).then((forms) => {
      if (!forms) request = null // try again on the next page
      return forms || {}
    })
  }
  return request
}

/** "loading" until the CRM answers, then the CRM form of this service or null (use the website's own form). */
export function useCrmForm(orderKey) {
  const [state, setState] = useState({ key: null, form: undefined })
  useEffect(() => {
    let live = true
    loadForms().then((forms) => {
      if (live) setState({ key: orderKey, form: forms[orderKey] || null })
    })
    return () => {
      live = false
    }
  }, [orderKey])
  return state.key === orderKey ? state.form : undefined
}

const EMAIL = /e-?mail/i
const PHONE = /(contact|phone|mobile|telephone|whats ?app)/i
const NAME = /^(full name|your name|name|director name|director full name)$/i

/** The CRM form as sections: its questions (answers that open more questions become showIf rules), then
 *  "Your Details" with the name / email / phone the order needs when the CRM form does not ask them. */
export function crmSections(form) {
  const roles = {}
  const fields = []

  const add = (f, showIf) => {
    const name = `crm_${f.id}`
    const field = { name, label: f.label, required: Boolean(f.required), crm: { id: f.id, type: f.type }, showIf }
    if (f.placeholder) field.hint = f.placeholder
    if (f.type === "date") field.type = "date"
    else if (f.type === "file") Object.assign(field, { type: "file", multiple: true })
    else if (f.type === "radio") field.options = (f.options || []).map((o) => [o, o])
    else if (f.type === "checkbox") Object.assign(field, { type: "checkbox", required: false })
    else if (f.type === "company" || f.type === "company_name") {
      if (!roles.company_name && !showIf) {
        field.role = "company_name"
        roles.company_name = true
      }
      field.hint = field.hint || (f.type === "company" ? "Your company's name or Companies House number" : "The name you would like for the new company")
    } else if (EMAIL.test(f.label) && !roles.email) {
      Object.assign(field, { type: "email", role: "email", required: true })
      roles.email = true
    } else if (PHONE.test(f.label) && !roles.phone) {
      Object.assign(field, { type: "tel", role: "phone", required: true, defaultCode: "+44" })
      roles.phone = true
    } else if (NAME.test(f.label.trim()) && !roles.name && !showIf) {
      Object.assign(field, { role: "name", required: true })
      roles.name = true
    }
    if (f.type === "radio") field.type = "radio"
    fields.push(field)
    if (f.type === "radio") (f.option_fields || []).forEach((branch, i) => (branch || []).forEach((sub) => add(sub, [name, f.options[i]])))
    if (f.type === "checkbox") (f.fields || []).forEach((sub) => add(sub, [name, true]))
  }
  for (const f of form.fields || []) add(f)

  const sections = [{ title: "Order Details", text: "Please answer these questions for your order:", fields }]
  const details = [
    !roles.name && { name: "your_name", label: "Full Name", required: true, role: "name" },
    !roles.email && { name: "your_email", label: "Email Address", type: "email", required: true, role: "email" },
    !roles.phone && { name: "your_phone", label: "Contact Number", type: "tel", required: true, role: "phone", defaultCode: "+44" },
  ].filter(Boolean)
  if (details.length) sections.push({ title: "Your Details", text: "So we can send your receipt and contact you about the order:", fields: details })
  return sections
}
