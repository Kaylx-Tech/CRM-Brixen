import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  IconMail,
  IconPencil,
  IconLoader2,
  IconCalendarWeek,
  IconTrash,
  IconFileText,
  IconDownload,
  IconDots,
} from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { isAdminRole, canOpenPage } from "@/lib/permissions"
import { useSearchParams } from "react-router-dom"
import BalanceSheet from "../Finance/BalanceSheet"
import { openInvoice, downloadInvoice } from "@/lib/invoices"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import { SectionCards } from "../../Layout/StatsCard"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { apiRequest, getApiBase, toastApiEmpty } from "@/lib/api"
import { formatGBP, plainAmount } from "@/lib/money"
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn"

// Invoice row buttons: Apple-style frosted glass that lifts a little on hover and presses in on click
const GLASS_BUTTON =
  "h-8 gap-1.5 rounded-full px-3.5 text-[13px] font-medium border border-black/[0.08] " +
  "bg-gradient-to-b from-white/90 to-slate-50/70 backdrop-blur-md " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_3px_rgba(15,23,42,0.10)] transition-all duration-200 ease-out " +
  "hover:-translate-y-px hover:border-black/[0.12] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_20px_-6px_rgba(15,23,42,0.22)] " +
  "active:translate-y-0 active:scale-[0.97] dark:border-white/15 dark:from-white/15 dark:to-white/5"
// The main "Send" action in the company's colour: tinted glass that fills with the colour on hover
const GLASS_BUTTON_PRIMARY =
  "h-8 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-primary border border-primary/25 " +
  "bg-gradient-to-b from-primary/15 to-primary/5 backdrop-blur-md " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out " +
  "hover:-translate-y-px hover:from-primary hover:to-primary hover:text-primary-foreground hover:border-primary " +
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_20px_-6px_var(--primary)] " +
  "active:translate-y-0 active:scale-[0.97]"

const invoiceCol = createColumnHelper()
const costCol = createColumnHelper()
const profitCol = createColumnHelper()
const oweCol = createColumnHelper()

const PAYMENT_METHODS = [
  'Website Charge',
  'PKR(Bank Transfer)',
  'GBP(Bank Transfer)',
  'Credit Card (Stripe)',
]

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value == null || value === '') return 0
  return parseFloat(String(value).replace(/[^0-9.-]+/g, '')) || 0
}

/**
 * Order cost box on the Revenue tab. It keeps what is being typed itself, so the table does not redraw
 * (and drop the focus) on every key. Enter or clicking away saves; Esc puts the saved cost back.
 * onSave(raw) resolves to the cost to show afterwards.
 */
function CostCell({ order, saving, onSave }) {
  const saved = plainAmount(order.cost)
  const [draft, setDraft] = useState(saved)
  const [prevSaved, setPrevSaved] = useState(saved)
  if (saved !== prevSaved) {
    // A refreshed list brought a new saved cost
    setPrevSaved(saved)
    setDraft(saved)
  }
  const cancelled = useRef(false)
  return (
    <div className="relative w-28">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
      <Input
        inputMode="decimal"
        aria-label={`Cost for order ${order.order_number || order.id}`}
        disabled={saving}
        className="pl-6 pr-7 text-sm tabular-nums"
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          if (cancelled.current) {
            cancelled.current = false
            setDraft(saved)
            return
          }
          setDraft(await onSave(draft))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            e.currentTarget.blur()
          }
        }}
      />
      {saving ? (
        <IconLoader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  )
}

function truncateWords(text, maxWords = 4) {
  const full = String(text || '').trim()
  if (!full) return { short: '—', full: '—', truncated: false }
  const words = full.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return { short: full, full, truncated: false }
  return { short: `${words.slice(0, maxWords).join(' ')}…`, full, truncated: true }
}

function invoiceMoneyBits(inv) {
  const total = Math.round(parseMoney(inv.total ?? inv.amount) * 100) / 100
  let paid = Math.round(parseMoney(inv.amount_paid) * 100) / 100
  let status = inv.display_status || inv.status || 'Pending'
  if (status === 'Part paid') status = 'Partial Paid'
  if (status === 'Paid') paid = total
  if (status === 'Cancelled') return { total, paid: 0, due: 0, status }
  let due
  if (inv.amount_due != null && inv.amount_due !== '') {
    due = Math.max(0, Math.round(parseMoney(inv.amount_due) * 100) / 100)
  } else {
    due = Math.max(0, Math.round((total - paid) * 100) / 100)
  }
  if (status !== 'Paid' && status !== 'Overdue' && status !== 'Cancelled' && paid > 0.004 && due > 0.004) {
    status = 'Partial Paid'
  }
  return { total, paid, due, status }
}

