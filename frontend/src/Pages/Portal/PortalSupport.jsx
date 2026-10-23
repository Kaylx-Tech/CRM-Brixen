import React, { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { IconPlus, IconLoader2, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"
import { apiRequest } from "@/lib/api"
import { usePortalData, PageHeader, PageState, StatusBadge, formatDate } from "./portalShared"

const PRIORITIES = ["Low", "Medium", "High", "Urgent"]
const CATEGORIES = ["General Support", "Order Question", "Documents", "Billing", "Company Changes"]

function NewTicketDialog({ open, onClose, onCreated, orders, initialSubject }) {
  const [form, setForm] = useState({ subject: "", category: CATEGORIES[0], priority: "Medium", order_id: "none", description: "" })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, subject: initialSubject || "", description: "" }))
  }, [open, initialSubject])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error("Add a subject and a message")
      return
    }
    setIsSaving(true)
    try {
      const res = await apiRequest("/client/tickets", {
        method: "POST",
        body: { ...form, order_id: form.order_id !== "none" ? Number(form.order_id) : undefined },
        silent: true,
        label: "Support ticket",
      })
      if (!res.ok) {
        toast.error(res.reason || "Could not send your request")
        return
      }
      toast.success(res.data?.message || "Ticket submitted")
      onCreated(res.data?.data?.id)
    } finally {
      setIsSaving(false)
    }
  }

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSaving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Contact support</DialogTitle>
            <DialogDescription>Tell us what you need and our team will reply here.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="t-subject">Subject</Label>
            <Input id="t-subject" value={form.subject} onChange={(e) => set("subject")(e.target.value)} maxLength={200} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Select value={form.category} onValueChange={(v) => set("category")(v || CATEGORIES[0])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority")(v || "Medium")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Related order (optional)</Label>
            <Select value={form.order_id} onValueChange={(v) => set("order_id")(v || "none")}>
              <SelectTrigger className="w-full">
                <SelectValue>{form.order_id === "none" ? "None" : (orders.find((o) => String(o.id) === form.order_id)?.order_number || "Order")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">None</SelectItem>
                  {orders.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.order_number} · {o.service_name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-message">Message</Label>
            <Textarea id="t-message" rows={5} value={form.description} onChange={(e) => set("description")(e.target.value)} maxLength={5000} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TicketThread({ ticketId, onChanged }) {
  const [thread, setThread] = useState(null)
  const [reply, setReply] = useState("")
  const [isSending, setIsSending] = useState(false)

  const load = useCallback(async (method = "GET", body) => {
    const res = await apiRequest(`/client/tickets/${ticketId}/messages`, { method, body, silent: true, label: "Ticket" })
    if (res.ok) setThread(res.data?.data || null)
    else toast.error(res.reason || "Could not load the conversation")
    return res.ok
  }, [ticketId])

  useEffect(() => {
    setThread(null)
    load()
  }, [load])

  const send = async (e) => {
    e.preventDefault()
    if (!reply.trim()) return
    setIsSending(true)
    try {
      if (await load("POST", { message: reply.trim() })) {
        setReply("")
        onChanged()
      }
    } finally {
      setIsSending(false)
    }
  }

  if (!thread) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><IconLoader2 className="size-4 animate-spin" /> Loading…</div>
  }
  const t = thread.ticket || {}
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate font-semibold">{t.subject}</h3>
          <StatusBadge status={t.status} />
        </div>
        <p className="text-xs text-muted-foreground">{t.ticket_number} · {t.category} · {t.priority} priority</p>
      </div>
      <div className="flex max-h-[50vh] flex-1 flex-col gap-3 overflow-y-auto p-4">
        {(thread.messages || []).map((m) => {
          const mine = m.sender_role === "CLIENT"
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="whitespace-pre-wrap">{m.message}</p>
                <p className={`mt-1 text-[11px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {mine ? "You" : (m.sender_name || "Support team")} · {formatDate(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" className="min-h-0" />
        <Button type="submit" disabled={isSending || !reply.trim()}>
          {isSending ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />}
        </Button>
      </form>
    </div>
  )
}

export default function PortalSupport() {
  const [searchParams] = useSearchParams()
  const { data, isLoading, error, reload } = usePortalData("/client/tickets")
  const { data: orderData } = usePortalData("/client/orders?limit=100")
  const [selected, setSelected] = useState(() => Number(searchParams.get("ticket")) || null)
  const [newOpen, setNewOpen] = useState(() => Boolean(searchParams.get("subject")))
  const tickets = data?.tickets || []

  useEffect(() => {
    if (!selected && tickets.length) setSelected(tickets[0].id)
  }, [tickets, selected])

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Order Support" description="Ask us anything about your orders, documents or companies" onRefresh={reload} isLoading={isLoading}>
        <Button onClick={() => setNewOpen(true)}><IconPlus className="size-4" /> New request</Button>
      </PageHeader>
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!tickets.length}
        emptyText="No support requests yet. Use New request to contact us.">
        <div className="grid overflow-hidden rounded-2xl border bg-card md:grid-cols-[300px_1fr]">
          <ul className="max-h-[65vh] divide-y overflow-y-auto border-b md:border-b-0 md:border-r">
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`w-full cursor-pointer px-4 py-3 text-left hover:bg-muted/40 ${selected === t.id ? "bg-muted/60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t.ticket_number} · {formatDate(t.last_message_at || t.created_at)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div>{selected ? <TicketThread key={selected} ticketId={selected} onChanged={reload} /> : null}</div>
        </div>
      </PageState>
      <NewTicketDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        orders={orderData?.orders || []}
        initialSubject={searchParams.get("subject") || ""}
        onCreated={(id) => {
          setNewOpen(false)
          reload()
          if (id) setSelected(id)
        }}
      />
    </div>
  )
}

export function PortalMessages() {
  const { data, isLoading, error, reload } = usePortalData("/client/messages")
  const messages = data?.messages || []
  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Messages" description="Every message on your support requests" onRefresh={reload} isLoading={isLoading} />
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!messages.length} emptyText="No messages yet.">
        <ul className="divide-y rounded-2xl border bg-card">
          {messages.map((m) => (
            <li key={m.id}>
              <Link to={`/portal/support?ticket=${m.ticket_id}`} className="block px-4 py-3 hover:bg-muted/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{m.subject}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(m.created_at)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{m.sender_role === "CLIENT" ? "You" : (m.sender_name || "Support team")}:</span> {m.message}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </PageState>
    </div>
  )
}
