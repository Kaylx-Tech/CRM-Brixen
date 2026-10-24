import * as React from "react"
import brixenLogo from "@/assets/white-logo.webp"
import { FinstapMenuLogo } from "@/components/finstap-brand"
import { IS_FINSTAP } from "@/lib/workspace"
import { loadBranding } from "@/lib/branding"
import { FINSTAP_NAV_GROUPS } from "@/lib/finstap-nav"
import { apiRequest } from "@/lib/api"
import { useLocation } from "react-router-dom"
import { NavMain } from "@/Layout/nav-main"
import { NavUser } from "@/Layout/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  IconDashboard,
  IconUsers,
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
  IconSettings,
  IconBell,
  IconSearch,
  IconTrophy,
} from "@tabler/icons-react"
import { CommandManyItems } from "@/components/ComboSearch"
import { canOpenPath, isStaffRole } from "@/lib/permissions"

const data = {
  user: {
    name: "Admin",
    email: "admin@example.com",
    avatar: "",
  },
  navMain: [
    { title: "Overview", url: "/admin/dashboard", icon: <IconDashboard /> },
    { title: "Customers / Signups", url: "/admin/customers", icon: <IconUsers /> },
    { title: "Company Registered", url: "/admin/companies", icon: <IconBuilding /> },
    { title: "Orders Manager", url: "/admin/orders", icon: <IconShoppingCart /> },
    { title: "Tasks & Team", url: "/admin/tasks", icon: <IconListCheck /> },
    { title: "Services Catalog", url: "/admin/services", icon: <IconApps /> },
    { title: "Smart Intake", url: "/admin/intake", icon: <IconBrain /> },
    { title: "Accountancy", url: "/admin/accountancy", icon: <IconCalculator /> },
    { title: "Payment/Invoices", url: "/admin/payments", icon: <IconFileInvoice /> },
    { title: "Documents Review", url: "/admin/documents", icon: <IconFileCheck /> },
    { title: "Support Tickets", url: "/admin/tickets", icon: <IconMessageCircle /> },
    { title: "Smart Operations", url: "/admin/smart-operations", icon: <IconLink /> },
    { title: "Performance", url: "/admin/performance", icon: <IconTrophy /> },
  ],
}

/** Open work for the menu badges (Orders, Documents, Support), refreshed on each page and every minute. */
function useNavCounts(enabled) {
  const location = useLocation()
  const [counts, setCounts] = React.useState({})

  React.useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const load = () =>
      apiRequest("/admin/stats/nav-counts", { label: "Menu counts", silent: true }).then((res) => {
        if (!cancelled && res.ok) setCounts(res.data?.data || {})
      })
    load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled, location.pathname])

  return counts
}

export function AppSidebar({
  ...props
}) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  // Signed in now: the workspace's own branding (the login page may not have known the workspace)
  React.useEffect(() => {
    loadBranding()
  }, [])
  // Each role only sees the pages it can open; staff land on their own work instead of the admin overview
  const navItems = React.useMemo(() => {
    const staff = isStaffRole()
    return data.navMain
      .filter((item) => canOpenPath(item.url))
      .map((item) => (staff && item.url === "/admin/dashboard" ? { ...item, title: "My Dashboard" } : item))
  }, [])
  // Finstap: the grouped menu (Workspace / Operations / Business), same role rules
  const navGroups = React.useMemo(() => {
    if (!IS_FINSTAP) return []
    const staff = isStaffRole()
    return FINSTAP_NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items
        .filter((item) => canOpenPath(item.url))
        .map(({ icon: Icon, ...item }) => ({
          ...item,
          icon: <Icon />,
          title: staff && item.url === "/admin/dashboard" ? "My Dashboard" : item.title,
        })),
    })).filter((group) => group.items.length)
  }, [])
  const counts = useNavCounts(IS_FINSTAP)
  const searchKey = /Mac|iPhone|iPad/i.test(typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent)
    ? "⌘K"
    : "Ctrl K"

  return (
    <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="w-full flex flex-col justify-center items-center">
              {/* Finstap build: its own logo (white text on the dark sidebar) */}
              {IS_FINSTAP ? (
                <FinstapMenuLogo />
              ) : (
                <img src={brixenLogo} alt="Brixen" className="h-18 w-auto" />
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={`flex w-full items-center gap-2 border border-white/10 bg-white/5 px-2.5 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 cursor-pointer ${
            IS_FINSTAP ? "h-9 rounded-lg" : "h-8 rounded-md"
          }`}
        >
          <IconSearch className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">{IS_FINSTAP ? "Search anything" : "Search"}</span>
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[10px] text-white/50">{searchKey}</kbd>
        </button>
      </SidebarHeader>
      <SidebarContent>
        {IS_FINSTAP ? <NavMain groups={navGroups} badges={counts} variant="finstap" /> : <NavMain items={navItems} />}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <CommandManyItems open={searchOpen} onOpenChange={setSearchOpen} />
    </Sidebar>
  )
}
