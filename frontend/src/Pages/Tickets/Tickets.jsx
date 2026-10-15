import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  IconRefresh,
  IconSearch,
  IconSend,
  IconLoader2,
  IconMessageCircle,
  IconArrowLeft,
  IconMailCheck,
  IconMailOff,
  IconCircleDot,
  IconMessageCircleExclamation,
} from '@tabler/icons-react'
import { SectionCards } from '../../Layout/StatsCard'
import { apiRequest } from '@/lib/api'
import { toast } from 'sonner'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed']
const FILTERS = [
  ['active', 'Active'],
  ['Open', 'Open'],
  ['In Progress', 'In progress'],
  ['Resolved', 'Resolved'],
  ['Closed', 'Closed'],
  ['all', 'All'],
]

const STATUS_CLASS = {
  Open: 'badge-sky',
  'In Progress': 'badge-amber',
  Resolved: 'badge-green',
  Closed: 'bg-muted text-muted-foreground',
}
const PRIORITY_CLASS = { Urgent: 'badge-red', High: 'badge-amber', Medium: 'badge-sky', Low: 'bg-muted text-muted-foreground' }

function formatWhen(value) {
  if (!value) return ''
  const raw = String(value)
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function TicketListItem({ ticket, active, onOpen }) {
  const waiting = ticket.last_sender_role === 'CLIENT' && ['Open', 'In Progress'].includes(ticket.status)
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket.id)}
      className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
        active ? 'border-primary bg-primary/5' : 'bg-card'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{ticket.subject}</span>
        {waiting ? <span className="size-2 shrink-0 rounded-full bg-primary" title="Waiting for our reply" /> : null}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {ticket.client_name || ticket.client_email || 'Customer'} · {ticket.ticket_number}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge className={`${STATUS_CLASS[ticket.status] || ''} text-[10px]`}>{ticket.status}</Badge>
        {ticket.priority && ticket.priority !== 'Medium' ? (
          <Badge className={`${PRIORITY_CLASS[ticket.priority] || ''} text-[10px]`}>{ticket.priority}</Badge>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {formatWhen(ticket.last_message_at || ticket.created_at)}
        </span>
      </div>
    </button>
  )
}

