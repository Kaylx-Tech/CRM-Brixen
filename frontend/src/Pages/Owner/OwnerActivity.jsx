import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ownerApi } from "@/lib/owner"
import { LoadError, PageTitle, Panel } from "./ownerUi"

function when(value) {
  const d = new Date(String(value || "").replace(" ", "T") + "Z")
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** Everything the Finstap team did in the owner portal, newest first. */
export default function OwnerActivity() {
  const [rows, setRows] = useState(null)
  const [admins, setAdmins] = useState([])
  const [error, setError] = useState("")

  useEffect(() => {
    ownerApi("/activity").then((res) => (res.ok ? setRows(res.data.activity) : setError(res.error)))
    ownerApi("/admins").then((res) => res.ok && setAdmins(res.data.admins))
  }, [])

  return (
    <>
      <PageTitle title="Activity" description="Sign-ins and changes made in the owner portal." />
      <LoadError error={error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Recent activity" className="lg:col-span-2">
          {rows === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length ? (
            <ul className="divide-y text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <span className="font-medium">{r.action.replaceAll("_", " ").toLowerCase()}</span>
                    {r.tenant_slug && (
                      <Link to={`/owner/workspaces/${r.tenant_slug}`} className="ml-2 text-primary hover:underline">
                        {r.tenant_slug}
                      </Link>
                    )}
                    {r.detail && <div className="break-words text-xs text-muted-foreground">{r.detail}</div>}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                    <div>{when(r.created_at)}</div>
                    <div>{r.admin_email}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          )}
        </Panel>
        <Panel title="Owner accounts" description="Added on the server with scripts/create_platform_owner.py">
          <ul className="divide-y text-sm">
            {admins.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="font-medium">{a.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {a.email}
                  {a.last_login_at ? ` · last sign-in ${when(a.last_login_at)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
