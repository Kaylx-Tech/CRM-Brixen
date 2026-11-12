import { useEffect, useMemo, useState } from "react"
import { Table } from "@/components/ui/table"
import { Link, useNavigate } from "react-router-dom"
import { IconSearch } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { Button, LoadError, PageTitle, Panel, PlanBadge, SELECT, StatusBadge } from "./ownerUi"

const PLAN_FILTERS = [
  ["", "All plans"],
  ["trial", "Free trial"],
  ["starter", "Starter"],
  ["pro", "Pro"],
  ["business", "Business"],
  ["enterprise", "Enterprise"],
]

function usedOf(usage, limits, key) {
  const used = usage?.[key] ?? 0
  const limit = limits?.[key]
  return limit === null || limit === undefined ? `${used}` : `${used} / ${limit}`
}

export default function OwnerWorkspaces() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [plan, setPlan] = useState("")
  const [status, setStatus] = useState("")

  useEffect(() => {
    ownerApi("/workspaces").then((res) => (res.ok ? setRows(res.data.workspaces) : setError(res.error)))
  }, [])

  // Filtering happens here, so typing stays instant
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows || []).filter(
      (w) =>
        (!plan || w.plan === plan) &&
        (!status || w.status === status) &&
        (!q || [w.name, w.slug, w.owner_name, w.owner_email, w.owner_phone].join(" ").toLowerCase().includes(q)),
    )
  }, [rows, search, plan, status])

  return (
    <>
      <PageTitle title="Workspaces" description="Every company using Finstap, its plan and what it uses." />
      <LoadError error={error} />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by company, address, owner or number"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={SELECT} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
          {PLAN_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Failed">Failed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs">
        <Table className="w-full md:min-w-[900px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Workspace</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Users</th>
              <th className="px-4 py-3 font-semibold">Customers</th>
              <th className="px-4 py-3 font-semibold">Companies</th>
              <th className="px-4 py-3 text-right font-semibold">Pays / month</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && !shown.length && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No workspaces match.
                </td>
              </tr>
            )}
            {shown.map((w) => (
              <tr
                key={w.slug}
                onClick={() => navigate(`/owner/workspaces/${w.slug}`)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/owner/workspaces/${w.slug}`}
                    className="font-medium hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {w.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{w.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[200px] truncate">{w.owner_name}</div>
                  <div className="max-w-[200px] truncate text-xs text-muted-foreground">{w.owner_email}</div>
                  <div className="max-w-[200px] truncate text-xs tabular-nums text-muted-foreground">
                    {w.owner_phone || <span className="italic">No number yet</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <PlanBadge plan={w.plan} />
                  {w.plan === "trial" && w.trial_ends_at && (
                    <div className="mt-1 text-xs text-muted-foreground">ends {shortDate(w.trial_ends_at)}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge workspace={w} />
                </td>
                <td className="px-4 py-3 tabular-nums">{usedOf(w.usage, w.limits, "users")}</td>
                <td className="px-4 py-3 tabular-nums">{usedOf(w.usage, w.limits, "customers")}</td>
                <td className="px-4 py-3 tabular-nums">{usedOf(w.usage, w.limits, "companies")}</td>
                <td className="px-4 py-3 text-right tabular-nums">{w.monthly_value ? money(w.monthly_value) : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{shortDate(w.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <HiddenWorkspaces />
    </>
  )
}

/** Deleted workspaces (their data is kept) and suspended adopted ones: turn one back on. */
function HiddenWorkspaces() {
  const [rows, setRows] = useState([])
  const [pending, setPending] = useState(null) // {slug, challenge}
  const [code, setCode] = useState("")
  const load = () => ownerApi("/workspaces/hidden").then((res) => res.ok && setRows(res.data.workspaces || []))
  useEffect(() => {
    load()
  }, [])
  if (!rows.length) return null

  const restore = async (w) => {
    const id = toastProcessing("Turning on…")
    const res = await ownerApi(`/workspaces/${w.slug}/restore`, { method: "POST" })
    if (res.ok) {
      toastDone(id, res.message)
      load()
    } else {
      toastFail(id, res.error)
    }
  }

  // Delete for good: a code is emailed to the owner first
  const askCode = async (w) => {
    const id = toastProcessing("Sending code…")
    const res = await ownerApi(`/workspaces/${w.slug}/purge-code`, { method: "POST" })
    if (res.ok) {
      toastDone(id, res.message)
      setCode("")
      setPending({ slug: w.slug, challenge: res.data.challenge })
    } else {
      toastFail(id, res.error)
    }
  }
  const purge = async () => {
    const id = toastProcessing("Deleting for good…")
    const res = await ownerApi(`/workspaces/${pending.slug}/purge`, {
      method: "POST",
      body: { challenge: pending.challenge, code },
    })
    if (res.ok) {
      toastDone(id, res.message)
      setPending(null)
      load()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <Panel
      title="Deleted and hidden workspaces"
      description="Not shown in the list above. Their data is kept; turn one back on to use it again (e.g. Brixen's KYC)."
      className="mt-6"
    >
      <ul className="divide-y text-sm">
        {rows.map((w) => (
          <li key={w.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="font-medium">
                {w.name} <span className="text-muted-foreground">({w.slug})</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {w.deleted_at ? `Deleted ${shortDate(w.deleted_at)}` : "Suspended"}
                {w.suspended_reason ? ` · ${w.suspended_reason}` : ""}
                {w.kyc_form_base_url ? " · KYC for another website" : ""}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => restore(w)}>Turn back on</Button>
              {w.deleted_at && (
                <Button variant="outline" className="text-destructive" onClick={() => askCode(w)}>
                  Delete forever
                </Button>
              )}
            </div>
            {pending?.slug === w.slug && (
              <div className="w-full space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm">
                  Enter the 6-digit code we emailed you. <b>{w.name}</b>'s database and files are deleted for good; this
                  cannot be undone.
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
                  <Button variant="destructive" disabled={code.length !== 6} onClick={purge}>
                    Delete forever
                  </Button>
                  <Button variant="ghost" onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
