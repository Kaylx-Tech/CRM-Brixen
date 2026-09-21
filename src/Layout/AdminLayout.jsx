import React from 'react'
import { AppSidebar } from "./Sidebar"
import { SiteHeader } from "./Header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Outlet } from "react-router-dom"

const AdminLayout = () => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="p-2 bg-sidebar h-svh overflow-hidden">
        <ScrollArea className="h-full w-full rounded-xl border bg-background shadow-sm">
          <SiteHeader />
          <main className="flex flex-col gap-4 p-2 lg:p-6">
            <Outlet />
          </main>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AdminLayout