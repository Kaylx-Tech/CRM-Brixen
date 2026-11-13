"use client"

import * as React from "react"
import { useNavigate } from "react-router-dom"
import { canOpenPath, isAdminRole, isManagerOrAbove } from "@/lib/permissions"
import { IS_FINSTAP } from "@/lib/workspace"
import { FINSTAP_NAV_GROUPS } from "@/lib/finstap-nav"
import { apiRequest } from "@/lib/api"
import {
  IconDashboard,
  IconUsers,
  IconUser,
  IconBuilding,
  IconCalculator,
  IconShoppingCart,
  IconListCheck,
  IconApps,
  IconFileInvoice,
  IconFileCheck,
  IconMessageCircle,
  IconLink,
  IconBrain,
  IconHistory,
  IconMail,
  IconSettings,
  IconUserCircle,
  IconBell,
  IconSearchOff,
  IconLoader2,
} from "@tabler/icons-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

const commandGroups = [
  {
    heading: "Navigation",
    items: [
      { title: "Overview", url: "/admin/dashboard", icon: IconDashboard },
      { title: "Customers / Signups", url: "/admin/customers", icon: IconUsers },
      { title: "Company Registered", url: "/admin/companies", icon: IconBuilding },
      { title: "Orders Manager", url: "/admin/orders", icon: IconShoppingCart },
    ],
  },
  {
    heading: "Services & Operations",
    items: [
      { title: "Tasks & Team", url: "/admin/tasks", icon: IconListCheck },
      { title: "Services Catalog", url: "/admin/services", icon: IconApps },
      { title: "Smart Intake", url: "/admin/intake", icon: IconBrain },
    ],
  },
  {
    heading: "Finance & Documents",
    items: [
      { title: "Accountancy", url: "/admin/accountancy", icon: IconCalculator },
      { title: "Payment/Invoices", url: "/admin/payments", icon: IconFileInvoice },
      { title: "Documents Review", url: "/admin/documents", icon: IconFileCheck },
      { title: "Support Tickets", url: "/admin/tickets", icon: IconMessageCircle },
      { title: "Smart Operations", url: "/admin/smart-operations", icon: IconLink },
    ],
  },
  {
    heading: "System & Account",
    items: [
      { title: "Notifications", url: "/admin/notifications", icon: IconBell },
      { title: "Audit Logs", url: "/admin/logs", icon: IconHistory },
      { title: "Email Log", url: "/admin/email-log", icon: IconMail },
      { title: "System Settings", url: "/admin/settings", icon: IconSettings },
      { title: "Profile & Password", url: "/admin/settings?tab=profile", icon: IconUserCircle },
    ],
  },
]

// Records from the server (GET /admin/search, backend/routes/search_routes.py): how each kind is shown and opened.
// Each opens on its own page: a customer or company in its window, an order (or an invoice's order) in the order view.
const RESULT_KINDS = [
  {
    key: "clients",
    heading: "Clients",
    icon: IconUser,
    page: "/admin/customers",
    title: (r) => r.full_name || r.email,
    sub: (r) => [r.email, r.phone].filter(Boolean).join(" · "),
    tag: (r) => r.client_type && r.client_type !== "Normal" ? r.client_type : "",
    open: (r) => ({ url: `/admin/customers?open=${r.id}` }),
  },
  {
    key: "companies",
    heading: "Companies",
    icon: IconBuilding,
    page: "/admin/companies",
    title: (r) => r.name,
    sub: (r) => [r.company_number, r.owner_name].filter(Boolean).join(" · "),
    tag: (r) => r.status,
    open: (r) => ({ url: `/admin/companies?open=${r.id}`, state: { company: r } }),
  },
  {
    key: "orders",
    heading: "Orders",
    icon: IconShoppingCart,
    page: "/admin/orders",
    title: (r) => `${r.order_number} · ${r.service_name}`,
    sub: (r) => [r.company_name, r.owner_name || r.client_name].filter(Boolean).join(" · "),
    tag: (r) => r.status,
    open: (r) => ({ url: `/admin/orders?open=${r.id}` }),
  },
  {
    key: "invoices",
    heading: "Invoices",
    icon: IconFileInvoice,
    page: "/admin/payments",
    title: (r) => r.invoice_number,
    sub: (r) => [r.client_name, r.order_number && `Order ${r.order_number}`].filter(Boolean).join(" · "),
    tag: (r) => r.status,
    open: (r) => ({ url: r.order_id ? `/admin/orders?open=${r.order_id}` : "/admin/payments" }),
  },
]

const MIN_LENGTH = 2
const DEBOUNCE_MS = 250

