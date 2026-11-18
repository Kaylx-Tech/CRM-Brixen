"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { accountApi, forgetAccount, openFile, PORTAL_LOGIN, saveAccount, updateUser, useAccount } from "@/lib/account"
import { SITE } from "@/lib/site"
import NameInput from "../order/NameInput"
import { buttonClass, date, Empty, Field, ghostClass, inputClass, Loading, money, Notice, Status } from "./AccountParts"

/**
 * My Account (as the WordPress client panel): sign in, then Dashboard, Orders, Invoices, Messages & Files and
 * Account Details. Retail customers only; B2B and Business customers are sent to the CRM client portal.
 */
export const TABS = [
  ["dashboard", "Dashboard"],
  ["orders", "My Orders"],
  ["invoices", "Invoices & Payments"],
  ["files", "Messages & Files"],
  ["account", "Account Details"],
]

const subscribeUrl = (cb) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}
const tabFromUrl = () => {
  const t = new URLSearchParams(window.location.search).get("tab") || "dashboard"
  return TABS.some(([k]) => k === t) ? t : "dashboard"
}

export function goToTab(tab) {
  const url = tab === "dashboard" ? "/my-account/" : `/my-account/?tab=${tab}`
  window.history.pushState({}, "", url)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo({ top: 0, behavior: "smooth" })
}

/** Data from the CRM for one tab: {data, error, loading, reload}. */
function useLoad(path) {
  const [state, setState] = useState({ path: null, data: null, error: "" })
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    accountApi(path).then((res) => {
      if (live) setState({ path, data: res.ok ? res.data?.data || res.data : null, error: res.ok ? "" : res.data?.message || "This could not be loaded." })
    })
    return () => {
      live = false
    }
  }, [path, round])
  const reload = useCallback(() => setRound((r) => r + 1), [])
  return { ...state, loading: state.path !== path, reload }
}

export default function MyAccount() {
  const account = useAccount()
  const tab = useSyncExternalStore(subscribeUrl, tabFromUrl, () => "dashboard")
  if (account === undefined) return <div className="h-96 animate-pulse rounded-3xl bg-white ring-1 ring-slate-100" />
  if (!account) return <SignIn />
  return <Panel account={account} tab={tab} />
}

/* ── Sign in ─────────────────────────────────────────────────────────────── */

function SignIn() {
  const [form, setForm] = useState({ email: "", password: "" })
  const [state, setState] = useState({ busy: false, error: "", portal: false })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setState({ busy: true, error: "", portal: false })
    const res = await accountApi("/login", { method: "POST", body: form })
    if (res.ok && res.data?.token) {
      saveAccount(res.data.token, res.data.user)
      return
    }
    setState({ busy: false, error: res.data?.message || "Sign in failed. Please try again.", portal: res.data?.login_target === "portal" })
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_380px]">
      <form onSubmit={submit} className="space-y-5 rounded-3xl bg-white p-7 shadow-[0_30px_60px_-40px_rgba(0,57,113,0.5)] ring-1 ring-slate-100 sm:p-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">My Account</p>
          <h2 className="mt-2 text-3xl font-bold text-black">
            Sign <span className="text-brand-blue">in</span>
          </h2>
          <p className="mt-2 text-sm text-brand-slate">Use the email you ordered with. Customers of our old website can use their old password.</p>
        </div>
        <Field label="Email address">
          <input className={inputClass} type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" autoComplete="current-password" required value={form.password} onChange={set("password")} />
        </Field>
        <Notice>{state.error}</Notice>
        {state.portal && (
          <a href={PORTAL_LOGIN} className={buttonClass}>
            Go to the client portal
          </a>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button type="submit" disabled={state.busy} className={buttonClass}>
            {state.busy ? "Signing in…" : "Sign in"}
          </button>
          <Link href="/my-account/lost-password/" className="text-sm font-semibold text-brand-blue hover:underline">
            Forgot your password?
          </Link>
        </div>
      </form>
      <aside className="space-y-4 self-start rounded-3xl bg-brand-navy p-7 text-white">
        <h3 className="text-xl font-bold">No password yet?</h3>
        <p className="text-sm text-white/80">
          After your first order we email you a link to choose one. Didn&apos;t get it, or ordered on our old website? Use{" "}
          <Link href="/my-account/lost-password/" className="font-semibold underline">
            Forgot your password
          </Link>{" "}
          with your order email.
        </p>
        <h3 className="pt-2 text-xl font-bold">Business or B2B client?</h3>
        <p className="text-sm text-white/80">Sign in to the Brixen client portal instead.</p>
        <a href={PORTAL_LOGIN} className="inline-flex rounded-md bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/30 hover:bg-white/20">
          Client portal →
        </a>
      </aside>
    </div>
  )
}

