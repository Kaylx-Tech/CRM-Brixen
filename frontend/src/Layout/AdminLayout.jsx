import React, { useState } from 'react'
import { AppSidebar } from "./Sidebar"
import { SiteHeader } from "./Header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Navigate, Outlet } from "react-router-dom"
import { getRole } from "@/lib/permissions"
import AiInput from "@/components/ai-input"
import { authHeaders } from "@/lib/api"
import { PageTransition } from "@/lib/motion"

const AdminLayout = () => {
  const [aiMessages, setAiMessages] = useState([])
  const [aiLoading, setAiLoading] = useState(false)

  const handleSendAi = async (prompt) => {
    const userMsg = { role: 'user', content: prompt }
    setAiMessages((prev) => [...prev, userMsg])
    setAiLoading(true)

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${apiUrl}/ai/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history: aiMessages })
      }).catch(() => null)

      let reply = ""
      if (res && res.ok) {
        const data = await res.json().catch(() => ({}))
        reply = data.response || data.message || data.reply
      }

      if (!reply) {
        const p = prompt.toLowerCase()
        if (p.includes("company") || p.includes("companies")) {
          reply = "You can view and manage all registered entities in **Company Registered** (`/admin/companies`)."
        } else if (p.includes("account") || p.includes("filing") || p.includes("tax") || p.includes("hmrc")) {
          reply = "The **Accountancy** module (`/admin/accountancy`) manages Companies House annual accounts and HMRC returns."
        } else if (p.includes("customer") || p.includes("client") || p.includes("b2b")) {
          reply = "All B2B accounts and website signups are in **Customers & Signups** (`/admin/customers`)."
        } else {
          reply = `I've noted your request: **"${prompt}"**. I can assist with company filings, CRM customers, orders, and accountancy.`
        }
      }

      setAiMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setAiMessages((prev) => [...prev, { role: 'assistant', content: "I encountered an issue processing your request. Please try again." }])
    } finally {
      setAiLoading(false)
    }
  }

  // Customers have their own portal; the admin CRM is for the team only
  if (getRole() === 'CLIENT') return <Navigate to="/portal/dashboard" replace />

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="p-2 bg-sidebar h-svh overflow-hidden relative">
        <ScrollArea className="h-full w-full rounded-xl border bg-background shadow-sm">
          <SiteHeader />
          <PageTransition>
            <main className="flex flex-col gap-4 p-2 lg:p-6 pb-20">
              <Outlet />
            </main>
          </PageTransition>
        </ScrollArea>

        <AiInput
          messages={aiMessages}
          loading={aiLoading}
          onSubmit={handleSendAi}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AdminLayout
