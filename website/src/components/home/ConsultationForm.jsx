"use client"

import { useState } from "react"
import { SITE } from "@/lib/site"

const WHATSAPP = SITE.phoneHref.replace("tel:+", "")
const EMPTY = { name: "", email: "", phone: "", company: "", service: "UK Formation (LTD)", budget: "", message: "", website: "" }

/**
 * "Send us your question" / "Book a free consultation". The question goes to the CRM as a support ticket
 * (POST /public/enquiries) and the team answers it there. If the CRM cannot be reached, the visitor can send the
 * same text on WhatsApp instead, so nothing typed here is lost.
 */
export default function ConsultationForm() {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)
  const [offline, setOffline] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const whatsappLink = () => {
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
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`
  }

  const submit = async (e) => {
    e.preventDefault()
    if (sending) return
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.message.trim()) {
      setError("Please fill in your name, email, WhatsApp number and message.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      setError("Please enter a valid email address.")
      return
    }
    setError("")
    setOffline(false)
    setSending(true)
    try {
      const res = await fetch(`${SITE.apiUrl}/public/enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, page: window.location.pathname }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSent({ ticket: data.ticket_number, email: form.email.trim() })
        setForm(EMPTY)
      } else {
        setError(data.message || "Your message could not be sent. Please try again or send it on WhatsApp.")
        setOffline(res.status >= 500 || res.status === 429)
      }
    } catch {
      setError("Your message could not be sent. Please check your connection or send it on WhatsApp.")
      setOffline(true)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-2xl bg-brand-mist p-6 text-center sm:p-8">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-teal text-white">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
        <p className="mt-4 font-display text-xl font-bold text-brand-navy">Thank you, we have your message</p>
        <p className="mt-2 text-sm text-slate-700">
          Our team will reply to <strong className="break-all">{sent.email}</strong> or on WhatsApp soon.
          {sent.ticket && (
            <>
              {" "}Your reference is <strong>{sent.ticket}</strong>.
            </>
          )}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noreferrer" className="rounded-md bg-[#25d366] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
            Chat on WhatsApp now
          </a>
          <button type="button" onClick={() => setSent(null)} className="rounded-md px-5 py-3 text-sm font-semibold text-brand-blue ring-1 ring-brand-blue/30 transition hover:bg-white">
            Send another question
          </button>
        </div>
      </div>
    )
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
      {/* Hidden from people; robots fill it in and their message is dropped */}
      <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] size-px opacity-0" />
      {error && (
        <p className="text-sm text-red-600 sm:col-span-2">
          {error}
          {offline && (
            <>
              {" "}
              <a href={whatsappLink()} target="_blank" rel="noreferrer" className="font-semibold underline">
                Send it on WhatsApp
              </a>
            </>
          )}
        </p>
      )}
      <button type="submit" disabled={sending} className="rounded-full bg-brand-blue px-6 py-3.5 font-semibold text-white transition hover:bg-brand-navy disabled:opacity-60 sm:col-span-2">
        {sending ? "Sending…" : "Submit Now"}
      </button>
    </form>
  )
}