/* ── Signed in ──────────────────────────────────────────────────────────── */

function Panel({ account, tab }) {
  async function logOut() {
    await accountApi("/logout", { method: "POST" })
    forgetAccount()
    window.history.pushState({}, "", "/my-account/")
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  const first = String(account.user?.full_name || "").split(" ")[0] || "there"
  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr] lg:items-start">
      <nav aria-label="My Account" className="rounded-3xl bg-white p-3 ring-1 ring-slate-100 lg:sticky lg:top-28">
        <p className="px-3 pb-2 pt-3 text-sm text-brand-slate">
          Hello, <strong className="text-brand-navy">{first}</strong>
        </p>
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
          {TABS.map(([key, label]) => (
            <li key={key}>
              <button type="button" onClick={() => goToTab(key)} aria-current={tab === key ? "page" : undefined} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${tab === key ? "bg-linear-to-br from-brand-navy from-20% to-brand-blue text-white" : "text-slate-700 hover:bg-brand-mist hover:text-brand-blue"}`}>
                {label}
              </button>
            </li>
          ))}
          <li>
            <Link href="/cart/" className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-brand-mist hover:text-brand-blue">
              My Cart
            </Link>
          </li>
          <li>
            <button type="button" onClick={logOut} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50">
              Log out
            </button>
          </li>
        </ul>
      </nav>
      <section className="min-w-0 rounded-3xl bg-white p-6 ring-1 ring-slate-100 sm:p-9">
        {tab === "dashboard" && <Dashboard />}
        {tab === "orders" && <Orders />}
        {tab === "invoices" && <Invoices />}
        {tab === "files" && <MessagesFiles />}
        {tab === "account" && <AccountDetails account={account} />}
      </section>
    </div>
  )
}

function Heading({ title, text }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-brand-navy">{title}</h2>
      {text && <p className="mt-1 text-sm text-brand-slate">{text}</p>}
    </div>
  )
}

function Dashboard() {
  const { data, error, loading } = useLoad("/dashboard")
  if (loading) return <Loading />
  if (error) return <Notice>{error}</Notice>
  const cards = [
    ["Active orders", data.active_orders_count, "orders"],
    ["Files from us", data.documents_count, "files"],
    ["Things to do", data.pending_actions_count, null],
  ]
  return (
    <>
      <Heading title={`${data.greeting}, ${String(data.user_name || "").split(" ")[0]}`} text={data.current_date} />
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(([label, value, to]) => (
          <button key={label} type="button" disabled={!to} onClick={() => to && goToTab(to)} className="rounded-2xl bg-brand-mist p-5 text-left transition enabled:hover:ring-2 enabled:hover:ring-brand-blue/30">
            <p className="text-sm font-semibold text-brand-slate">{label}</p>
            <p className="mt-1 text-3xl font-extrabold text-brand-navy">{value || 0}</p>
          </button>
        ))}
      </div>
      {data.pending_actions?.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-brand-navy">Things to do</h3>
          <ul className="mt-3 space-y-2">
            {data.pending_actions.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                <span className="text-sm">
                  <strong className="text-amber-900">{a.title}</strong>
                  {a.detail && <span className="text-amber-800"> · {a.detail}</span>}
                </span>
                <button type="button" onClick={() => goToTab(a.view === "documents" ? "files" : a.view)} className={ghostClass}>
                  {a.action_label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-8">
        <h3 className="text-lg font-bold text-brand-navy">Orders in progress</h3>
        {data.active_orders?.length ? (
          <ul className="mt-3 space-y-2">
            {data.active_orders.map((o) => (
              <li key={o.id} className="rounded-xl px-4 py-3 ring-1 ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    {o.service_name} <span className="font-normal text-brand-slate">{o.order_number}</span>
                  </span>
                  <Status value={o.status} />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.max(5, Math.min(100, o.progress_percent || 0))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-brand-slate">
            Nothing in progress right now.{" "}
            <Link href="/services/" className="font-semibold text-brand-blue hover:underline">
              Browse our services
            </Link>
          </p>
        )}
      </div>
    </>
  )
}

function Orders() {
  const { data, error, loading } = useLoad("/orders?limit=100")
  if (loading) return <Loading />
  if (error) return <Notice>{error}</Notice>
  const orders = (data.orders || []).filter((o) => !o.is_draft)
  return (
    <>
      <Heading title="My Orders" text="Every order you placed with us and where it is now." />
      {orders.length === 0 ? (
        <Empty title="No orders yet">
          <Link href="/packages/" className="font-semibold text-brand-blue hover:underline">
            View packages
          </Link>{" "}
          or{" "}
          <Link href="/services/" className="font-semibold text-brand-blue hover:underline">
            our services
          </Link>
          .
        </Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-100">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{o.service_name}</p>
                <p className="text-sm text-brand-slate">
                  {o.order_number} · {date(o.created_at)}
                  {o.company_name ? ` · ${o.company_name}` : ""}
                </p>
              </div>
              <p className="font-bold text-brand-navy">{money(o.total)}</p>
              <Status value={o.status} />
              {o.status === "Documents Required" && (
                <button type="button" onClick={() => goToTab("files")} className={ghostClass}>
                  Upload documents
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Invoices() {
  const { data, error, loading } = useLoad("/invoices")
  const [problem, setProblem] = useState("")
  if (loading) return <Loading />
  if (error) return <Notice>{error}</Notice>
  const invoices = data.invoices || []
  const get = (i) => openFile(`/invoices/${i.id}/document?download=1`, `${i.invoice_number || "invoice"}.pdf`, true).catch((e) => setProblem(e.message))
  return (
    <>
      <Heading title="Invoices & Payments" text="Download any invoice or receipt as a PDF." />
      <Notice>{problem}</Notice>
      {invoices.length === 0 ? (
        <Empty title="No invoices yet">Your invoices appear here after your first order.</Empty>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-100">
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{i.invoice_number}</p>
                <p className="text-sm text-brand-slate">
                  {i.service_name || i.order_number} · {date(i.issue_date || i.created_at)}
                </p>
              </div>
              <p className="font-bold text-brand-navy">{money(i.total)}</p>
              <Status value={i.display_status || i.status} />
              <button type="button" onClick={() => get(i)} className={ghostClass}>
                Download PDF
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ── Messages & Files ───────────────────────────────────────────────────── */

const MAX_BYTES = 15 * 1024 * 1024

function MessagesFiles() {
  return (
    <>
      <Heading title="Messages & Files" text="Files from our team, your uploads, and your messages with us." />
      <Files />
      <div className="mt-10 border-t border-slate-100 pt-8">
        <Messages />
      </div>
    </>
  )
}

function Files() {
  const docs = useLoad("/documents")
  const orders = useLoad("/orders?limit=100")
  const [upload, setUpload] = useState({ file: null, order_id: "", busy: false, msg: "", ok: false })
  const [problem, setProblem] = useState("")

  async function send(e) {
    e.preventDefault()
    const file = upload.file
    if (!file) return setUpload((u) => ({ ...u, msg: "Choose a file first.", ok: false }))
    if (file.size > MAX_BYTES) return setUpload((u) => ({ ...u, msg: "The file must be 15 MB or smaller.", ok: false }))
    setUpload((u) => ({ ...u, busy: true, msg: "" }))
    const content = await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result || ""))
      r.onerror = () => resolve("")
      r.readAsDataURL(file)
    })
    const res = await accountApi("/documents/upload", {
      method: "POST",
      body: { file_name: file.name, name: file.name, file_content_base64: content, category: "Customer Upload", ...(upload.order_id ? { order_id: Number(upload.order_id) } : {}) },
    })
    setUpload({ file: null, order_id: "", busy: false, ok: res.ok, msg: res.ok ? "Thank you, your file is sent. Our team will check it." : res.data?.message || "The file could not be sent." })
    if (res.ok) {
      e.target.reset()
      docs.reload()
    }
  }

  const list = docs.data?.documents || []
  const review = docs.data?.my_uploads_in_review || []
  const myOrders = (orders.data?.orders || []).filter((o) => !o.is_draft)
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
      <div>
        <h3 className="text-lg font-bold text-brand-navy">Files</h3>
        <Notice>{problem}</Notice>
        {docs.loading ? (
          <Loading />
        ) : list.length + review.length === 0 ? (
          <p className="mt-2 text-sm text-brand-slate">No files yet. Certificates and documents from our team appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-100">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-800">{d.name}</p>
                  <p className="text-xs text-brand-slate">
                    {[d.order_number, d.company_name, date(d.created_at)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button type="button" onClick={() => openFile(`/documents/${d.id}/download`, d.name, true).catch((err) => setProblem(err.message))} className={ghostClass}>
                  Download
                </button>
              </li>
            ))}
            {review.map((d) => (
              <li key={`r${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-800">{d.name}</p>
                  <p className="text-xs text-brand-slate">Your upload · {date(d.created_at)}</p>
                </div>
                <Status value="Being checked" />
              </li>
            ))}
          </ul>
        )}
      </div>
      <form onSubmit={send} className="space-y-4 self-start rounded-2xl bg-brand-mist p-5">
        <h3 className="text-lg font-bold text-brand-navy">Send us a file</h3>
        <Field label="File (PDF, JPG, PNG or Word, up to 15 MB)">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => setUpload((u) => ({ ...u, file: e.target.files?.[0] || null, msg: "" }))} className="block w-full rounded-md border border-dashed border-slate-300 bg-white p-2.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-navy file:px-3 file:py-1.5 file:font-semibold file:text-white" />
        </Field>
        {myOrders.length > 0 && (
          <Field label="For which order? (optional)">
            <select className={inputClass} value={upload.order_id} onChange={(e) => setUpload((u) => ({ ...u, order_id: e.target.value }))}>
              <option value="">Not for a specific order</option>
              {myOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} · {o.service_name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Notice kind={upload.ok ? "ok" : "error"}>{upload.msg}</Notice>
        <button type="submit" disabled={upload.busy} className={buttonClass}>
          {upload.busy ? "Sending…" : "Send file"}
        </button>
      </form>
    </div>
  )
}

function Messages() {
  const tickets = useLoad("/tickets")
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState({ subject: "", message: "", busy: false, msg: "", ok: false })

  async function create(e) {
    e.preventDefault()
    if (!form.subject.trim() || !form.message.trim()) return setForm((f) => ({ ...f, msg: "Write a subject and your message.", ok: false }))
    setForm((f) => ({ ...f, busy: true, msg: "" }))
    const res = await accountApi("/tickets", { method: "POST", body: { subject: form.subject, description: form.message, category: "Website Message" } })
    setForm(res.ok ? { subject: "", message: "", busy: false, ok: true, msg: "Message sent. We will reply here and by email." } : { ...form, busy: false, ok: false, msg: res.data?.message || "Your message could not be sent." })
    if (res.ok) tickets.reload()
  }

  const list = tickets.data?.tickets || []
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
      <div>
        <h3 className="text-lg font-bold text-brand-navy">Messages</h3>
        {tickets.loading ? (
          <Loading />
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-brand-slate">No messages yet. Write to us with the form.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {list.map((t) => (
              <li key={t.id} className="rounded-2xl ring-1 ring-slate-100">
                <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-800">{t.subject}</span>
                    <span className="text-xs text-brand-slate">
                      {t.ticket_number} · {date(t.created_at)}
                    </span>
                  </span>
                  <Status value={t.status} />
                </button>
                {open === t.id && <Thread id={t.id} onSent={tickets.reload} />}
              </li>
            ))}
          </ul>
        )}
      </div>
      <form onSubmit={create} className="space-y-4 self-start rounded-2xl bg-brand-mist p-5">
        <h3 className="text-lg font-bold text-brand-navy">New message</h3>
        <Field label="Subject">
          <input className={inputClass} maxLength={200} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
        </Field>
        <Field label="Message">
          <textarea className={inputClass} rows={4} maxLength={5000} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
        </Field>
        <Notice kind={form.ok ? "ok" : "error"}>{form.msg}</Notice>
        <button type="submit" disabled={form.busy} className={buttonClass}>
          {form.busy ? "Sending…" : "Send message"}
        </button>
      </form>
    </div>
  )
}