/** Server results for what is typed: a short pause after typing, and an answer that arrives late never wins. */
function useRecordSearch(query, open) {
  const [state, setState] = React.useState({ q: "", results: null, loading: false })
  const latest = React.useRef(0)

  React.useEffect(() => {
    const text = query.trim()
    if (!open || text.length < MIN_LENGTH) {
      setState({ q: text, results: null, loading: false })
      return undefined
    }
    const ticket = ++latest.current
    setState((prev) => ({ ...prev, loading: true }))
    const timer = setTimeout(async () => {
      const res = await apiRequest(`/admin/search?q=${encodeURIComponent(text)}`, { silent: true, label: "Search" })
      if (ticket !== latest.current) return
      setState({ q: text, results: res.ok ? res.data?.data || res.data || {} : {}, loading: false })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, open])

  return state
}

export function CommandManyItems({ open: controlledOpen, onOpenChange: setControlledOpen }) {
  const navigate = useNavigate()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const [query, setQuery] = React.useState("")
  const { results, loading } = useRecordSearch(query, open)

  // Only offer pages this role can open ("System Settings" itself is admin-only; profile is for everyone)
  const visibleGroups = React.useMemo(() => {
    const admin = isAdminRole()
    // Finstap: the same names and groups as its menu, then System & Account
    const groups = IS_FINSTAP
      ? [...FINSTAP_NAV_GROUPS.map((g) => ({ heading: g.label, items: g.items })), commandGroups[commandGroups.length - 1]]
      : commandGroups
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          canOpenPath(item.url) && (admin || item.url !== "/admin/settings") && (!item.managerOnly || isManagerOrAbove())),
      }))
      .filter((group) => group.items.length > 0)
  }, [])

  // Pages whose name (or group) has every typed word in it; all of them while nothing is typed
  const pageGroups = React.useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return visibleGroups
    return visibleGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const text = `${group.heading} ${item.title}`.toLowerCase()
          return words.every((w) => text.includes(w))
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [visibleGroups, query])

  // Record groups the user may open (the server already leaves out what their role cannot see)
  const recordGroups = React.useMemo(
    () =>
      RESULT_KINDS.filter((kind) => canOpenPath(kind.page))
        .map((kind) => ({ kind, rows: (results && results[kind.key]) || [] }))
        .filter((g) => g.rows.length > 0),
    [results],
  )

  const setOpen = React.useCallback((value) => {
    if (setControlledOpen) {
      setControlledOpen(value)
    }
    if (!isControlled) {
      setInternalOpen(value)
    }
  }, [setControlledOpen, isControlled])

  // A fresh box each time it opens
  React.useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  React.useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [setOpen])

  const go = (url, state) => {
    setOpen(false)
    navigate(url, state ? { state } : undefined)
  }

  const typed = query.trim().length >= MIN_LENGTH
  const nothing = !loading && !recordGroups.length && !pageGroups.length

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {/* The list is filtered here (pages) and on the server (records), not by the command box itself */}
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search clients, companies, orders, invoices or pages..."
        />
        <CommandList>
          {loading && typed && !recordGroups.length && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" /> Searching…
            </div>
          )}
          {nothing && (
            <CommandEmpty>
              <div className="flex flex-col items-center justify-center gap-2 py-4 text-muted-foreground">
                <IconSearchOff className="size-8 opacity-40 stroke-1" />
                <span>{typed ? `Nothing found for "${query.trim()}".` : "No results found."}</span>
              </div>
            </CommandEmpty>
          )}

          {recordGroups.map(({ kind, rows }, idx) => (
            <React.Fragment key={kind.key}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={kind.heading}>
                {rows.map((row) => {
                  const Icon = kind.icon
                  const target = kind.open(row)
                  const sub = kind.sub(row)
                  const tag = kind.tag(row)
                  return (
                    <CommandItem
                      key={`${kind.key}-${row.id}`}
                      value={`${kind.key}-${row.id}`}
                      onSelect={() => go(target.url, target.state)}
                      className="cursor-pointer"
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{kind.title(row)}</span>
                        {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
                      </span>
                      {tag && (
                        <span className="ml-2 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {tag}
                        </span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </React.Fragment>
          ))}

          {pageGroups.map((group, idx) => (
            <React.Fragment key={group.heading}>
              {(idx > 0 || recordGroups.length > 0) && <CommandSeparator />}
              <CommandGroup heading={typed ? `Pages · ${group.heading}` : group.heading}>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.url}
                      value={`${group.heading} ${item.title}`}
                      onSelect={() => go(item.url)}
                      className="cursor-pointer"
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{item.title}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
