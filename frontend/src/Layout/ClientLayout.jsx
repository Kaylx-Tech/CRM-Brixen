import React from "react"
import { Navigate, Outlet } from "react-router-dom"
import brixenLogo from "@/assets/white-logo.webp"
import { NavMain } from "@/Layout/nav-main"
import { NavUser } from "@/Layout/nav-user"
import { SiteHeader } from "@/Layout/Header"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  IconLayoutDashboard,
  IconBuilding,
  IconCalculator,
  IconMapPin,
  IconShoppingBag,
  IconFileInvoice,
  IconFolder,
  IconApps,
  IconHeadset,
  IconMessage,
  IconUserCheck,
} from "@tabler/icons-react"
import { getRole } from "@/lib/permissions"

/** Same sections as the old customer portal sidebar. */
const NAV_GROUPS = [
  { label: null, items: [{ title: "Dashboard", url: "/portal/dashboard", icon: <IconLayoutDashboard /> }] },
  {
    label: "My portfolio",
    items: [
      { title: "Companies", url: "/portal/companies", icon: <IconBuilding /> },
      { title: "Accountancy", url: "/portal/accountancy", icon: <IconCalculator /> },
      { title: "Addresses", url: "/portal/addresses", icon: <IconMapPin /> },
    ],
  },
  {
    label: "Financials",
    items: [
      { title: "Orders", url: "/portal/orders", icon: <IconShoppingBag /> },
      { title: "Invoices & Payments", url: "/portal/invoices", icon: <IconFileInvoice /> },
    ],
  },
  {
    label: "Services",
    items: [
      { title: "Documents", url: "/portal/documents", icon: <IconFolder /> },
      { title: "Services", url: "/portal/services", icon: <IconApps /> },
    ],
  },
  {
    label: "Support",
    items: [
      { title: "Order Support", url: "/portal/support", icon: <IconHeadset /> },
      { title: "Messages", url: "/portal/messages", icon: <IconMessage /> },
    ],
  },
  { label: "Account", items: [{ title: "Profile", url: "/portal/profile", icon: <IconUserCheck /> }] },
]

export default function ClientLayout() {
  // Team members belong in the admin CRM
  if (getRole() && getRole() !== "CLIENT") return <Navigate to="/admin/dashboard" replace />

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex w-full flex-col items-center justify-center">
                <img src={brixenLogo} alt="Brixen" className="h-18 w-auto" />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavMain groups={NAV_GROUPS} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser profileHref="/portal/profile" notificationsHref="/portal/notifications" />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="p-2 bg-sidebar h-svh overflow-hidden relative">
        <ScrollArea className="h-full w-full rounded-xl border bg-background shadow-sm">
          <SiteHeader homeHref="/portal/dashboard" />
          <main className="flex flex-col gap-4 p-2 lg:p-6 pb-20">
            <Outlet />
          </main>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}
