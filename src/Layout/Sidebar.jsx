import * as React from "react"
import brixenLogo from "@/assets/brixen-logo.png"
import { NavMain } from "@/Layout/nav-main"
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
  IconBrain, 
  IconHistory, 
  IconSettings, 
  IconUserCircle, 
  IconInnerShadowTop 
} from "@tabler/icons-react"

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
    { title: "Accountancy", url: "/admin/accountancy", icon: <IconCalculator /> },
    { title: "Orders Manager", url: "/admin/orders", icon: <IconShoppingCart /> },
    { title: "Tasks & Team", url: "/admin/tasks", icon: <IconListCheck /> },
    { title: "Services Catalog", url: "/admin/services", icon: <IconApps /> },
    { title: "Payment/Invoices", url: "/admin/payments", icon: <IconFileInvoice /> },
    { title: "Documents Review", url: "/admin/documents", icon: <IconFileCheck /> },
    { title: "Smart Intake", url: "/admin/intake", icon: <IconBrain /> },
    { title: "Audit Logs", url: "/admin/logs", icon: <IconHistory /> },
    { title: "System Settings", url: "/admin/settings", icon: <IconSettings /> },
    { title: "Profile & Password", url: "/admin/profile", icon: <IconUserCircle /> },
  ]
}

export function AppSidebar({
  ...props
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5! h-auto py-2"
              render={<a href="/admin" />}
            >
              <img src={brixenLogo} alt="Brixen" className="h-10 w-auto dark:brightness-0 dark:invert" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
