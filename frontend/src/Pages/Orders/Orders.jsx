import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import { SectionCards } from "../../Layout/StatsCard"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  IconPlus,
  IconFileInvoice,
  IconFolderOpen,
  IconTrash,
  IconDotsVertical,
  IconRefresh,
} from "@tabler/icons-react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { OverflowTooltip } from "@/components/OverflowTooltip"
import { toast } from "sonner"
import { toastUndoableDelete, toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { apiRequest, getApiBase, toastApiEmpty } from "@/lib/api"
import CreateOrderWizard from "./CreateOrderWizard"
import QuickCrmOrder from "./QuickCrmOrder"
import ViewOrder from "./ViewOrder"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { isAdminRole, canViewRevenue } from "@/lib/permissions"

const columnHelper = createColumnHelper()

const PAYMENT_MODES = [
  { value: 'PKR(Bank Transfer)', label: 'PKR' },
  { value: 'GBP(Bank Transfer)', label: 'GBP' },
  { value: 'Website Charge', label: 'Website' },
]

const STATUS_OPTIONS = [
  'Pending Verification',
  'Pending',
  'Processing',
  'In Progress',
  'Completed',
  'Cancelled',
  'Refunded',
]

const DATE_PRESETS = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
]

function formatOrderNumberDisplay(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s === '—') return '—'
  const tail = s.match(/(\d+)\s*$/)
  const digits = tail ? tail[1] : s.replace(/\D/g, '')
  if (!digits) return s
  return `#GB${String(parseInt(digits, 10))}`
}

function truncateWords(text, maxWords = 4) {
  const full = String(text || '').trim()
  if (!full) return { short: '—', full: '—', truncated: false }
  const words = full.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return { short: full, full, truncated: false }
  return { short: `${words.slice(0, maxWords).join(' ')}…`, full, truncated: true }
}

function progressPercent(order) {
  const status = String(order?.status || '')
  const active = Number(order?.line_item_active_count ?? order?.line_item_count ?? 0)
  const done = Number(order?.line_items_completed || 0)
  if (active >= 1) {
    if (status === 'Cancelled' || status === 'Refunded') return 0
    return Math.max(0, Math.min(100, Math.round((100 * done) / Math.max(active, 1))))
  }
  if (status === 'Completed') return 100
  if (status === 'Cancelled' || status === 'Refunded') return 0
  const stored = Number(order?.progress_percent)
  if (Number.isFinite(stored)) return Math.max(0, Math.min(100, stored))
  if (status === 'In Progress') return 50
  if (status === 'Processing') return 25
  if (status === 'Pending Verification') return 10
  return 0
}

function statusTone(order, pct) {
  const status = String(order?.status || 'Pending')
  if (status === 'Completed' || pct >= 100) return 'badge-green'
  if (status === 'Cancelled' || status === 'Refunded') return 'bg-destructive/15 text-destructive'
  if (status === 'In Progress' || status === 'Processing') return 'badge-sky'
  return 'badge-amber'
}

function productTone(name) {
  const n = String(name || '').toLowerCase()
  if (/tide|bank|taptap|tap tap|physical bank|revolut|wise|monzo/.test(n)) return 'badge-green'
  if (/kyc|identity/.test(n)) return 'badge-green'
  if (/registered office|address/.test(n)) return 'badge-purple'
  if (/confirmation|ad01|form/.test(n)) return 'badge-sky'
  return 'badge-sky'
}

function TruncatedTooltip({ text, className }) {
  return <OverflowTooltip text={text} className={className} />
}

