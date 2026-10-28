import React, { useState } from 'react'
import { AppSidebar } from "./Sidebar"
import { SiteHeader } from "./Header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Navigate, Outlet } from "react-router-dom"
import PageLoading from "@/components/PageLoading"
import { usePrefetchPages } from "@/lib/prefetchPages"
import { getRole } from "@/lib/permissions"
import AiInput from "@/components/ai-input"
import { authHeaders } from "@/lib/api"
import { PageTransition } from "@/lib/motion"

const AdminLayout = () => {
  usePrefetchPages('admin')
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

      // The assistant's answer, or what went wrong (no API key, too many questions, …) in its place
      const data = res ? await res.json().catch(() => ({})) : {}
      const reply = res?.ok
        ? data.data?.reply
        : data.error || data.message || (res ? '' : 'Could not reach the server. Check your connection.')

      setAiMessages((prev) => [...prev, {
        role: 'assistant',
        content: reply || 'I encountered an issue processing your request. Please try again.',
      }])
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
              <React.Suspense fallback={<PageLoading />}><Outlet /></React.Suspense>
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