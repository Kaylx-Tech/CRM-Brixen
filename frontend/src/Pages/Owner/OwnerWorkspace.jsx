import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { IconArrowLeft, IconExternalLink, IconLoader2, IconMailCheck, IconTrash } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PlanUsage } from "@/components/plan-usage"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { Button, LoadError, Panel, PlanBadge, SELECT, StatusBadge } from "./ownerUi"

const LIMIT_LABELS = {
  users: "Team users",
  customers: "Customers",
  companies: "Companies",
  orders_month: "Orders a month",
  storage_gb: "Storage (GB)",
  ai_month: "AI questions a month",
}

function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {children}
    </label>
  )
}

/** The form the owner uses to set a workspace's plan, billing and any special limits. */
function SubscriptionForm({ workspace, onSaved }) {
  const [form, setForm] = useState(() => ({
    plan: workspace.plan || "trial",
    billing_cycle: workspace.billing_cycle || "",
    subscription_status: workspace.subscription_status || "",
    current_period_end: (workspace.current_period_end || "").slice(0, 10),
    price_override: workspace.price_override ?? "",
    owner_notes: workspace.owner_notes || "",
    custom_limits: Object.fromEntries(
      Object.keys(LIMIT_LABELS).map((k) => {
        const own = workspace.custom_limits || {}
        return [k, k in own ? (own[k] === null ? "unlimited" : String(own[k])) : ""]
      }),
    ),
  }))
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const id = toastProcessing("Saving subscription…")
    const res = await ownerApi(`/workspaces/${workspace.slug}/subscription`, { method: "POST", body: form })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message || "Subscription saved")
      onSaved()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="plan">Plan</Label>
          <select id="plan" className={SELECT} value={form.plan} onChange={(e) => set("plan", e.target.value)}>
            <option value="trial">Free trial</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div>
          <Label htmlFor="sub-status">Subscription</Label>
          <select
            id="sub-status"
            className={SELECT}
            value={form.subscription_status}
            onChange={(e) => set("subscription_status", e.target.value)}
          >
            <option value="">Not set</option>
            <option value="trialing">Trialing</option>
            <option value="active">Active (paying)</option>
            <option value="past_due">Past due</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <Label htmlFor="cycle">Billing</Label>
          <select id="cycle" className={SELECT} value={form.billing_cycle} onChange={(e) => set("billing_cycle", e.target.value)}>
            <option value="">Not set</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <Label htmlFor="period-end">Paid until</Label>
          <Input
            id="period-end"
            type="date"
            value={form.current_period_end}
            onChange={(e) => set("current_period_end", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="price">Special monthly price (£, optional)</Label>
          <Input
            id="price"
            inputMode="decimal"
            placeholder="Leave empty to use the plan's price"
            value={form.price_override}
            onChange={(e) => set("price_override", e.target.value)}
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">Own limits for this workspace</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Empty uses the plan's limit. Type a number, or "unlimited".
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(LIMIT_LABELS).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`limit-${key}`} className="mb-1 block text-xs text-muted-foreground">
                {label}
              </label>
              <Input
                id={`limit-${key}`}
                placeholder={
                  workspace.limits?.[key] === null || workspace.limits?.[key] === undefined
                    ? "Unlimited"
                    : String(workspace.limits[key])
                }
                value={form.custom_limits[key]}
                onChange={(e) => set("custom_limits", { ...form.custom_limits, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes (only the Finstap team sees these)</Label>
        <Textarea id="notes" rows={3} value={form.owner_notes} onChange={(e) => set("owner_notes", e.target.value)} />
      </div>

      <Button type="submit" disabled={busy}>
        {busy && <IconLoader2 className="size-4 animate-spin" />}
        Save subscription
      </Button>
    </form>
  )
}

/** The 6-digit code the owner gets by email before a suspend or delete goes through. */
function CodeStep({ pending, busy, onConfirm, onCancel, label, destructive = true }) {
  const [code, setCode] = useState("")
  if (!pending) return null
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-2 text-sm">
        <IconMailCheck className="size-4 text-primary" /> Enter the 6-digit code we emailed you.
      </p>
      <div className="flex gap-2">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="w-36 tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-label="Confirmation code"
          autoFocus
        />
        <Button variant={destructive ? "destructive" : "default"} disabled={busy || code.length !== 6} onClick={() => onConfirm(code)}>
          {label}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

/** Longer trial, suspend or reactivate, delete. Suspend and delete need a code emailed to the owner. */
function Actions({ workspace, onSaved }) {
  const navigate = useNavigate()
  const [days, setDays] = useState("7")
  const [reason, setReason] = useState("")
  const [deleteReason, setDeleteReason] = useState("")
  const [busy, setBusy] = useState("")
  const [pending, setPending] = useState(null) // {action, challenge}

  const askCode = async (what) => {
    setBusy(what)
    const id = toastProcessing("Sending code…")
    const res = await ownerApi(`/workspaces/${workspace.slug}/code`, { method: "POST", body: { action: what } })
    setBusy("")
    if (res.ok) {
      toastDone(id, res.message)
      setPending({ action: what, challenge: res.data.challenge })
    } else {
      toastFail(id, res.error)
    }
  }

  const removeWorkspace = async (code) => {
    setBusy("delete")
    const id = toastProcessing("Deleting workspace…")
    const res = await ownerApi(`/workspaces/${workspace.slug}/delete`, {
      method: "POST",
      body: { reason: deleteReason, challenge: pending.challenge, code },
    })
    setBusy("")
    if (res.ok) {
      toastDone(id, res.message)
      navigate("/owner/workspaces")
    } else {
      toastFail(id, res.error)
    }
  }

  const run = async (key, path, body, working) => {
    setBusy(key)
    const id = toastProcessing(working)
    const res = await ownerApi(`/workspaces/${workspace.slug}${path}`, { method: "POST", body })
    setBusy("")
    if (res.ok) {
      toastDone(id, res.message)
      setReason("")
      setPending(null)
      onSaved()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <div className="space-y-5">
      {workspace.plan === "trial" && (
        <div>
          <p className="text-sm font-medium">Free trial</p>
          <p className="mb-2 text-xs text-muted-foreground">
            {workspace.trial_ends_at ? `Ends ${shortDate(workspace.trial_ends_at)}.` : "No end date."}
          </p>
          <div className="flex gap-2">
            <select className={SELECT} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days">
              {["7", "14", "30"].map((d) => (
                <option key={d} value={d}>
                  +{d} days
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => run("trial", "/trial", { days: Number(days) }, "Extending trial…")}
            >
              Extend
            </Button>
          </div>
        </div>
      )}

      {workspace.status === "Suspended" ? (
        <div>
          <p className="text-sm font-medium">Suspended</p>
          <p className="mb-2 text-xs text-muted-foreground">
            {workspace.suspended_reason || "Nobody in this workspace can sign in."}
          </p>
          <Button
            disabled={Boolean(busy)}
            onClick={() => run("status", "/status", { status: "Active" }, "Reactivating…")}
          >
            Reactivate workspace
          </Button>
        </div>
      ) : workspace.status === "Active" ? (
        <div>
          <p className="text-sm font-medium">Suspend</p>
          <p className="mb-2 text-xs text-muted-foreground">
            The team and its clients cannot sign in until you reactivate it. Nothing is deleted.
          </p>
          <Input placeholder="Why (for example: unpaid since 1 Oct)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {pending?.action === "suspend" ? (
            <CodeStep
              pending={pending}
              busy={Boolean(busy)}
              label="Suspend"
              onCancel={() => setPending(null)}
              onConfirm={(code) => run("status", "/status", { status: "Suspended", reason, challenge: pending.challenge, code }, "Suspending…")}
            />
          ) : (
            <Button variant="destructive" className="mt-2" disabled={Boolean(busy) || !reason.trim()} onClick={() => askCode("suspend")}>
              Suspend workspace
            </Button>
          )}
        </div>
      ) : null}

      {/* Delete: hidden, nobody signs in; the data is kept (Finstap can bring it back) */}
      <div className="border-t pt-4">
        <p className="text-sm font-medium text-destructive">Delete workspace</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Removes it from Finstap: nobody can sign in and it leaves every list. Its data is archived, not erased.
        </p>
        <Input placeholder="Why it is deleted" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
        {pending?.action === "delete" ? (
          <CodeStep pending={pending} busy={Boolean(busy)} label="Delete" onCancel={() => setPending(null)} onConfirm={removeWorkspace} />
        ) : (
          <Button variant="destructive" className="mt-2" disabled={Boolean(busy) || !deleteReason.trim()} onClick={() => askCode("delete")}>
            <IconTrash className="size-4" /> Delete workspace
          </Button>
        )}
      </div>
    </div>
  )
}

export default function OwnerWorkspace() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [version, setVersion] = useState(0)

  const load = useCallback(() => {
    ownerApi(`/workspaces/${slug}`).then((res) => {
      if (res.ok) {
        setData(res.data)
        setVersion((v) => v + 1)
      } else {
        setError(res.error)
      }
    })
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <LoadError error={error} />
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <>
      <Button variant="ghost" size="lg" className="-ml-2 mb-4 text-muted-foreground" nativeButton={false} render={<Link to="/owner/workspaces" />}>
        <IconArrowLeft className="size-4" /> Workspaces
      </Button>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-bold tracking-tight">{data.name}</h1>
            <PlanBadge plan={data.plan} />
            <StatusBadge workspace={data} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.owner_name} · {data.owner_email} · created {shortDate(data.created_at)}
          </p>
        </div>
        {data.url && (
          <Button variant="outline" size="lg" nativeButton={false} render={<a href={data.url} target="_blank" rel="noreferrer" />}>
            {data.url.replace(/^https?:\/\//, "")} <IconExternalLink className="size-4" />
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel
            title="Usage"
            description={`${data.plan_name} plan${data.monthly_value ? ` · pays ${money(data.monthly_value)} a month` : ""}`}
          >
            <PlanUsage usage={data.usage} limits={data.limits} />
          </Panel>
          <Panel title="Subscription" description="Set by hand until online payment is switched on.">
            <SubscriptionForm key={version} workspace={data} onSaved={load} />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Actions">
            <Actions workspace={data} onSaved={load} />
          </Panel>
          <Panel title="Team" description={`${data.team.length} member(s)`}>
            <ul className="divide-y text-sm">
              {data.team.map((m) => (
                <li key={m.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{m.full_name || m.email}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{m.role.replace("_", " ").toLowerCase()}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.email}
                    {m.last_active_at ? ` · active ${shortDate(m.last_active_at)}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="History">
            {data.history.length ? (
              <ul className="space-y-3 text-sm">
                {data.history.map((h) => (
                  <li key={h.id}>
                    <div className="font-medium">{h.action.replaceAll("_", " ").toLowerCase()}</div>
                    {h.detail && <div className="break-words text-xs text-muted-foreground">{h.detail}</div>}
                    <div className="text-xs text-muted-foreground">
                      {shortDate(h.created_at)} · {h.admin_email}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No changes yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
