"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useSyncExternalStore } from "react"
import { accountApi, PORTAL_LOGIN, saveAccount } from "@/lib/account"
import { buttonClass, Field, inputClass, Notice } from "./AccountParts"

const card = "mx-auto max-w-lg space-y-5 rounded-3xl bg-white p-7 shadow-[0_30px_60px_-40px_rgba(0,57,113,0.5)] ring-1 ring-slate-100 sm:p-10"

/** "Forgot your password?": the CRM emails a link to choose a new one (same answer whether or not the email exists). */
export function LostPassword() {
  const [email, setEmail] = useState("")
  const [state, setState] = useState({ busy: false, msg: "", ok: false })
  async function submit(e) {
    e.preventDefault()
    setState({ busy: true, msg: "", ok: false })
    const res = await accountApi("/forgot-password", { method: "POST", body: { email } })
    setState({ busy: false, ok: res.ok, msg: res.data?.message || (res.ok ? "Check your email." : "Please try again.") })
  }
  return (
    <form onSubmit={submit} className={card}>
      <p className="text-sm text-brand-slate">Enter the email you ordered with. We will email you a link to choose a new password. It works for customers of our old website too.</p>
      <Field label="Email address">
        <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Notice kind={state.ok ? "ok" : "error"}>{state.msg}</Notice>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button type="submit" disabled={state.busy} className={buttonClass}>
          {state.busy ? "Sending…" : "Email me a link"}
        </button>
        <Link href="/my-account/" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </form>
  )
}

const noop = () => () => {}

/** The link from the email: choose a password, then go straight into My Account. */
export function ResetPassword() {
  const router = useRouter()
  const token = useSyncExternalStore(noop, () => new URLSearchParams(window.location.search).get("token") || "", () => null)
  const [form, setForm] = useState({ password: "", confirm: "" })
  const [state, setState] = useState({ busy: false, msg: "", portal: false })
  async function submit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) return setState({ busy: false, msg: "The two passwords are not the same.", portal: false })
    setState({ busy: true, msg: "", portal: false })
    const res = await accountApi("/reset-password", { method: "POST", body: { token, password: form.password, confirm_password: form.confirm } })
    if (res.ok && res.data?.token) {
      saveAccount(res.data.token, res.data.user)
      router.push("/my-account/")
      return
    }
    setState({ busy: false, msg: res.data?.message || "Please try again.", portal: res.data?.login_target === "portal" })
  }
  if (token === null) return <div className={`${card} h-72 animate-pulse`} />
  if (!token)
    return (
      <div className={card}>
        <Notice>This link is not complete. Open the link from your email again, or ask for a new one.</Notice>
        <Link href="/my-account/lost-password/" className={buttonClass}>
          Ask for a new link
        </Link>
      </div>
    )
  return (
    <form onSubmit={submit} className={card}>
      <Field label="New password" hint="At least 8 characters.">
        <input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
      </Field>
      <Field label="New password again">
        <input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
      </Field>
      <Notice>{state.msg}</Notice>
      {state.portal && (
        <a href={PORTAL_LOGIN} className={buttonClass}>
          Go to the client portal
        </a>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button type="submit" disabled={state.busy} className={buttonClass}>
          {state.busy ? "Saving…" : "Save password and sign in"}
        </button>
        <Link href="/my-account/lost-password/" className="text-sm font-semibold text-brand-blue hover:underline">
          Ask for a new link
        </Link>
      </div>
    </form>
  )
}
