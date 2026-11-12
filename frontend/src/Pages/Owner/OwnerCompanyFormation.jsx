import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { IconBuildingPlus, IconSearch } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { ownerApi } from "@/lib/owner"
import { Empty, FilterTabs, LoadError, PageTitle, Panel } from "./ownerUi"

function day(value) {
  const d = new Date(String(value || "").replace(" ", "T") + "Z")
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

const TONE = {
  Registered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}

/** Smart Operations › Company Formation in every workspace: formation orders and the companies being formed (read only). */
export default function OwnerCompanyFormation() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("Pending")
  const [search, setSearch] = useState("")

  useEffect(() => {
    ownerApi("/smart-operations/company-formation").then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.orders || []).filter((o) => {
      if (filter === "Pending" && o.formation_status === "Registered") return false
      if (filter === "Registered" && o.formation_status !== "Registered") return false
      if (!q) return true
      return [o.workspace_name, o.workspace, o.order_number, o.applicant_name, o.proposed_name, o.products,
        ...(o.companies || []).flatMap((c) => [c.name, c.company_number])]
        .some((v) => String(v || "").toLowerCase().includes(q))
    })
  }, [data, filter, search])

  const counts = data?.counts || {}

  return (
    <>
      <PageTitle
        title="Company Formation"
        description="Every workspace's formation orders and the companies being formed, as in their Smart Operations."
      />
      <LoadError error={error} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          value={filter === "All" ? "" : filter}
          onChange={(v) => setFilter(v || "All")}
          options={[["Pending", `Pending ${counts.Pending ?? ""}`], ["Registered", `Registered ${counts.Registered ?? ""}`], ["", `All ${counts.All ?? ""}`]]}
        />
        <div className="relative w-full sm:w-72">
          <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search workspace, company or order…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Panel>
        {data === null && !error ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : shown.length === 0 ? (
          <Empty icon={IconBuildingPlus} title={search.trim() ? "Nothing found" : "No formation orders"}>
            Orders with a formation product in any workspace show up here.
          </Empty>
        ) : (
          <ul className="divide-y text-sm">
            {shown.map((o) => (
              <li key={`${o.workspace}-${o.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link to={`/owner/workspaces/${o.workspace}`} className="font-medium text-primary hover:underline">
                      {o.workspace_name}
                    </Link>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-medium">{o.order_number}</span>
                    <span className="text-xs text-muted-foreground">{day(o.created_at)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {o.applicant_name || "—"}{o.products || o.service_name ? ` · ${o.products || o.service_name}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(o.companies || []).length ? (
                      o.companies.map((c) => (
                        <span key={c.id} className="rounded-md border px-2 py-0.5 text-xs">
                          {c.name}{c.registered && c.company_number ? ` · ${c.company_number}` : " · not registered yet"}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">{o.proposed_name ? `${o.proposed_name}: ` : ""}no company card yet</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[o.formation_status] || "bg-muted text-muted-foreground"}`}>
                    {o.formation_status}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Order {o.status || "Pending"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