function invoiceWhenLabel(inv) {
  if (!inv) return 'After work'
  if (inv.payment_timing === 'Deposit') {
    const deposit = parseMoney(inv.deposit_amount)
    return deposit > 0 ? `Deposit ${formatGBP(deposit)}` : 'Deposit'
  }
  return inv.payment_timing === 'Advance' ? 'Advance' : 'After work'
}

function buildMonthOptions(count = 12) {
  const options = [{ value: 'all', label: 'All months' }]
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    options.push({ value, label: i === 0 ? `Current month (${label})` : label })
  }
  return options
}

const MONTH_OPTIONS = buildMonthOptions()
const CURRENT_MONTH = MONTH_OPTIONS[1].value

/** "2026-10" for an invoice / order date like "2026-10-15 10:00:00" (local month for ISO timestamps). */
function monthKey(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}/.test(text) && !/[TZ+]/.test(text.slice(10))) return text.slice(0, 7)
  const d = new Date(text)
  return Number.isNaN(d.getTime()) ? text.slice(0, 7) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function statusBadgeClass(status) {
  if (status === 'Paid') return 'badge-green'
  if (status === 'Partial Paid' || status === 'Part paid') return 'badge-sky'
  if (status === 'Overdue' || status === 'Cancelled') return 'bg-destructive/15 text-destructive'
  return 'badge-amber'
}

function ProductCell({ name }) {
  const { short, full, truncated } = truncateWords(name || 'Custom Service', 4)
  if (!truncated) {
    return <span className="block max-w-[11rem] truncate text-sm font-medium">{short}</span>
  }
  return (
    <Tooltip>
      <TooltipTrigger className="block max-w-[11rem] truncate text-left text-sm font-medium cursor-default">
        {short}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left">{full}</TooltipContent>
    </Tooltip>
  )
}