function Thread({ id, onSent }) {
  const { data, loading, error, reload } = useLoad(`/tickets/${id}/messages`)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  async function reply(e) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    const res = await accountApi(`/tickets/${id}/messages`, { method: "POST", body: { message: text } })
    setBusy(false)
    if (res.ok) {
      setText("")
      setMsg("")
      reload()
      onSent()
    } else setMsg(res.data?.message || "Your reply could not be sent.")
  }
  if (loading) return <div className="px-4 pb-4"><Loading /></div>
  if (error) return <div className="px-4 pb-4"><Notice>{error}</Notice></div>
  const closed = ["Closed", "Resolved"].includes(data.ticket?.status)
  return (
    <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
      {(data.messages || []).map((m) => {
        const mine = m.sender_role === "CLIENT"
        return (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "ml-auto bg-brand-blue text-white" : "bg-slate-100 text-slate-800"}`}>
            <p className="whitespace-pre-wrap break-words">{m.message}</p>
            <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-brand-slate"}`}>
              {mine ? "You" : m.sender_name || "Brixen"} · {date(m.created_at)}
            </p>
          </div>
        )
      })}
      {!closed && (
        <form onSubmit={reply} className="flex gap-2">
          <input className={inputClass} placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? "…" : "Reply"}
          </button>
        </form>
      )}
      <Notice>{msg}</Notice>
    </div>
  )
}

