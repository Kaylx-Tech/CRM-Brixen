import * as React from "react"
import brixenLogo from "@/assets/white-logo.webp"
import { FinstapMenuLogo } from "@/components/finstap-brand"
import { IS_FINSTAP } from "@/lib/workspace"
import { loadBranding } from "@/lib/branding"
import { FINSTAP_NAV_GROUPS } from "@/lib/finstap-nav"
import { apiRequest } from "@/lib/api"
import { Link, useLocation } from "react-router-dom"
import { NavMain } from "@/Layout/nav-main"
import { FINSTAP_MENU } from "@/lib/finstap-menu"
import { NavUser } from "@/Layout/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
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
import { canOpenPath, homePath, isAdminRole, isStaffRole, isManagerOrAbove } from "@/lib/permissions"

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
    { title: "Finance", url: "/admin/payments", icon: <IconFileInvoice /> },
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

/** Finstap, admins only: while the free trial runs, how many days are left and a button to choose a plan. */
function TrialCard() {
  const [trial, setTrial] = React.useState(null)
  React.useEffect(() => {
    if (!isAdminRole()) return undefined
    let alive = true
    apiRequest("/admin/billing", { label: "Billing", silent: true }).then((res) => {
      const d = res.ok ? res.data?.data : null
      if (alive && d?.trial_active && d.trial_ends_at) setTrial(d.trial_ends_at)
    })
    return () => {
      alive = false
    }
  }, [])
  if (!trial) return null
  const ends = new Date(String(trial).replace(" ", "T"))
  const days = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86_400_000))
  return (
    <div className="relative mt-1 flex flex-col gap-2.5 border-t border-white/10 px-1.5 pt-3">
      <p className="text-sm font-semibold text-sidebar-foreground">
        {days === 0 ? "Trial ends today" : `Trial ends in ${days} day${days === 1 ? "" : "s"}`}
      </p>
      <Link
        to="/admin/billing"
        className="flex h-9 items-center justify-center rounded-full bg-white text-sm font-medium text-neutral-900 transition-colors hover:bg-white/90"
      >
        Choose a plan
      </Link>
    </div>
  )
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
        .filter((item) => canOpenPath(item.url) && (!item.managerOnly || isManagerOrAbove()))
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

  const location = useLocation()

  // Finstap (Shopify-style): logo on the left with the hide-menu button, a quiet search box, one menu style,
  // Settings, the person and the trial card at the bottom over a soft glow in the accent
  if (IS_FINSTAP) {
    return (
      <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0" {...props}>
        <SidebarHeader className="gap-3 px-3 pt-4">
          <div className="flex items-center justify-between gap-2 pl-1">
            {/* The logo opens the dashboard */}
            <Link to={homePath()} aria-label="Go to the dashboard" className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
              <FinstapMenuLogo />
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="fs-raised flex h-8 w-full cursor-pointer items-center gap-2 rounded-[14px] px-2.5 text-[0.8125rem] text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <IconSearch className="size-4 shrink-0" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="font-sans text-xs text-sidebar-foreground/50">{searchKey}</kbd>
          </button>
        </SidebarHeader>
        <SidebarContent>
          <NavMain groups={navGroups} badges={counts} variant="finstap" />
        </SidebarContent>
        <SidebarFooter className="relative gap-2 px-2 pb-3">
          <SidebarMenu className="relative">
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link to="/admin/settings" />}
                isActive={location.pathname.startsWith("/admin/settings")}
                className={FINSTAP_MENU.button}
              >
                <IconSettings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="relative">
            <NavUser user={data.user} />
          </div>
          <TrialCard />
        </SidebarFooter>
        <CommandManyItems open={searchOpen} onOpenChange={setSearchOpen} />
      </Sidebar>
    )
  }

  return (
    <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The logo opens the dashboard */}
            <Link to={homePath()} aria-label="Go to the dashboard" className="w-full flex flex-col justify-center items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
              {/* Finstap build: its own logo (white text on the dark sidebar) */}
              {IS_FINSTAP ? (
                <FinstapMenuLogo />
              ) : (
                <img src={brixenLogo} alt="Brixen" className="h-18 w-auto" />
              )}
            </Link>
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
