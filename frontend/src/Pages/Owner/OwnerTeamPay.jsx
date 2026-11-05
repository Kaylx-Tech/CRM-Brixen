import { useCallback, useEffect, useState } from "react"
import { IconCash, IconCheck, IconClockHour4, IconUsers } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toastDone, toastFail } from "@/lib/toastActions"
import { ownerApi, shortDate } from "@/lib/owner"
import { Button, LoadError, Panel, Stat } from "./ownerUi"

// £3, or £2.50 when there are pence
const pounds = (v) => `£${Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** A member's rate per check: saved when the field is left (empty: no charge). */
function RateInput({ user, onSaved }) {
  const [value, setValue] = useState(user.rate ?? "")
  const save = async () => {
    if (String(value).trim() === String(user.rate ?? "")) return
    const res = await ownerApi(`/kyc-users/${user.id}/rate`, { method: "POST", body: { rate: String(value).trim() } })
    if (res.ok) {
      toastDone(undefined, res.message)
      onSaved()
    } else {
      toastFail(undefined, res.error)
      setValue(user.rate ?? "")
    }
  }
  return (
    <div className="relative w-20">
      <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        className="h-8 rounded-md pr-2 pl-5 text-right text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        value={value}
        placeholder="0"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={`Rate per check for ${user.full_name}`}
      />
    </div>
  )
}

/**
 * Billing › KYC team pay: what Finstap pays the people who check the KYC (each has a rate per check; every
 * check they approve or reject is owed once). Mark a person paid when the money has gone to them.
 */
export default function OwnerTeamPay() {
  const [users, setUsers] = useState(null)
  const [entries, setEntries] = useState([])
  const [error, setError] = useState("")

  const load = useCallback(() => {
    ownerApi("/kyc-users").then((res) => (res.ok ? setUsers(res.data.users || []) : setError(res.error)))
    ownerApi("/kyc-payouts").then((res) => res.ok && setEntries(res.data.entries || []))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const markPaid = async (user) => {
    if (!window.confirm(`Mark ${pounds(user.due)} as paid to ${user.full_name}?`)) return
    const res = await ownerApi(`/kyc-users/${user.id}/paid`, { method: "POST" })
    if (res.ok) {
      toastDone(undefined, res.message)
      load()
    } else {
      toastFail(undefined, res.error)
    }
  }

  if (error) return <LoadError error={error} />
  if (!users) return <p className="text-sm text-muted-foreground">Loading…</p>
  const due = users.reduce((s, u) => s + (u.due || 0), 0)
  const paid = users.reduce((s, u) => s + (u.paid || 0), 0)
  const checks = users.reduce((s, u) => s + (u.checks || 0), 0)

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        What you pay the people who check the KYC. Give each person a rate per check; every check they approve or
        reject is added once to what you owe them.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="You owe" value={pounds(due)} icon={IconClockHour4} tone="text-amber-600" />
        <Stat label="Paid so far" value={pounds(paid)} icon={IconCheck} tone="text-emerald-600" />
        <Stat label="Checks done" value={checks} icon={IconCash} />
        <Stat label="KYC team" value={users.length} icon={IconUsers} />
      </div>

      <Panel title="People" className="mt-6">
        {users.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rate per check</TableHead>
                  <TableHead className="text-right">Checks</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">You owe</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <RateInput key={`${u.id}-${u.rate ?? ""}`} user={u} onSaved={load} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.checks}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{pounds(u.paid)}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", u.due > 0 && "text-amber-700 dark:text-amber-300")}>
                      {pounds(u.due)}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.due > 0 && (
                        <Button size="sm" variant="outline" onClick={() => markPaid(u)}>
                          Mark paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No KYC team yet. Add people on the KYC page.</p>
        )}
      </Panel>

      <Panel title="Checks charged" description="Newest first. One line per check a team member approved or rejected." className="mt-6">
        {entries.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Checked by</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{shortDate(e.created_at)}</TableCell>
                    <TableCell>{e.workspace_name}</TableCell>
                    <TableCell className="font-medium">{e.person_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.reviewer_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{pounds(e.amount)}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", e.status === "paid" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-800 dark:text-amber-300")}>
                        {e.status === "paid" ? `Paid ${shortDate(e.paid_at)}` : "To pay"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing yet. Set a rate above; checks are added when the team approves or rejects them.</p>
        )}
      </Panel>
    </>
  )
}