function shortenProductName(name) {
  if (!name) return '—'
  const raw = String(name).trim()
  const lower = raw.toLowerCase()

  if (/kyc\s*verification|identity\s*verification/i.test(lower)) return 'KYC'
  if (/taptap(\s*business)?(\s*bank)?|tap\s*tap/i.test(lower)) return 'TapTap'
  if (/personal\s*physical\s*banks?/i.test(lower)) return 'Physical Banks'
  if (/physical\s*banks?/i.test(lower)) return 'Physical Banks'
  if (/tide(\s*business)?(\s*bank)?/i.test(lower)) return 'Tide'
  if (/revolut(\s*business)?(\s*bank)?/i.test(lower)) return 'Revolut'
  if (/wise(\s*business)?(\s*bank)?/i.test(lower)) return 'Wise'
  if (/monzo(\s*business)?(\s*bank)?/i.test(lower)) return 'Monzo'
  if (/company\s*formation(\s*package)?/i.test(lower)) return 'Formation'
  if (/confirmation\s*statement(\s*service)?/i.test(lower)) return 'Confirmation'
  if (/registered\s*office(\s*address)?/i.test(lower)) return 'Reg Office'
  if (/director('s)?\s*service\s*address/i.test(lower)) return 'Service Address'
  if (/ad01(\s*form)?/i.test(lower)) return 'AD01'
  if (/all\s*inclusive/i.test(lower)) return 'All Inclusive'
  if (/annual\s*accounts/i.test(lower)) return 'Accounts'
  if (/corporation\s*tax(\s*return)?/i.test(lower)) return 'Corp Tax'
  if (/vat\s*registration/i.test(lower)) return 'VAT'
  if (/paye\s*registration/i.test(lower)) return 'PAYE'
  if (/dormant(\s*company)?\s*accounts/i.test(lower)) return 'Dormant Acc'
  if (/company\s*dissolution|strike\s*off/i.test(lower)) return 'Dissolution'
  if (/certificate\s*of\s*good\s*standing/i.test(lower)) return 'Good Standing'
  if (/certificate\s*of\s*incorporation/i.test(lower)) return 'Certificate'
  if (/name\s*change/i.test(lower)) return 'Name Change'
  if (/mail\s*forwarding/i.test(lower)) return 'Mail Forwarding'

  // Generic cleanups: remove redundant words like "Service", "Package", "Form", "Verification"
  let cleaned = raw
    .replace(/\b(Package|Service|Services|Form|Verification|Processing|Standard)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || raw
}

function ProductPills({ summary }) {
  const parts = String(summary || '').split(',').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return <span className="text-muted-foreground text-sm">—</span>
  return (
    <div className="flex flex-wrap gap-1 max-w-[220px]">
      {parts.map((name, idx) => {
        const shortName = shortenProductName(name)
        const pill = (
          <Badge key={`${name}-${idx}`} className={`${productTone(name)} text-[10px] font-medium`}>
            <span className="w-1 h-1 rounded-full bg-current mr-1 opacity-60" />
            {shortName}
          </Badge>
        )
        return (
          <Tooltip key={`${name}-${idx}`}>
            <TooltipTrigger className="inline-flex">{pill}</TooltipTrigger>
            <TooltipContent className="max-w-xs break-words">{name}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export default function Orders() {
  const showFinance = canViewRevenue()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [stats, setStats] = useState({ total_orders: 0, pending: 0, in_progress: 0, completed: 0, revenue: 0 })
  const [facets, setFacets] = useState({ products: [], companies: [], customers: [] })
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 1 })

  // Deep link from Customers: /admin/orders?b2b=<customerId> opens the B2B view for that client
  const [clientType, setClientType] = useState(() => (new URLSearchParams(window.location.search).get('b2b') ? 'B2B' : 'All'))
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [b2bClientId, setB2bClientId] = useState(() => new URLSearchParams(window.location.search).get('b2b') || 'all')
  const [savingId, setSavingId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [quickCrmOpen, setQuickCrmOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [viewOrderOpen, setViewOrderOpen] = useState(false)

  const handleOpenOrder = useCallback((orderId) => {
    setSelectedOrderId(orderId)
    setViewOrderOpen(true)
  }, [])

  const fetchOrders = useCallback(async (page = 1) => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25' })
      if (search.trim()) qs.set('search', search.trim())
      if (statusFilter !== 'all') qs.set('status', statusFilter)
      if (productFilter !== 'all') qs.set('product', productFilter)
      if (companyFilter !== 'all') qs.set('company_id', companyFilter)
      if (paymentFilter !== 'all') qs.set('payment_status', paymentFilter)
      if (datePreset !== 'all') qs.set('date_preset', datePreset)
      if (clientType === 'B2B') {
        qs.set('client_type', 'B2B')
        if (b2bClientId !== 'all') qs.set('customer_id', b2bClientId)
      } else if (clientType === 'Customer') {
        qs.set('client_type', 'Customer')
      } else if (clientType === 'Business') {
        qs.set('client_type', 'Business')
      }

      const res = await apiRequest(`/admin/orders?${qs.toString()}`, { label: 'Orders' })
      if (!res.ok) {
        // Fallback to /orders if admin alias fails
        const res2 = await apiRequest(`/orders?${qs.toString()}`, { label: 'Orders' })
        if (!res2.ok) {
          setOrders([])
          setLoadError(res2.reason || res.reason)
          return
        }
        const data = res2.data?.data || res2.data || {}
        applyPayload(data, page)
        return
      }
      const data = res.data?.data || res.data || {}
      applyPayload(data, page)
    } catch (err) {
      setOrders([])
      setLoadError(err?.message || 'Unexpected error')
    } finally {
      setIsLoading(false)
    }
  }, [search, statusFilter, productFilter, companyFilter, paymentFilter, datePreset, clientType, b2bClientId])

  function applyPayload(data, page) {
    const list = data.orders || []
    setOrders(list)
    if (data.stats) setStats(data.stats)
    if (data.facets) setFacets(data.facets)
    if (data.pagination) setPagination(data.pagination)
    else setPagination((p) => ({ ...p, page, total: data.total || list.length }))
    if (list.length === 0) toastApiEmpty('Orders', getApiBase())
  }

  useEffect(() => {
    const t = setTimeout(() => fetchOrders(1), 200)
    return () => clearTimeout(t)
  }, [fetchOrders])

  const b2bCustomers = useMemo(
    () => (facets.customers || []).filter((c) => Number(c.is_b2b) === 1 || String(c.client_type || '').toUpperCase() === 'B2B'),
    [facets.customers]
  )

  const updateOrder = async (orderId, payload) => {
    setSavingId(orderId)
    const toastId = toastProcessing('Updating order…')
    try {
      const res = await apiRequest(`/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
        label: 'Update order',
        silent: true,
      })
      if (res.ok) {
        toastDone(toastId, 'Order updated')
        fetchOrders(pagination.page || 1)
      } else {
        toastFail(toastId, res.reason || 'Failed to update order')
      }
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = (order) => {
    setCancelTarget(null)
    const victim = order
    const snapshot = orders
    setOrders((prev) => prev.filter((o) => o.id !== victim.id))

    toastUndoableDelete({
      message: `Order ${victim.order_number || victim.id} deleted`,
      description: 'Undo available for a few seconds',
      onUndo: () => setOrders(snapshot),
      onCommit: async () => {
        // The admin confirmed in the dialog, so this also removes locked (paid / website) orders
        const res = await apiRequest(`/orders/${victim.id}?force_delete_genuine=1`, {
          method: 'DELETE',
          label: 'Delete order',
          silent: true,
        })
        if (!res.ok) throw new Error(res.reason || 'Failed to delete order')
        fetchOrders(pagination.page || 1)
      },
    })
  }

  const statCards = useMemo(() => [
    { title: 'Total Orders', value: String(stats.total_orders ?? 0), footerSubText: 'Matching filters' },
    { title: 'Pending', value: String(stats.pending ?? 0), footerSubText: 'Pending / verification' },
    { title: 'In Progress', value: String(stats.in_progress ?? 0), footerSubText: 'Processing + in progress' },
    { title: 'Completed', value: String(stats.completed ?? 0), footerSubText: 'Finished orders' },
    ...(showFinance ? [{
      title: 'Total Revenue',
      value: `£${Number(stats.revenue || 0).toFixed(2)}`,
      footerSubText: 'Excluding cancelled',
    }] : []),
  ], [stats, showFinance])

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    }),
    columnHelper.accessor('order_number', {
      header: 'Order #',
      cell: ({ row }) => (
        <Badge
          className="badge-sky rounded-full font-mono cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => handleOpenOrder(row.original.id)}
        >
          {formatOrderNumberDisplay(row.original.order_number)}
        </Badge>
      ),
    }),
    columnHelper.accessor('created_at', {
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.created_at
            ? new Date(row.original.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
            : '—'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'owner',
      header: 'Owner',
      cell: ({ row }) => {
        const o = row.original
        const name = o.owner_name || o.client_name || '—'
        const email = o.owner_form_email || o.client_email || '—'
        return (
          <div
            className="flex flex-col max-w-[160px] min-w-0 cursor-pointer hover:opacity-80"
            onClick={() => handleOpenOrder(o.id)}
          >
            <TruncatedTooltip text={name} className="block max-w-full truncate text-left font-medium text-sm cursor-pointer" />
            <TruncatedTooltip text={email} className="block max-w-full truncate text-left text-sm text-muted-foreground cursor-pointer" />
          </div>
        )
      },
    }),
    columnHelper.accessor('company_name', {
      header: 'Company',
      cell: ({ row }) => {
        const name = row.getValue('company_name') || '—'
        return (
          <TruncatedTooltip
            text={name}
            className="block max-w-[140px] truncate text-left text-sm cursor-default"
          />
        )
      },
    }),
    columnHelper.display({
      id: 'product',
      header: 'Product',
      cell: ({ row }) => (
        <ProductPills summary={row.original.products_summary || row.original.service_name} />
      ),
    }),
    // Price and payment are finance details: admins only (old portal hid them from managers and staff)
    ...(showFinance ? [columnHelper.display({
      id: 'price',
      header: 'Price',
      cell: ({ row }) => {
        const o = row.original
        const totalNum = Number(o.total || 0)
        return (
          <span className="text-sm font-semibold tabular-nums">
            £{totalNum.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )
      },
    }),
    columnHelper.display({
      id: 'payment',
      header: 'Payment',
      cell: ({ row }) => {
        const o = row.original
        const current = o.payment_mode || ''
        return (
          <Select
            value={current || 'none'}
            onValueChange={(val) => updateOrder(o.id, { payment_mode: val === 'none' ? null : val })}
            disabled={savingId === o.id}
          >
            <SelectTrigger className="h-7 w-[88px] text-sm">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent className="overflow-hidden p-0">
              <SelectGroup className="p-1">
                <SelectItem value="none">Select</SelectItem>
                {PAYMENT_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )
      },
    })] : []),
    columnHelper.display({
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const o = row.original
        const pct = progressPercent(o)
        return (
          <Tooltip>
            <TooltipTrigger className="inline-flex">
              <Badge className={`${statusTone(o, pct)} tabular-nums cursor-pointer`} onClick={() => handleOpenOrder(o.id)}>
                {pct}%
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{o.status || 'Pending'} · {pct}%</TooltipContent>
          </Tooltip>
        )
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Action',
      cell: ({ row }) => {
        const o = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Order actions" />}
            >
              <IconDotsVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenOrder(o.id)}>
                Open order
              </DropdownMenuItem>
              {isAdminRole() && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setCancelTarget(o)}
                >
                  Delete order
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ], [savingId, handleOpenOrder, showFinance])

  const tableFilterConfig = useMemo(() => [
    {
      key: 'company',
      placeholder: 'Company',
      allLabel: 'All Companies',
      value: companyFilter,
      onValueChange: setCompanyFilter,
      options: (facets.companies || []).map((c) => ({ label: c.name, value: String(c.id) })),
    },
    {
      key: 'status',
      placeholder: 'Status',
      allLabel: 'All Statuses',
      value: statusFilter,
      onValueChange: setStatusFilter,
      options: STATUS_OPTIONS.map((s) => ({ label: s, value: s })),
    },
    {
      key: 'product',
      placeholder: 'Product',
      allLabel: 'All Products',
      value: productFilter,
      onValueChange: setProductFilter,
      options: (facets.products || []).map((p) => ({ label: p, value: p })),
    },
    {
      key: 'payment',
      placeholder: 'Payment',
      allLabel: 'All Payments',
      value: paymentFilter,
      onValueChange: setPaymentFilter,
      options: [
        { label: 'Paid', value: 'Paid' },
        { label: 'Pending', value: 'Pending' },
        { label: 'Overdue', value: 'Overdue' },
        { label: 'Unpaid', value: 'Unpaid' },
      ],
    },
    {
      key: 'date',
      placeholder: 'Date',
      allLabel: 'All Dates',
      value: datePreset,
      onValueChange: setDatePreset,
      options: DATE_PRESETS.filter((d) => d.value !== 'all').map((d) => ({ label: d.label, value: d.value })),
    },
  ], [facets.companies, facets.products, companyFilter, statusFilter, productFilter, paymentFilter, datePreset])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setProductFilter('all')
    setCompanyFilter('all')
    setPaymentFilter('all')
    setDatePreset('all')
    setB2bClientId('all')
  }

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Orders Manager</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => fetchOrders(pagination.page || 1)}>
            <IconRefresh className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus className="mr-2 h-4 w-4" />
            Create Order
          </Button>
          <Button variant="outline" onClick={() => setQuickCrmOpen(true)}>
            <IconFileInvoice className="mr-2 h-4 w-4" />
            Quick CRM Order
          </Button>
        </div>
      </div>

      <SectionCards stats={statCards} isLoading={isLoading} compact />

      <Tabs
        value={['All', 'Customer', 'Business'].includes(clientType) ? clientType : 'B2B'}
        onValueChange={(v) => {
          setClientType(v)
          setB2bClientId('all')
        }}
      >
        <TabsList>
          <TabsTrigger value="All" className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            All Orders
          </TabsTrigger>
          <TabsTrigger value="Customer" className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Individual
          </TabsTrigger>
          <TabsTrigger value="Business" className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Business
          </TabsTrigger>
          <TabsTrigger value="B2B" className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            B2B Clients
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {clientType === 'B2B' && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="text-sm font-semibold">Select a B2B client</div>
          <p className="text-sm text-muted-foreground">Open a B2B account first, then their orders appear below.</p>
          <Select value={b2bClientId} onValueChange={setB2bClientId}>
            <SelectTrigger className="max-w-md h-8 text-sm">
              <SelectValue placeholder="Choose B2B client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All B2B clients</SelectItem>
              {b2bCustomers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.full_name || c.email} {c.b2b_id ? `(${c.b2b_id})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <DataTable
        columns={columns}
        data={orders}
        filterConfig={tableFilterConfig}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search orders…"
        onClearFilters={clearFilters}
      />

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {pagination.total || 0} orders · page {pagination.page || 1} of {pagination.total_pages || 1}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={(pagination.page || 1) <= 1 || isLoading}
            onClick={() => fetchOrders((pagination.page || 1) - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(pagination.page || 1) >= (pagination.total_pages || 1) || isLoading}
            onClick={() => fetchOrders((pagination.page || 1) + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <CreateOrderWizard
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => fetchOrders(1)}
      />
      <QuickCrmOrder
        open={quickCrmOpen}
        onClose={() => setQuickCrmOpen(false)}
        onCreated={() => fetchOrders(1)}
      />
      <ViewOrder
        orderId={selectedOrderId}
        isOpen={viewOrderOpen}
        onClose={() => {
          setViewOrderOpen(false)
          setSelectedOrderId(null)
        }}
        onOrderUpdated={() => fetchOrders(pagination.page || 1)}
      />
      <DeleteConfirmation
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && handleDelete(cancelTarget)}
        title="Delete order"
        description={`Permanently delete order ${cancelTarget?.order_number || cancelTarget?.id || ''} and its documents? You can undo for a few seconds.`}
        confirmText="Delete order"
        cancelText="Keep order"
      />
    </div>
  )
}
