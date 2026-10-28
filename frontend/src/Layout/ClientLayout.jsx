import React from "react"
import { Navigate, Outlet } from "react-router-dom"
import brixenLogo from "@/assets/brixen-logo.png"
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
import { PageTransition } from "@/lib/motion"

/** Customer portal pages, grouped like the old Brixen portal. */
const NAV_GROUPS = [
  { label: null, items: [{ title: "Dashboard", url: "/portal/dashboard", icon: <IconLayoutDashboard /> }] },
  {
    label: "My Portfolio",
    items: [
      { title: "Company Registered", url: "/portal/companies", icon: <IconBuilding /> },
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
    // Old Brixen portal colours: deep navy menu
    <SidebarProvider className="[--sidebar:#0B1220]">
      <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* The navy logo on a white card, as in the old portal */}
              <div className="px-2 pt-3 pb-3">
                <div className="flex h-16 items-center justify-center rounded-xl bg-white px-3 py-2.5 shadow-[0_6px_16px_rgba(0,0,0,0.18)]">
                  <img src={brixenLogo} alt="Brixen Consultants" className="h-11 w-auto max-w-[183px] object-contain" />
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavMain groups={NAV_GROUPS} variant="portal" />
        </SidebarContent>
        <SidebarFooter>
          <NavUser profileHref="/portal/profile" notificationsHref="/portal/notifications" />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="p-2 bg-sidebar h-svh overflow-hidden relative">
        <ScrollArea className="h-full w-full rounded-xl border bg-background shadow-sm">
          <SiteHeader homeHref="/portal/dashboard" />
          <PageTransition>
            <main className="flex flex-col gap-4 p-2 lg:p-6 pb-20">
              <React.Suspense fallback={null}><Outlet /></React.Suspense>
            </main>
          </PageTransition>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}
