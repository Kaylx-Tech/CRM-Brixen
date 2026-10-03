import * as React from "react"
import brixenLogo from "@/assets/white-logo.webp"
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
  IconBrain,
  IconHistory,
  IconSettings,
  IconBell,
  IconSearch,
} from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { CommandManyItems } from "@/components/ComboSearch"

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
  ],
}

export function AppSidebar({
  ...props
}) {
  const [searchOpen, setSearchOpen] = React.useState(false)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="w-full flex flex-col justify-center items-center">
              <img src={brixenLogo} alt="Brixen" className="h-18 w-auto" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="relative cursor-pointer" onClick={() => setSearchOpen(true)}>
          <IconSearch className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted pointer-events-none" />
          <Input
            className="max-w-xs pl-8 text-xs text-muted bg-white/10 border border-input/10 cursor-pointer"
            placeholder="Search"
            readOnly
            onClick={() => setSearchOpen(true)}
          />
          <span className="absolute right-2.5 top-1.5 text-xs text-white/50 rounded-[8px] pointer-events-none">CRTL + K</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <CommandManyItems open={searchOpen} onOpenChange={setSearchOpen} />
    </Sidebar>
  )
}