function Conversation({ ticketId, onBack, onChanged }) {
  const [data, setData] = useState(null)
  const [reply, setReply] = useState('')
  const [replyStatus, setReplyStatus] = useState('auto')
  const [sending, setSending] = useState(false)
  const [lastEmail, setLastEmail] = useState(null)
  const endRef = useRef(null)

  const load = useCallback(async () => {
    const res = await apiRequest(`/admin/tickets/${ticketId}`, { silent: true, label: 'Ticket' })
    if (res.ok) setData(res.data?.data || null)
    else toast.error(res.reason || 'Could not load the ticket')
  }, [ticketId])

  useEffect(() => {
    setData(null)
    setReply('')
    setReplyStatus('auto')
    setLastEmail(null)
    load()
  }, [load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [data?.messages?.length])

  const send = async () => {
    const text = reply.trim()
    if (!text) return
    setSending(true)
    try {
      const res = await apiRequest(`/admin/tickets/${ticketId}/messages`, {
        method: 'POST',
        body: { message: text, ...(replyStatus !== 'auto' ? { status: replyStatus } : {}) },
        silent: true,
        label: 'Reply',
      })
      if (!res.ok) {
        toast.error(res.reason || 'Reply not sent')
        return
      }
      const d = res.data?.data || {}
      setData(d)
      setReply('')
      setReplyStatus('auto')
      setLastEmail(d.email || null)
      toast.success(d.email?.sent ? `Reply sent and emailed to ${d.email.to}` : 'Reply sent (shown in the customer portal)')
      onChanged?.()
    } finally {
      setSending(false)
    }
  }

  const setStatus = async (status) => {
    const res = await apiRequest(`/admin/tickets/${ticketId}`, { method: 'PATCH', body: { status }, silent: true, label: 'Ticket' })
    if (res.ok) {
      setData(res.data?.data || null)
      toast.success(`Ticket marked ${status}`)
      onChanged?.()
    } else toast.error(res.reason || 'Could not update the ticket')
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <IconLoader2 className="size-4 animate-spin" /> Loading…
      </div>
    )
  }
  const t = data.ticket
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to tickets">
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{t.subject}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {t.ticket_number} · {t.client_name || 'Customer'}{t.client_email ? ` (${t.client_email})` : ''}
            {t.company_name ? ` · ${t.company_name}` : ''}{t.order_number ? ` · Order ${t.order_number}` : ''}
            {t.category ? ` · ${t.category}` : ''}
          </p>
        </div>
        <Select value={t.status} onValueChange={(v) => v && v !== t.status && setStatus(v)}>
          <SelectTrigger className="h-8 w-[140px] shrink-0" aria-label="Ticket status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {data.messages.map((m) => {
            const team = m.sender_role !== 'CLIENT'
            return (
              <div key={m.id} className={`flex ${team ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${team ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <p className={`mb-1 text-[11px] ${team ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {team ? `${m.sender_name || 'Team'} (team)` : (m.sender_name || 'Customer')} · {formatWhen(m.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t p-3">
        {lastEmail ? (
          <p className={`flex items-center gap-1.5 text-xs ${lastEmail.sent ? 'text-emerald-600' : 'text-amber-600'}`}>
            {lastEmail.sent ? <IconMailCheck className="size-3.5" /> : <IconMailOff className="size-3.5" />}
            {lastEmail.sent
              ? `Last reply emailed to ${lastEmail.to}`
              : `Last reply not emailed (${lastEmail.status}). The customer still sees it in the portal; check the Email Log.`}
          </p>
        ) : null}
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write a reply to the customer…"
          rows={3}
          maxLength={5000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send()
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={replyStatus} onValueChange={(v) => v && setReplyStatus(v)}>
            <SelectTrigger className="h-8 w-[220px]" aria-label="Status after reply">
              <SelectValue>
                {replyStatus === 'auto' ? 'Keep status (Open → In progress)' : `Mark as ${replyStatus}`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">Keep status (Open → In progress)</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>Mark as {s}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button onClick={send} disabled={sending || !reply.trim()}>
            {sending ? <IconLoader2 className="animate-spin" /> : <IconSend />}
            Send reply
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Tickets() {
  const [tickets, setTickets] = useState([])
  const [counts, setCounts] = useState({})
  const [waiting, setWaiting] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter !== 'all') qs.set('status', filter)
      if (search.trim()) qs.set('search', search.trim())
      const res = await apiRequest(`/admin/tickets?${qs.toString()}`, { label: 'Support tickets', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'Tickets failed to load')
        setTickets([])
        return
      }
      const d = res.data?.data || {}
      setTickets(d.tickets || [])
      setCounts(d.counts || {})
      setWaiting(d.waiting_reply || 0)
    } finally {
      setIsLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const activeCount = (counts.Open || 0) + (counts['In Progress'] || 0)
  const filterCount = useMemo(() => ({
    active: activeCount,
    all: Object.values(counts).reduce((a, b) => a + b, 0),
    ...counts,
  }), [counts, activeCount])

  return (
    <div className="flex w-full flex-col gap-4 pb-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Support Tickets</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeCount} active
            {waiting ? <span className="text-primary"> · {waiting} waiting for a reply</span> : null}
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={isLoading}>
          <IconRefresh className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <SectionCards
        compact
        isLoading={isLoading && Object.keys(counts).length === 0}
        stats={[
          { title: 'Active Tickets', hero: true, value: String(activeCount), footerSubText: 'Open and in progress', onClick: () => setFilter('active'), active: filter === 'active' },
          { title: 'Waiting for Reply', tone: 'orange', icon: IconMessageCircleExclamation, value: String(waiting), footerSubText: 'Customer wrote last' },
          { title: 'Open', tone: 'blue', icon: IconCircleDot, value: String(counts.Open || 0), onClick: () => setFilter('Open'), active: filter === 'Open' },
          { title: 'In Progress', tone: 'amber', value: String(counts['In Progress'] || 0), onClick: () => setFilter('In Progress'), active: filter === 'In Progress' },
          { title: 'Resolved', tone: 'emerald', value: String((counts.Resolved || 0) + (counts.Closed || 0)), footerSubText: `${counts.Closed || 0} closed`, onClick: () => setFilter('Resolved'), active: filter === 'Resolved' },
        ]}
      />

      <div className="grid h-[calc(100vh-340px)] min-h-[480px] grid-cols-1 gap-4 md:grid-cols-[340px_1fr]">
        <div className={`flex min-h-0 flex-col gap-3 ${openId ? 'hidden md:flex' : 'flex'}`}>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="h-auto flex-wrap justify-start">
              {FILTERS.map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="text-xs">
                  {label}
                  {filterCount[value] ? <span className="ml-1 text-muted-foreground">{filterCount[value]}</span> : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search ticket, subject, customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 pr-2">
              {isLoading && !tickets.length ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <IconLoader2 className="size-4 animate-spin" /> Loading…
                </div>
              ) : tickets.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                  No tickets here.
                </p>
              ) : (
                tickets.map((t) => (
                  <TicketListItem key={t.id} ticket={t} active={t.id === openId} onOpen={setOpenId} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className={`min-h-0 overflow-hidden rounded-2xl border bg-card ${openId ? 'block' : 'hidden md:block'}`}>
          {openId ? (
            <Conversation ticketId={openId} onBack={() => setOpenId(null)} onChanged={load} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <IconMessageCircle className="size-8" />
              Choose a ticket to read the conversation and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