export default function Payments() {
  // Balance Sheet tab: admins only (?tab=balance opens it straight away)
  const canSeeBalance = useMemo(() => canOpenPage('balance-sheet'), [])
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() =>
    searchParams.get('tab') === 'balance' && canOpenPage('balance-sheet') ? 'balance' : 'invoices')

  // Invoices
  const [invoices, setInvoices] = useState([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true)
  const [invoicesError, setInvoicesError] = useState(null)
  const [payFilter, setPayFilter] = useState('all')
  const [sendingId, setSendingId] = useState(null)
  // Admins can delete an invoice once its order has been cancelled
  const canDeleteInvoices = useMemo(() => isAdminRole(), [])
  const [invoiceToDelete, setInvoiceToDelete] = useState(null)
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false)

  // Edit invoice
  const [editInvoice, setEditInvoice] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [isSavingInvoice, setIsSavingInvoice] = useState(false)

  // Revenue
  const [orders, setOrders] = useState([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [ordersError, setOrdersError] = useState(null)
  // One month picker for both tabs; opens on the current month
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH)
  const [revenueFilter, setRevenueFilter] = useState('all')
  // The order whose cost is being saved (only that row's box waits)
  const [savingCostId, setSavingCostId] = useState(null)

  const fetchInvoices = useCallback(async () => {
    setIsLoadingInvoices(true)
    setInvoicesError(null)
    try {
      const res = await apiRequest('/invoices?limit=300', { label: 'Invoices' })
      if (!res.ok) {
        setInvoices([])
        setInvoicesError(res.reason)
        return
      }
      const list = res.data?.data?.invoices || res.data?.invoices || []
      setInvoices(list)
      if (list.length === 0) toastApiEmpty('Invoices', getApiBase())
    } catch (err) {
      setInvoices([])
      setInvoicesError(err?.message || 'Unexpected error')
    } finally {
      setIsLoadingInvoices(false)
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    setIsLoadingOrders(true)
    setOrdersError(null)
    try {
      let path = '/orders?limit=200'
      if (selectedMonth && selectedMonth !== 'all') {
        path += `&month=${encodeURIComponent(selectedMonth)}`
      }
      const res = await apiRequest(path, { label: 'Revenue' })
      if (!res.ok) {
        setOrders([])
        setOrdersError(res.reason)
        return
      }
      const list = (res.data?.data?.orders || res.data?.orders || [])
        .filter((o) => !['Cancelled', 'Refunded'].includes(String(o.status || '')))
      setOrders(list)
    } catch (err) {
      setOrders([])
      setOrdersError(err?.message || 'Unexpected error')
    } finally {
      setIsLoadingOrders(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  useEffect(() => {
    if (activeTab === 'revenue') fetchOrders()
  }, [activeTab, fetchOrders])

  // Invoices of the chosen month (stat cards and the invoice table); "Who still owes you" stays all-time
  const monthInvoices = useMemo(
    () => (selectedMonth === 'all' ? invoices : invoices.filter((inv) => monthKey(inv.created_at || inv.issue_date) === selectedMonth)),
    [invoices, selectedMonth]
  )
  const monthLabel = MONTH_OPTIONS.find((m) => m.value === selectedMonth)?.label.replace(/^Current month \((.*)\)$/, '$1') || 'All months'

  const collectionStats = useMemo(() => {
    let billed = 0, paid = 0, owed = 0, pending = 0, partial = 0, overdue = 0
    monthInvoices.forEach((inv) => {
      if (String(inv.status || '') === 'Cancelled') return
      const money = invoiceMoneyBits(inv)
      billed += money.total
      paid += money.paid
      owed += money.due
      if (money.status === 'Pending') pending += 1
      if (money.status === 'Partial Paid') partial += 1
      if (money.status === 'Overdue') overdue += 1
    })
    return { billed, paid, owed, pending, partial, overdue }
  }, [monthInvoices])

  const filteredInvoices = useMemo(() => {
    return monthInvoices.filter((inv) => {
      const money = invoiceMoneyBits(inv)
      if (payFilter === 'outstanding') return money.due > 0.004 && money.status !== 'Cancelled'
      if (payFilter === 'paid') return money.status === 'Paid'
      if (payFilter === 'pending') return money.status === 'Pending'
      if (payFilter === 'partial') return money.status === 'Partial Paid'
      if (payFilter === 'overdue') return money.status === 'Overdue'
      return true
    }).map((inv) => {
      const money = invoiceMoneyBits(inv)
      return {
        ...inv,
        money,
        ownerDisplay: inv.owner_name || inv.client_name || '—',
        emailDisplay: inv.owner_form_email || inv.client_email || '',
        whenLabel: invoiceWhenLabel(inv),
        dateLabel: inv.created_at
          ? new Date(inv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : '—',
        totalLabel: formatGBP(money.total),
        paidLabel: formatGBP(money.paid),
        dueLabel: formatGBP(money.due),
        statusLabel: money.status,
      }
    })
  }, [monthInvoices, payFilter])

  const oweByClient = useMemo(() => {
    const byClient = new Map()
    invoices.forEach((inv) => {
      const money = invoiceMoneyBits(inv)
      if (money.due <= 0.004) return
      const key = String(inv.user_id || inv.owner_form_email || inv.client_email || inv.id)
      const name = inv.owner_name || inv.client_name || 'Client'
      const email = inv.owner_form_email || inv.client_email || ''
      if (!byClient.has(key)) byClient.set(key, { name, email, count: 0, due: 0 })
      const row = byClient.get(key)
      row.count += 1
      row.due += money.due
    })
    return Array.from(byClient.values())
      .sort((a, b) => b.due - a.due)
      .map((r) => ({ ...r, dueLabel: formatGBP(r.due) }))
  }, [invoices])

  const revenueStats = useMemo(() => {
    let sell = 0, cost = 0
    orders.forEach((o) => {
      sell += parseMoney(o.total ?? o.amount ?? o.price)
      cost += Number.isFinite(Number(o.resolved_cost)) ? Number(o.resolved_cost) : parseMoney(o.cost_price)
    })
    const net = sell - cost
    return [
      {
        title: 'Orders',
        hero: true,
        value: String(orders.length),
        footerSubText: 'Click to show all',
        onClick: () => setRevenueFilter('all'),
        active: revenueFilter === 'all',
      },
      {
        title: 'Sell total',
        value: formatGBP(sell),
        footerSubText: 'Click to filter revenue',
        onClick: () => setRevenueFilter((prev) => (prev === 'sell' ? 'all' : 'sell')),
        active: revenueFilter === 'sell',
      },
      {
        title: 'Total cost',
        value: formatGBP(cost),
        footerSubText: 'Click to filter cost',
        onClick: () => setRevenueFilter((prev) => (prev === 'cost' ? 'all' : 'cost')),
        active: revenueFilter === 'cost',
      },
      {
        title: 'Net profit',
        value: formatGBP(net),
        trendValue: sell > 0 ? `${((net / sell) * 100).toFixed(1)}%` : '0%',
        trendDirection: net >= 0 ? 'up' : 'down',
        footerSubText: 'Click profitable orders',
        onClick: () => setRevenueFilter((prev) => (prev === 'profit' ? 'all' : 'profit')),
        active: revenueFilter === 'profit',
      },
    ]
  }, [orders, revenueFilter])

  const invoiceStatCards = useMemo(() => [
    {
      title: 'Total billed',
      hero: true,
      value: formatGBP(collectionStats.billed),
      footerSubText: (() => {
        const n = monthInvoices.filter((i) => String(i.status || '') !== 'Cancelled').length
        return `${monthLabel} · ${n} invoice${n === 1 ? '' : 's'}`
      })(),
      onClick: () => setPayFilter('all'),
      active: payFilter === 'all',
    },
    {
      title: 'Received (paid)',
      value: formatGBP(collectionStats.paid),
      footerSubText: 'Click to filter paid',
      onClick: () => setPayFilter('paid'),
      active: payFilter === 'paid',
    },
    {
      title: 'Clients still owe',
      value: formatGBP(collectionStats.owed),
      footerSubText: 'Click outstanding',
      onClick: () => setPayFilter('outstanding'),
      active: payFilter === 'outstanding',
    },
    {
      title: 'Pending',
      value: String(collectionStats.pending),
      footerSubText: 'Open invoices',
      onClick: () => setPayFilter('pending'),
      active: payFilter === 'pending',
    },
    {
      title: 'Part paid',
      value: String(collectionStats.partial),
      footerSubText: 'Deposits received',
      onClick: () => setPayFilter('partial'),
      active: payFilter === 'partial',
    },
    {
      title: 'Overdue',
      value: String(collectionStats.overdue),
      footerSubText: 'Past due',
      onClick: () => setPayFilter('overdue'),
      active: payFilter === 'overdue',
    },
  ], [collectionStats, payFilter, monthLabel, monthInvoices])

  const costRows = useMemo(() => orders.map((o) => {
    const sell = parseMoney(o.total ?? o.amount ?? o.price)
    const cost = Number.isFinite(Number(o.resolved_cost)) ? Number(o.resolved_cost) : parseMoney(o.cost_price)
    const profit = Number.isFinite(Number(o.profit)) ? Number(o.profit) : sell - cost
    const source = o.cost_source === 'manual' ? 'Manual' : (o.cost_source === 'catalog' ? 'Catalog' : 'Not set')
    return {
      ...o,
      sell,
      cost,
      profit,
      source,
      sellLabel: formatGBP(sell),
      profitLabel: formatGBP(profit),
      clientDisplay: o.owner_name || o.client_name || 'Customer',
      emailDisplay: o.owner_form_email || o.client_email || '',
    }
  }), [orders])

  const filteredCostRows = useMemo(() => {
    return costRows.filter((r) => {
      if (revenueFilter === 'sell') return r.sell > 0
      if (revenueFilter === 'cost') return r.cost > 0
      if (revenueFilter === 'profit') return r.profit > 0
      return true
    })
  }, [costRows, revenueFilter])

  const profitByCustomer = useMemo(() => {
    const map = new Map()
    filteredCostRows.forEach((o) => {
      const key = String(o.user_id || o.client_email || o.owner_form_email || o.id)
      if (!map.has(key)) {
        map.set(key, {
          name: o.clientDisplay,
          email: o.emailDisplay,
          orders: 0,
          sell: 0,
          cost: 0,
          profit: 0,
        })
      }
      const row = map.get(key)
      row.orders += 1
      row.sell += o.sell
      row.cost += o.cost
      row.profit += o.profit
    })
    return Array.from(map.values())
      .sort((a, b) => b.profit - a.profit)
      .map((r) => ({
        ...r,
        sellLabel: formatGBP(r.sell),
        costLabel: formatGBP(r.cost),
        profitLabel: formatGBP(r.profit),
        marginLabel: `${r.sell > 0 ? ((r.profit / r.sell) * 100).toFixed(1) : '0.0'}%`,
      }))
  }, [filteredCostRows])

  const handleSendInvoice = async (invoice) => {
    if (!invoice?.id || invoice.status === 'Cancelled') return
    setSendingId(invoice.id)
    const toastId = toastProcessing('Sending invoice email…')
    try {
      // Same as app.js: PUT with send_payment_details
      const res = await apiRequest(`/invoices/${invoice.id}`, {
        method: 'PUT',
        body: JSON.stringify({ send_payment_details: true }),
        label: 'Send invoice email',
        silent: true,
      })
      if (res.ok) {
        const data = res.data?.data || res.data || {}
        const to = data.email_to || data.invoice?.owner_form_email || data.invoice?.client_email
        const paid = invoiceMoneyBits(data.invoice || invoice).status === 'Paid'
        toastDone(
          toastId,
          paid ? `Thank you emailed${to ? ` to ${to}` : ''}` : `Invoice emailed${to ? ` to ${to}` : ''}`,
        )
        fetchInvoices()
        if (editInvoice?.id === invoice.id) setEditInvoice(null)
      } else {
        toastFail(toastId, res.reason || 'Failed to send invoice email')
      }
    } finally {
      setSendingId(null)
    }
  }

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return
    setIsDeletingInvoice(true)
    const toastId = toastProcessing('Deleting invoice…')
    try {
      const res = await apiRequest(`/invoices/${invoiceToDelete.id}`, {
        method: 'DELETE',
        label: 'Delete invoice',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Failed to delete invoice')
        return
      }
      toastDone(toastId, res.data?.message || 'Invoice deleted')
      setInvoices((prev) => prev.filter((i) => i.id !== invoiceToDelete.id))
      setInvoiceToDelete(null)
    } finally {
      setIsDeletingInvoice(false)
    }
  }

  const openEdit = (inv) => {
    setEditInvoice(inv)
    const money = invoiceMoneyBits(inv)
    setEditForm({
      status: money.status === 'Partial Paid' ? 'Partial Paid' : (inv.status || 'Pending'),
      payment_timing: ['Advance', 'Deposit'].includes(inv.payment_timing) ? inv.payment_timing : 'After work',
      payment_method: inv.payment_method || 'Credit Card (Stripe)',
      due_date: String(inv.due_date || '').slice(0, 10),
      total: plainAmount(money.total),
      deposit_amount: plainAmount(parseMoney(inv.deposit_amount || money.total * 0.5)),
      amount_paid: plainAmount(money.paid),
    })
  }

  const handleSaveInvoice = async () => {
    if (!editInvoice?.id) return
    setIsSavingInvoice(true)
    const toastId = toastProcessing('Saving invoice…')
    try {
      const payload = {
        status: editForm.status,
        payment_timing: editForm.payment_timing,
        payment_method: editForm.payment_method,
        due_date: editForm.due_date,
        total: editForm.total,
        amount_paid: editForm.amount_paid,
      }
      if (editForm.payment_timing === 'Deposit') {
        payload.deposit_amount = editForm.deposit_amount
      }
      const res = await apiRequest(`/invoices/${editInvoice.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
        label: 'Save invoice',
        silent: true,
      })
      if (res.ok) {
        const saved = res.data?.data?.invoice || {}
        const paid = invoiceMoneyBits(saved).status === 'Paid' || invoiceMoneyBits(saved).due <= 0.004
        toastDone(
          toastId,
          paid
            ? 'Invoice saved. Use Send thank you to email the complete-payment notice.'
            : 'Invoice saved. Use Send to email the company owner.',
        )
        setEditInvoice(null)
        fetchInvoices()
      } else {
        toastFail(toastId, res.reason || 'Failed to save invoice')
      }
    } finally {
      setIsSavingInvoice(false)
    }
  }

  // Saves one order's cost; resolves to the cost the box shows afterwards (the old one if not saved)
  const handleSaveCost = async (orderId, raw) => {
    const current = orders.find((o) => o.id === orderId)
    const currentCost = current
      ? (Number.isFinite(Number(current.resolved_cost)) ? Number(current.resolved_cost) : parseMoney(current.cost_price))
      : 0
    const text = String(raw ?? '').trim()
    const costVal = parseMoney(text)
    if (text !== '' && (!Number.isFinite(Number(text.replace(/[£,\s]/g, ''))) || costVal < 0)) {
      toast.error('Enter a cost of 0 or more, e.g. 25.50')
      return plainAmount(currentCost)
    }
    if (Math.abs(currentCost - costVal) < 0.001) return plainAmount(costVal)
    setSavingCostId(orderId)
    const toastId = toastProcessing('Saving order cost…')
    try {
      const res = await apiRequest(`/orders/${orderId}`, {
        method: 'PUT',
        body: { cost_price: costVal },
        label: 'Order cost',
        silent: true,
      })
      if (res.ok) {
        toastDone(toastId, `Order cost saved: ${formatGBP(costVal)}`)
        fetchOrders()
        return plainAmount(costVal)
      }
      toastFail(toastId, res.reason || 'Failed to save order cost')
      return plainAmount(currentCost)
    } finally {
      setSavingCostId(null)
    }
  }
  // The cost column stays the same between renders (so its boxes keep focus); it calls the latest save
  const saveCostRef = useRef(handleSaveCost)
  useEffect(() => {
    saveCostRef.current = handleSaveCost
  })

  const invoiceColumns = useMemo(() => [
    invoiceCol.accessor('invoice_number', {
      header: 'Invoice #',
      cell: ({ row }) => <span className="font-medium text-sm">{row.getValue('invoice_number')}</span>,
    }),
    invoiceCol.accessor('ownerDisplay', {
      header: 'Owner',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.ownerDisplay}</span>
          <span className="text-sm text-muted-foreground">{row.original.emailDisplay}</span>
        </div>
      ),
    }),
    invoiceCol.accessor('order_number', {
      header: 'Order',
      cell: ({ row }) => <span className="text-sm">{row.getValue('order_number') || '—'}</span>,
    }),
    invoiceCol.accessor('totalLabel', {
      header: 'Total',
      cell: ({ row }) => <span className="font-semibold">{row.getValue('totalLabel')}</span>,
    }),
    invoiceCol.accessor('paidLabel', {
      header: 'Received',
      cell: ({ row }) => <span>{row.getValue('paidLabel')}</span>,
    }),
    invoiceCol.accessor('dueLabel', {
      header: 'Still owed',
      cell: ({ row }) => (
        <span className={`font-bold ${row.original.money.due > 0.004 ? 'text-destructive' : 'text-emerald-600'}`}>
          {row.getValue('dueLabel')}
        </span>
      ),
    }),
    invoiceCol.accessor('whenLabel', {
      header: 'When',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue('whenLabel')}</span>,
    }),
    invoiceCol.accessor('statusLabel', {
      header: 'Status',
      filterFn: (row, _id, filterValue) => !filterValue || row.original.statusLabel === filterValue,
      cell: ({ row }) => (
        <Badge className={statusBadgeClass(row.original.statusLabel)}>{row.original.statusLabel}</Badge>
      ),
    }),
    invoiceCol.accessor('dateLabel', {
      header: 'Date',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue('dateLabel')}</span>,
    }),
    invoiceCol.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const inv = row.original
        const isSending = sendingId === inv.id
        const paid = inv.money.status === 'Paid'
        const canSend = inv.status !== 'Cancelled'
        return (
          // One main action that fits the invoice (unpaid → Send, paid or cancelled → View), the rest in ⋯
          <div className="flex items-center gap-1.5">
            {canSend && !paid ? (
              <Button
                variant="ghost"
                className={GLASS_BUTTON_PRIMARY}
                disabled={isSending}
                onClick={() => handleSendInvoice(inv)}
                title="Email the invoice with its PDF"
              >
                {isSending ? <IconLoader2 className="w-3.5 h-3.5 animate-spin" /> : <IconMail className="w-3.5 h-3.5" />}
                Send
              </Button>
            ) : (
              <Button
                variant="ghost"
                className={GLASS_BUTTON}
                onClick={() => openInvoice(inv.id)}
                title="Open the invoice PDF"
              >
                <IconFileText className="w-3.5 h-3.5" />
                View
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" className={`${GLASS_BUTTON} w-8 px-0 text-muted-foreground hover:text-foreground`} aria-label="More invoice actions" />}
              >
                <IconDots className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => openInvoice(inv.id)}>
                  <IconFileText className="size-4" /> View PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadInvoice(inv.id, inv.invoice_number)}>
                  <IconDownload className="size-4" /> Download PDF
                </DropdownMenuItem>
                {canSend && (
                  <DropdownMenuItem disabled={isSending} onClick={() => handleSendInvoice(inv)}>
                    <IconMail className="size-4" /> {paid ? 'Send thank-you' : 'Send invoice'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => openEdit(inv)}>
                  <IconPencil className="size-4" /> Edit
                </DropdownMenuItem>
                {canDeleteInvoices && inv.order_status === 'Cancelled' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setInvoiceToDelete(inv)}>
                      <IconTrash className="size-4" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    }),
  ], [sendingId, canDeleteInvoices])

  const costColumns = useMemo(() => [
    costCol.accessor('order_number', {
      header: 'Order #',
      cell: ({ row }) => (
        <Badge className="badge-sky rounded-full font-mono">
          {row.original.order_number || `#GB${row.original.id}`}
        </Badge>
      ),
    }),
    costCol.accessor('clientDisplay', {
      header: 'Customer',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.clientDisplay}</span>
          <span className="text-sm text-muted-foreground">{row.original.emailDisplay || '—'}</span>
        </div>
      ),
    }),
    costCol.accessor('service_name', {
      header: 'Product',
      cell: ({ row }) => <ProductCell name={row.original.service_name} />,
    }),
    costCol.accessor('sellLabel', {
      header: 'Sell price',
      cell: ({ row }) => <span className="font-semibold">{row.getValue('sellLabel')}</span>,
    }),
    costCol.display({
      id: 'cost',
      header: 'Cost',
      cell: ({ row }) => (
        <CostCell
          order={row.original}
          saving={savingCostId === row.original.id}
          onSave={(raw) => saveCostRef.current(row.original.id, raw)}
        />
      ),
    }),
    costCol.accessor('profitLabel', {
      header: 'Profit',
      cell: ({ row }) => (
        <span className={`font-bold ${row.original.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
          {row.getValue('profitLabel')}
        </span>
      ),
    }),
    costCol.accessor('source', {
      header: 'Source',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue('source')}</span>,
    }),
  ], [savingCostId])

  const profitColumns = useMemo(() => [
    profitCol.accessor('name', {
      header: 'Customer',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.name}</span>
          <span className="text-sm text-muted-foreground">{row.original.email}</span>
        </div>
      ),
    }),
    profitCol.accessor('orders', { header: 'Orders' }),
    profitCol.accessor('sellLabel', { header: 'Sell total' }),
    profitCol.accessor('costLabel', { header: 'Cost' }),
    profitCol.accessor('profitLabel', {
      header: 'Profit',
      cell: ({ row }) => (
        <span className={`font-bold ${row.original.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
          {row.getValue('profitLabel')}
        </span>
      ),
    }),
    profitCol.accessor('marginLabel', { header: 'Margin' }),
  ], [])

  const oweColumns = useMemo(() => [
    oweCol.accessor('name', {
      header: 'Client',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.name}</span>
          <span className="text-sm text-muted-foreground">{row.original.email}</span>
        </div>
      ),
    }),
    oweCol.accessor('count', { header: 'Open invoices' }),
    oweCol.accessor('dueLabel', {
      header: 'Still owed',
      cell: ({ row }) => <span className="font-bold text-destructive">{row.getValue('dueLabel')}</span>,
    }),
  ], [])

  const invoiceFilterConfig = [
    {
      columnKey: 'statusLabel',
      placeholder: 'Payment status',
      options: [
        { label: 'Pending', value: 'Pending' },
        { label: 'Part paid', value: 'Partial Paid' },
        { label: 'Overdue', value: 'Overdue' },
        { label: 'Paid', value: 'Paid' },
        { label: 'Cancelled', value: 'Cancelled' },
      ],
    },
  ]

  useRefreshOnReturn(() => {
    fetchInvoices()
    if (activeTab === 'revenue') fetchOrders()
  })

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Finance</h2>
          {activeTab !== 'balance' && <p className="text-sm text-muted-foreground mt-0.5">Showing {monthLabel}</p>}
        </div>
        {/* The Balance Sheet tab has its own month and refresh */}
        {activeTab !== 'balance' && <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v || CURRENT_MONTH)}>
            <SelectTrigger className="w-[220px] text-sm">
              <IconCalendarWeek className="h-4 w-4 shrink-0" />
              <SelectValue placeholder="Month">
                {MONTH_OPTIONS.find((m) => m.value === selectedMonth)?.label || 'Month'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="invoices" className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Invoices
          </TabsTrigger>
          <TabsTrigger value="revenue" className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Revenue
          </TabsTrigger>
          {canSeeBalance && (
            <TabsTrigger value="balance" className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Balance Sheet
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {activeTab === 'invoices' && (
        <>
          <SectionCards stats={invoiceStatCards} isLoading={isLoadingInvoices} compact />


          <DataTable
            columns={invoiceColumns}
            hideOnSmallerScreens={['whenLabel']}
            data={filteredInvoices}
            filterConfig={invoiceFilterConfig}
            isLoading={isLoadingInvoices}
          />

          <div className="mt-2">
            <h3 className="text-base font-semibold mb-2">Who still owes you</h3>
            <DataTable
              columns={oweColumns}
              data={oweByClient}
              isLoading={isLoadingInvoices}
            />
          </div>
        </>
      )}

      {activeTab === 'balance' && <BalanceSheet embedded />}

      {activeTab === 'revenue' && (
        <>
          <SectionCards stats={revenueStats} isLoading={isLoadingOrders} compact />

          <p className="text-sm text-muted-foreground">
            Set <strong>Order cost</strong> per customer/order. Profit = Sell price − Cost.
          </p>


          <DataTable
            columns={costColumns}
            data={filteredCostRows}
            isLoading={isLoadingOrders}
          />

          <div className="mt-2">
            <h3 className="text-base font-semibold mb-2">Profit by customer</h3>
            <DataTable
              columns={profitColumns}
              data={profitByCustomer}
              isLoading={isLoadingOrders}
            />
          </div>
        </>
      )}

      {/* Edit invoice — same fields as legacy modal-edit-invoice */}
      <Dialog open={!!editInvoice} onOpenChange={(open) => !open && setEditInvoice(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit invoice</DialogTitle>
            <DialogDescription>
              Pay after work, take the full amount first, or take a deposit (usually 50%) and the rest when the job is done.
            </DialogDescription>
          </DialogHeader>

          {editInvoice && (
            <div className="grid gap-3 py-1">
              <div>
                <div className="text-sm font-extrabold">{editInvoice.invoice_number}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {[editInvoice.owner_name || editInvoice.client_name, editInvoice.owner_form_email || editInvoice.client_email, editInvoice.order_number]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Partial Paid">Partial Paid</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Overdue">Overdue</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>When they pay</Label>
                  <Select
                    value={editForm.payment_timing}
                    onValueChange={(v) => setEditForm((p) => ({ ...p, payment_timing: v }))}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="After work">After work — when the job is done</SelectItem>
                      <SelectItem value="Advance">Pay first — full amount</SelectItem>
                      <SelectItem value="Deposit">Pay first — deposit now</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>Payment method</Label>
                  <Select
                    value={editForm.payment_method}
                    onValueChange={(v) => setEditForm((p) => ({ ...p, payment_method: v }))}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>Due date</Label>
                  <Input
                    type="date"
                    className="w-full"
                    value={editForm.due_date || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, due_date: e.target.value }))}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label>Total (£)</Label>
                  <Input
                    className="w-full"
                    value={editForm.total || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, total: e.target.value }))}
                    inputMode="decimal"
                  />
                </div>

                {editForm.payment_timing === 'Deposit' && (
                  <div className="grid gap-1.5">
                    <Label>Deposit now</Label>
                    <Input
                      className="w-full"
                      value={editForm.deposit_amount || ''}
                      onChange={(e) => setEditForm((p) => ({ ...p, deposit_amount: e.target.value }))}
                      inputMode="decimal"
                    />
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label>Received so far</Label>
                  <Input
                    className="w-full"
                    value={editForm.amount_paid || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, amount_paid: e.target.value }))}
                    inputMode="decimal"
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground m-0">
                GBP uses Tide 32546658 / 04-06-05. PKR uses the UBL IBAN. Save invoice only updates the record.
                Send invoice emails payment details. When paid in full, Send thank you emails a complete-payment notice.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setEditInvoice(null)} disabled={isSavingInvoice}>
              Cancel
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => editInvoice && openInvoice(editInvoice.id)}
              title="Shows the saved invoice; save first to see your changes"
            >
              <IconFileText className="w-4 h-4" />
              View PDF
            </Button>
            <Button
              variant="outline"
              disabled={isSavingInvoice || sendingId === editInvoice?.id}
              onClick={() => editInvoice && handleSendInvoice({ ...editInvoice, status: editForm.status })}
              className="gap-1.5"
            >
              {(sendingId === editInvoice?.id) ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconMail className="w-4 h-4" />}
              {editForm.status === 'Paid' ? 'Send thank you' : 'Send invoice'}
            </Button>
            <Button onClick={handleSaveInvoice} disabled={isSavingInvoice}>
              {isSavingInvoice && <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmation
        isOpen={!!invoiceToDelete}
        onClose={() => !isDeletingInvoice && setInvoiceToDelete(null)}
        onConfirm={confirmDeleteInvoice}
        isLoading={isDeletingInvoice}
        title="Delete invoice?"
        description={
          invoiceToDelete
            ? `Invoice ${invoiceToDelete.invoice_number} for cancelled order ${invoiceToDelete.order_number || ''} will be permanently deleted${
                invoiceToDelete.money?.paid > 0.004 ? `, including the ${formatGBP(invoiceToDelete.money.paid)} recorded as received` : ''
              }. This cannot be undone.`
            : ''
        }
        confirmText="Delete invoice"
      />
    </div>
  )
}