/* ── Account details ────────────────────────────────────────────────────── */

function AccountDetails({ account }) {
  const [me, setMe] = useState({ full_name: account.user?.full_name || "", phone: account.user?.phone || "", busy: false, msg: "", ok: false })
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "", busy: false, msg: "", ok: false })

  async function saveMe(e) {
    e.preventDefault()
    setMe((m) => ({ ...m, busy: true, msg: "" }))
    const res = await accountApi("/me", { method: "PATCH", body: { full_name: me.full_name, phone: me.phone } })
    if (res.ok) updateUser(res.data.user)
    setMe((m) => ({ ...m, busy: false, ok: res.ok, msg: res.data?.message || (res.ok ? "Saved." : "Could not save.") }))
  }
  async function savePw(e) {
    e.preventDefault()
    if (pw.new_password !== pw.confirm) return setPw((p) => ({ ...p, ok: false, msg: "The two new passwords are not the same." }))
    setPw((p) => ({ ...p, busy: true, msg: "" }))
    const res = await accountApi("/password", { method: "POST", body: { current_password: pw.current_password, new_password: pw.new_password } })
    setPw(res.ok ? { current_password: "", new_password: "", confirm: "", busy: false, ok: true, msg: res.data?.message || "Password changed." } : { ...pw, busy: false, ok: false, msg: res.data?.message || "Could not change the password." })
  }

  return (
    <>
      <Heading title="Account Details" text="Your name, phone number and password." />
      <div className="grid gap-8 xl:grid-cols-2">
        <form onSubmit={saveMe} className="space-y-4">
          <Field label="Email address" hint={`To change your email, write to ${SITE.email}.`}>
            <input className={`${inputClass} bg-slate-50 text-slate-500`} value={account.user?.email || ""} readOnly />
          </Field>
          <Field label="Name">
            <NameInput className={inputClass} required value={me.full_name} onChange={(name) => setMe((m) => ({ ...m, full_name: name }))} />
          </Field>
          <Field label="Phone number">
            <input className={inputClass} type="tel" maxLength={40} placeholder="+44 7700 900123" value={me.phone} onChange={(e) => setMe((m) => ({ ...m, phone: e.target.value }))} />
          </Field>
          <Notice kind={me.ok ? "ok" : "error"}>{me.msg}</Notice>
          <button type="submit" disabled={me.busy} className={buttonClass}>
            {me.busy ? "Saving…" : "Save details"}
          </button>
        </form>
        <form onSubmit={savePw} className="space-y-4 rounded-2xl bg-brand-mist p-5">
          <h3 className="text-lg font-bold text-brand-navy">Change password</h3>
          <Field label="Current password">
            <input className={inputClass} type="password" autoComplete="current-password" required value={pw.current_password} onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))} />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={pw.new_password} onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))} />
          </Field>
          <Field label="New password again">
            <input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
          </Field>
          <Notice kind={pw.ok ? "ok" : "error"}>{pw.msg}</Notice>
          <button type="submit" disabled={pw.busy} className={buttonClass}>
            {pw.busy ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </>
  )
}
