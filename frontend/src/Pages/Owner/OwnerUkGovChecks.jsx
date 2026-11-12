import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { IconFileText, IconSearch } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { ownerApi } from "@/lib/owner"
import { Empty, FilterTabs, LoadError, PageTitle, Panel } from "./ownerUi"

function day(value) {
  const text = String(value || "")
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text.replace(" ", "T") + "Z")
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

const STATUS_TONE = {
  Completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "In Progress": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  Cancelled: "bg-muted text-muted-foreground",
}

/** Smart Operations › UK Gov Checks in every workspace (their tasks), open first (read only). */
export default function OwnerUkGovChecks() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("Open")
  const [search, setSearch] = useState("")

  useEffect(() => {
    ownerApi("/smart-operations/uk-gov-checks").then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.checks || []).filter((c) => {
      if (filter === "Open" && c.status === "Completed") return false
      if (filter === "Overdue" && !c.overdue) return false
      if (filter === "Completed" && c.status !== "Completed") return false
      if (!q) return true
      return [c.workspace_name, c.workspace, c.title, c.assigned_name, c.company_name, c.status]
        .some((v) => String(v || "").toLowerCase().includes(q))
    })
  }, [data, filter, search])

  const counts = data?.counts || {}

  return (
    <>
      <PageTitle
        title="UK Gov Checks"
        description="Every workspace's UK Gov Checks, as in their Smart Operations: open ones first, by due date."
      />
      <LoadError error={error} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          value={filter === "All" ? "" : filter}
          onChange={(v) => setFilter(v || "All")}
          options={[
            ["Open", `Open ${counts.Open ?? ""}`],
            ["Overdue", `Overdue ${counts.Overdue ?? ""}`],
            ["Completed", `Completed ${counts.Completed ?? ""}`],
            ["", `All ${counts.All ?? ""}`],
          ]}
        />
        <div className="relative w-full sm:w-72">
          <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search workspace, check or person…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Panel>
        {data === null && !error ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : shown.length === 0 ? (
          <Empty icon={IconFileText} title={search.trim() ? "Nothing found" : "No UK Gov Checks here"}>
            The checks the workspaces add in Smart Operations show up here.
          </Empty>
        ) : (
          <ul className="divide-y text-sm">
            {shown.map((c) => (
              <li key={`${c.workspace}-${c.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="font-medium">{c.title}</div>
                  <div className="text-muted-foreground">
                    <Link to={`/owner/workspaces/${c.workspace}`} className="text-primary hover:underline">{c.workspace_name}</Link>
                    {c.company_name ? ` · ${c.company_name}` : ""}
                    {c.assigned_name ? ` · ${c.assigned_name}` : " · not assigned"}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {c.due_date && (
                    <span className={`text-xs ${c.overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {c.overdue ? "Overdue · " : "Due "}{day(c.due_date)}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[c.status] || "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
                    {c.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
