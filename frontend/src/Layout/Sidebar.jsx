import * as React from "react"
import brixenLogo from "@/assets/white-logo.webp"
import { FinstapLogo } from "@/components/finstap-brand"
import { IS_FINSTAP } from "@/lib/workspace"
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

export function AppSidebar({
  ...props
}) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  // Each role only sees the pages it can open; staff land on their own work instead of the admin overview
  const navItems = React.useMemo(() => {
    const staff = isStaffRole()
    return data.navMain
      .filter((item) => canOpenPath(item.url))
      .map((item) => (staff && item.url === "/admin/dashboard" ? { ...item, title: "My Dashboard" } : item))
  }, [])

  return (
    <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="w-full flex flex-col justify-center items-center">
              {/* Finstap build: its own logo (white text on the dark sidebar) */}
              {IS_FINSTAP ? (
                <FinstapLogo light className="my-3 h-9" />
              ) : (
                <img src={brixenLogo} alt="Brixen" className="h-18 w-auto" />
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 cursor-pointer"
        >
          <IconSearch className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[10px] text-white/50">Ctrl K</kbd>
        </button>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <CommandManyItems open={searchOpen} onOpenChange={setSearchOpen} />
    </Sidebar>
  )
}
