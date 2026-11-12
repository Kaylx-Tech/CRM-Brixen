import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { IconClipboardList, IconSearch } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { ownerApi } from "@/lib/owner"
import { formatGBP } from "@/lib/money"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { Button, Empty, FilterTabs, LoadError, PageTitle, Panel } from "./ownerUi"

const TONE = {
  Eligible: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "Not eligible": "bg-destructive/10 text-destructive",
  "Pending check": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}

function day(value) {
  const d = new Date(String(value || "").replace(" ", "T") + "Z")
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** Accounts the workspaces applied for through Partner Perks. Check each with the partner's dashboard:
 *  Eligible puts the workspace's reward into its balance; Not eligible needs a reason. */
export default function OwnerPerkApplications() {
  const [apps, setApps] = useState(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("Pending check")
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(null) // the row being decided: {id, amount, reason}

  const load = useCallback(() => {
    const qs = new URLSearchParams({ status, search })
    ownerApi(`/perk-applications?${qs}`).then((res) => (res.ok ? setApps(res.data.applications) : setError(res.error)))
  }, [status, search])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const decide = async (app, eligible) => {
    if (!eligible && !open?.reason?.trim()) {
      toastFail(undefined, "Say why it is not eligible")
      return
    }
    const id = toastProcessing("Saving…")
    const res = await ownerApi(`/perk-applications/${app.id}/${eligible ? "eligible" : "not-eligible"}`, {
      method: "POST",
      body: eligible ? { amount: open?.amount || "" } : { reason: open?.reason },
    })
    if (res.ok) {
      toastDone(id, res.message)
      setOpen(null)
      load()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <>
      <PageTitle
        title="Applied Accounts"
        description="Accounts the workspaces applied for through Partner Perks. Check each one in the partner's own dashboard: Eligible adds the workspace's reward to its balance."
      />
      <LoadError error={error} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          value={status}
          onChange={setStatus}
          options={[["Pending check", "Pending check"], ["Eligible", "Eligible"], ["Not eligible", "Not eligible"], ["", "All"]]}
        />
        <div className="relative w-full sm:w-72">
          <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search workspace, client or partner…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Panel>
        {apps === null && !error ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !apps?.length ? (
          <Empty icon={IconClipboardList} title={search.trim() ? "Nothing found" : "Nothing here"}>
            When a workspace presses Apply on a perk and adds the client, it shows up here.
          </Empty>
        ) : (
          <ul className="divide-y text-sm">
            {apps.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {a.client_name}
                      {a.company_name && <span className="font-normal text-muted-foreground"> · {a.company_name}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{a.partner}</span>
                      {" · "}
                      <Link to={`/owner/workspaces/${a.tenant_slug}`} className="text-primary hover:underline">{a.workspace_name || a.tenant_slug}</Link>
                      {` · ${day(a.created_at)}`}
                      {a.applied_by_name ? ` · by ${a.applied_by_name}` : ""}
                      {a.client_email ? ` · ${a.client_email}` : ""}
                    </div>
                    {a.status === "Not eligible" && a.reason && <div className="mt-0.5 text-xs text-destructive">{a.reason}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {a.status === "Eligible" && <span className="font-semibold text-emerald-700 dark:text-emerald-400">+{formatGBP(a.reward_amount)}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[a.status] || "bg-muted"}`}>{a.status}</span>
                    {a.status !== "Eligible" && open?.id !== a.id && (
                      <Button size="sm" variant="outline" onClick={() => setOpen({ id: a.id, amount: "", reason: "" })}>Check</Button>
                    )}
                  </div>
                </div>
                {open?.id === a.id && (
                  <div className="mt-3 grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor={`amt-${a.id}`}>Reward £ (empty: this workspace's reward)</label>
                      <Input id={`amt-${a.id}`} inputMode="decimal" placeholder="e.g. 50" value={open.amount} onChange={(e) => setOpen((o) => ({ ...o, amount: e.target.value }))} />
                      <Button size="sm" onClick={() => decide(a, true)}>Eligible: add to balance</Button>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor={`why-${a.id}`}>Reason, if not eligible</label>
                      <Input id={`why-${a.id}`} placeholder="Not in the partner's dashboard" value={open.reason} onChange={(e) => setOpen((o) => ({ ...o, reason: e.target.value }))} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => decide(a, false)}>Not eligible</Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
