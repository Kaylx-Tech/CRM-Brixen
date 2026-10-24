import React from "react"
import { Navigate, Outlet } from "react-router-dom"
import brixenLogo from "@/assets/white-logo.webp"
import { FinstapMenuLogo } from "@/components/finstap-brand"
import { IS_FINSTAP } from "@/lib/workspace"
import { loadBranding } from "@/lib/branding"
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

/** Customer portal pages (same pages as the old portal, one flat list). */
const NAV_ITEMS = [
  { title: "Dashboard", url: "/portal/dashboard", icon: <IconLayoutDashboard /> },
  { title: "Companies", url: "/portal/companies", icon: <IconBuilding /> },
  { title: "Accountancy", url: "/portal/accountancy", icon: <IconCalculator /> },
  { title: "Addresses", url: "/portal/addresses", icon: <IconMapPin /> },
  { title: "Orders", url: "/portal/orders", icon: <IconShoppingBag /> },
  { title: "Invoices & Payments", url: "/portal/invoices", icon: <IconFileInvoice /> },
  { title: "Documents", url: "/portal/documents", icon: <IconFolder /> },
  { title: "Services", url: "/portal/services", icon: <IconApps /> },
  { title: "Order Support", url: "/portal/support", icon: <IconHeadset /> },
  { title: "Messages", url: "/portal/messages", icon: <IconMessage /> },
  { title: "Profile", url: "/portal/profile", icon: <IconUserCheck /> },
]

export default function ClientLayout() {
  // Signed in now: the workspace's own branding
  React.useEffect(() => {
    loadBranding()
  }, [])

  // Team members belong in the admin CRM
  if (getRole() && getRole() !== "CLIENT") return <Navigate to="/admin/dashboard" replace />

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex w-full flex-col items-center justify-center">
                {IS_FINSTAP ? (
                  <FinstapMenuLogo />
                ) : (
                  <img src={brixenLogo} alt="Brixen" className="h-18 w-auto" />
                )}
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={NAV_ITEMS} />
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
              <Outlet />
            </main>
          </PageTransition>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}
