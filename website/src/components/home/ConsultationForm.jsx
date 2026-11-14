"use client"

import { useState } from "react"
import { SITE } from "@/lib/site"

const WHATSAPP = SITE.phoneHref.replace("tel:+", "")

/**
 * "Book a free consultation". Until the CRM has a public enquiry address, the details open in WhatsApp as a ready
 * message to Brixen (the same number as the site's WhatsApp button), so nothing typed here is lost.
 */
export default function ConsultationForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", service: "UK Formation (LTD)", budget: "", message: "" })
  const [error, setError] = useState("")
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.message.trim()) {
      setError("Please fill in your name, email, WhatsApp number and message.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      setError("Please enter a valid email address.")
      return
    }
    setError("")
    const text = [
      "Free consultation request",
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      `WhatsApp: ${form.phone}`,
      form.company && `Company: ${form.company}`,
      `Service: ${form.service}`,
      form.budget && `Budget: ${form.budget}`,
      `Message: ${form.message}`,
    ].filter(Boolean).join("\n")
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`, "_blank", "noopener")
  }

  const input = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
      <input className={input} placeholder="Name*" value={form.name} onChange={set("name")} autoComplete="name" aria-label="Name" />
      <input className={input} placeholder="Email*" type="email" value={form.email} onChange={set("email")} autoComplete="email" aria-label="Email" />
      <input className={input} placeholder="WhatsApp number*" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" aria-label="WhatsApp number" />
      <input className={input} placeholder="Company name" value={form.company} onChange={set("company")} autoComplete="organization" aria-label="Company name" />
      <select className={input} value={form.service} onChange={set("service")} aria-label="Service">
        <option>UK Formation (LTD)</option>
        <option>Business Bank Account</option>
        <option>Registered Office Address</option>
        <option>Identity Verification (KYC)</option>
        <option>Other</option>
      </select>
      <input className={input} placeholder="Budget (£)" value={form.budget} onChange={set("budget")} aria-label="Budget" />
      <textarea className={`${input} sm:col-span-2`} rows={4} placeholder="Write your message…*" value={form.message} onChange={set("message")} aria-label="Message" />
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <button type="submit" className="rounded-full bg-brand-blue px-6 py-3.5 font-semibold text-white transition hover:bg-brand-navy sm:col-span-2">
        Submit Now
      </button>
    </form>
  )
}
