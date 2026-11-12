import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
  IconNote,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react"
import { formatGBP } from "@/lib/money"
import { canCancelOrder, cancelOrder, cancelOrderMessage } from "@/lib/orders"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { OverflowTooltip } from "@/components/OverflowTooltip"
import { toast } from "sonner"
import { toastUndoableDelete } from "@/lib/toastActions"
import { apiRequest, getApiBase, toastApiEmpty } from "@/lib/api"
import CreateOrderWizard from "./CreateOrderWizard"
import QuickCrmOrder from "./QuickCrmOrder"
import ViewOrder from "./ViewOrder"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { isAdminRole, canViewRevenue, getRole } from "@/lib/permissions"
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn"

const columnHelper = createColumnHelper()

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed', 'Cancelled']

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
  // Only bare website numbers (#15312) get the #GB letters; GB-OCT-2326001 and #GB15353 show as stored
  if (!/^#?\d+$/.test(s)) return s
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
  // The order status decides first: a Completed order is 100% even if its products were not ticked off
  if (status === 'Completed') return 100
  if (status === 'Cancelled' || status === 'Refunded') return 0
  const active = Number(order?.line_item_active_count ?? order?.line_item_count ?? 0)
  const done = Number(order?.line_items_completed || 0)
  if (active >= 1 && done > 0) {
    return Math.max(0, Math.min(100, Math.round((100 * done) / Math.max(active, 1))))
  }
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

// Each product is a soft tinted chip in its own colour (no dot), the same everywhere it shows
const TINT = {
  blue: 'bg-blue-500/12 text-blue-700 dark:text-blue-300',
  teal: 'bg-teal-500/12 text-teal-700 dark:text-teal-300',
  lime: 'bg-lime-500/15 text-lime-800 dark:text-lime-300',
  pink: 'bg-pink-500/12 text-pink-700 dark:text-pink-300',
  orange: 'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  slate: 'bg-slate-500/12 text-slate-700 dark:text-slate-300',
  emerald: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  cyan: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300',
  violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  indigo: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  grey: 'bg-muted text-muted-foreground',
}

function productTone(name) {
  const n = String(name || '').toLowerCase()
  if (/tide/.test(n)) return TINT.blue
  if (/taptap|tap tap/.test(n)) return TINT.teal
  if (/wise/.test(n)) return TINT.lime
  if (/anna/.test(n)) return TINT.pink
  if (/monzo/.test(n)) return TINT.orange
  if (/revolut/.test(n)) return TINT.slate
  if (/bank|money/.test(n)) return TINT.emerald
  if (/kyc|identity/.test(n)) return TINT.cyan
  if (/registered office|address|mail forwarding/.test(n)) return TINT.violet
  if (/formation|incorporation|certificate|name change/.test(n)) return TINT.indigo
  if (/confirmation|accounts|tax|vat|paye|ad01|dissolution|strike/.test(n)) return TINT.amber
  return TINT.grey
}

const PRODUCT_CHIP = 'inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap'

// Order statuses as a soft pill with a dot, the same height as the product chips
const STATUS_PILL = 'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tabular-nums whitespace-nowrap border-0'

// Column headings: small and quiet, so the rows carry the weight
function head(label) {
  return <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
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
  // Two chips at most; the rest are one "+N" chip that lists them on hover
  const shown = parts.slice(0, 2)
  const rest = parts.slice(2)
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-w-[240px]">
      {shown.map((name, idx) => (
        <Tooltip key={`${name}-${idx}`}>
          <TooltipTrigger className="inline-flex">
            <span className={`${PRODUCT_CHIP} ${productTone(name)}`}>
              {shortenProductName(name)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs break-words">{name}</TooltipContent>
        </Tooltip>
      ))}
      {rest.length ? (
        <Tooltip>
          <TooltipTrigger className="inline-flex">
            <span className={`${PRODUCT_CHIP} ${TINT.grey}`}>+{rest.length}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line break-words">{rest.join('\n')}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

export default function Orders() {
  const showFinance = canViewRevenue()
  // Team members (STAFF) only get their own orders from the API, so "Added by" is for admins / managers
  const showAddedBy = getRole() !== 'STAFF'
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
  // A stat card's group of statuses (pending / in_progress / completed); the Status dropdown replaces it
  const [statusGroup, setStatusGroup] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [addedByFilter, setAddedByFilter] = useState('all')
  const [b2bClientId, setB2bClientId] = useState(() => new URLSearchParams(window.location.search).get('b2b') || 'all')
  const [cancelTarget, setCancelTarget] = useState(null)
  // "Cancel order" (order and its invoice in one step), separate from the admin's Delete
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [quickCrmOpen, setQuickCrmOpen] = useState(false)
  // Deep link from Performance: /admin/orders?open=<orderId> opens that order
  const [selectedOrderId, setSelectedOrderId] = useState(
    () => Number(new URLSearchParams(window.location.search).get('open')) || null,
  )
  const [viewOrderOpen, setViewOrderOpen] = useState(() => Boolean(selectedOrderId))

  const handleOpenOrder = useCallback((orderId) => {
    setSelectedOrderId(orderId)
    setViewOrderOpen(true)
  }, [])

  // No status picked: the list is split like an inbox, open orders (Pending / In Progress) on top
  // and everything else below, each section with its own pages
  const inboxMode = statusFilter === 'all' && statusGroup === 'all'
  const [sectionPaging, setSectionPaging] = useState({
    open: { page: 1, limit: 25, total: 0, total_pages: 1 },
    closed: { page: 1, limit: 25, total: 0, total_pages: 1 },
  })
  const sectionPagesRef = useRef({ open: 1, closed: 1 })
  const pageRef = useRef(1)

  const buildOrderQuery = useCallback((page, section) => {
    const qs = new URLSearchParams({ page: String(page), limit: '25' })
    if (search.trim()) qs.set('search', search.trim())
    if (section) qs.set('status_group', section)
    else if (statusFilter !== 'all') qs.set('status', statusFilter)
    else if (statusGroup !== 'all') qs.set('status_group', statusGroup)
    if (productFilter !== 'all') qs.set('product', productFilter)
    if (companyFilter !== 'all') qs.set('company_id', companyFilter)
    if (paymentFilter !== 'all') qs.set('payment_status', paymentFilter)
    if (datePreset !== 'all') qs.set('date_preset', datePreset)
    if (addedByFilter !== 'all') qs.set('created_by', addedByFilter)
    if (clientType === 'B2B') {
      qs.set('client_type', 'B2B')
      if (b2bClientId !== 'all') qs.set('customer_id', b2bClientId)
    } else if (clientType === 'Customer') {
      qs.set('client_type', 'Customer')
    } else if (clientType === 'Business') {
      qs.set('client_type', 'Business')
    }
    return qs
  }, [search, statusFilter, statusGroup, productFilter, companyFilter, paymentFilter, datePreset, addedByFilter, clientType, b2bClientId])

  // One page of orders (admin list, with /orders as the fallback); throws the reason when both fail
  const loadOrderPage = useCallback(async (qs) => {
    const res = await apiRequest(`/admin/orders?${qs.toString()}`, { label: 'Orders' })
    if (res.ok) return res.data?.data || res.data || {}
    const res2 = await apiRequest(`/orders?${qs.toString()}`, { label: 'Orders' })
    if (res2.ok) return res2.data?.data || res2.data || {}
    throw new Error(res2.reason || res.reason || 'Could not load orders')
  }, [])

  const applySections = useCallback((openData, closedData) => {
    const tag = (list, section) => (list || []).map((o) => ({ ...o, __section: section }))
    const list = [...tag(openData.orders, 'open'), ...tag(closedData.orders, 'closed')]
    setOrders(list)
    if (openData.stats) setStats(openData.stats)
    if (openData.facets) setFacets(openData.facets)
    setSectionPaging((prev) => ({
      open: openData.pagination || prev.open,
      closed: closedData.pagination || prev.closed,
    }))
    return list
  }, [])

  // Turns one section's page (the other section stays where it is)
  const fetchSectionPage = useCallback(async (section, page) => {
    sectionPagesRef.current = { ...sectionPagesRef.current, [section]: page }
    try {
      const pages = sectionPagesRef.current
      const [openData, closedData] = await Promise.all(
        ['open', 'closed'].map((key) => loadOrderPage(buildOrderQuery(pages[key], key)))
      )
      applySections(openData, closedData)
    } catch (err) {
      toast.error(err?.message || 'Could not load orders')
    }
  }, [buildOrderQuery, loadOrderPage, applySections])

  // page = 1 starts again from the first page; page = null reloads the page(s) on screen
  const fetchOrders = useCallback(async (page = 1) => {
    setIsLoading(true)
    setLoadError(null)
    try {
      if (inboxMode) {
        if (page != null) sectionPagesRef.current = { open: page, closed: page }
        const pages = sectionPagesRef.current
        const [openData, closedData] = await Promise.all(
          ['open', 'closed'].map((key) => loadOrderPage(buildOrderQuery(pages[key], key)))
        )
        const list = applySections(openData, closedData)
        if (list.length === 0) toastApiEmpty('Orders', getApiBase())
        return
      }
      const currentPage = page ?? pageRef.current
      pageRef.current = currentPage
      const data = await loadOrderPage(buildOrderQuery(currentPage, null))
      applyPayload(data, currentPage)
    } catch (err) {
      setOrders([])
      setLoadError(err?.message || 'Unexpected error')
    } finally {
      setIsLoading(false)
    }
  }, [inboxMode, buildOrderQuery, loadOrderPage, applySections])
  useRefreshOnReturn(() => fetchOrders(null))

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
        fetchOrders(null)
      },
    })
  }

  // Clicking a card shows its orders (Total = every status); the Status dropdown is cleared
  const pickGroup = useCallback((group) => {
    setStatusFilter('all')
    setStatusGroup(group)
  }, [])

  const statCards = useMemo(() => {
    const current = statusFilter === 'all' ? statusGroup : null
    return [
      { title: 'Total Orders', hero: true, value: String(stats.total_orders ?? 0), group: 'all' },
      { title: 'Pending', value: String(stats.pending ?? 0), group: 'pending' },
      { title: 'In Progress', value: String(stats.in_progress ?? 0), group: 'in_progress' },
      { title: 'Completed', value: String(stats.completed ?? 0), group: 'completed' },
    ].map(({ group, ...card }) => ({ ...card, onClick: () => pickGroup(group), active: current === group }))
  }, [stats, statusFilter, statusGroup, pickGroup])

  // Inbox sections: "1–25 of 80" and page arrows on the right of each heading, like Gmail
  const orderSections = useMemo(() => {
    const pager = (key) => {
      const p = sectionPaging[key] || {}
      const page = p.page || 1
      const limit = p.limit || 25
      const total = p.total || 0
      const totalPages = p.total_pages || 1
      const from = total ? (page - 1) * limit + 1 : 0
      const to = Math.min(page * limit, total)
      return (
        <>
          <span className="tabular-nums">{total ? `${from}–${to} of ${total}` : '0'}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Newer orders"
            disabled={page <= 1}
            onClick={() => fetchSectionPage(key, page - 1)}
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Older orders"
            disabled={page >= totalPages}
            onClick={() => fetchSectionPage(key, page + 1)}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </>
      )
    }
    return [
      { key: 'open', title: 'Pending & In Progress', extra: pager('open') },
      { key: 'closed', title: 'Completed', extra: pager('closed') },
    ]
  }, [sectionPaging, fetchSectionPage])

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
      header: () => head('Order #'),
      meta: { label: 'Order #' },
      cell: ({ row }) => (
        <button
          type="button"
          className="inline-flex h-6 cursor-pointer items-center whitespace-nowrap rounded-md bg-sky-500/10 px-2 text-xs font-semibold tabular-nums tracking-wide text-sky-700 transition-colors hover:bg-sky-500/20 dark:text-sky-300"
          onClick={() => handleOpenOrder(row.original.id)}
        >
          {formatOrderNumberDisplay(row.original.order_number)}
        </button>
      ),
    }),
    columnHelper.accessor('created_at', {
      header: () => head('Date'),
      meta: { label: 'Date' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
          {row.original.created_at
            ? new Date(row.original.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
            : '—'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'owner',
      header: () => head('Owner'),
      meta: { label: 'Owner' },
      cell: ({ row }) => {
        const o = row.original
        const name = o.owner_name || o.client_name || '—'
        const email = o.owner_form_email || o.client_email || '—'
        return (
          <div
            className="flex flex-col max-w-[220px] min-w-0 cursor-pointer hover:opacity-80"
            onClick={() => handleOpenOrder(o.id)}
          >
            {/* Owner in bold; a smaller email so the whole address fits */}
            <TruncatedTooltip text={name} className="block max-w-full truncate text-left font-medium text-sm cursor-pointer" />
            <TruncatedTooltip text={email} className="block max-w-full truncate text-left text-xs text-muted-foreground cursor-pointer" />
          </div>
        )
      },
    }),
    // Which team member added the order (admins and managers; team members only see their own orders)
    ...(showAddedBy ? [columnHelper.display({
      id: 'added_by',
      header: () => head('Added by'),
      meta: { label: 'Added by' },
      cell: ({ row }) => {
        const o = row.original
        if (o.created_by_name) {
          return (
            <TruncatedTooltip
              text={o.created_by_name}
              className="block max-w-[120px] truncate text-left text-sm text-foreground/80 cursor-default"
            />
          )
        }
        // Not added by the team: the website, or a B2B customer in their own portal
        const b2bPortal = !Number(o.from_website) && (Number(o.is_b2b) === 1 || o.client_type === 'B2B')
        return (
          <span className="text-sm text-muted-foreground">
            {Number(o.from_website) ? 'Website' : b2bPortal ? 'B2B' : '—'}
          </span>
        )
      },
    })] : []),
    columnHelper.accessor('company_name', {
      header: () => head('Company'),
      meta: { label: 'Company' },
      cell: ({ row }) => {
        const name = row.getValue('company_name') || '—'
        // Not registered yet: the desired name from the order form, marked as such
        const desired = row.original.company_name && !row.original.company_registered
        return (
          <div className="flex min-w-0 flex-col">
            {/* Small and bold, up to two lines, so the whole name fits the column */}
            <span
              title={name}
              className={`line-clamp-2 max-w-[220px] break-words text-left text-xs font-semibold leading-snug cursor-default${desired ? ' italic text-foreground/80' : ''}`}
            >
              {name}
            </span>
            {desired ? (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-amber-600 dark:text-amber-400">
                <span className="size-1 rounded-full bg-current" />
                Desired name
              </span>
            ) : null}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: 'product',
      header: () => head('Product'),
      meta: { label: 'Product' },
      cell: ({ row }) => (
        <ProductPills summary={row.original.products_summary || row.original.service_name} />
      ),
    }),
    // Price and payment are finance details: admins only (old portal hid them from managers and staff)
    ...(showFinance ? [columnHelper.display({
      id: 'price',
      header: () => head('Price'),
      meta: { label: 'Price', headClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const o = row.original
        const totalNum = Number(o.total || 0)
        return (
          <span className="text-sm font-semibold tabular-nums">
            {formatGBP(totalNum)}
          </span>
        )
      },
    })] : []),
    columnHelper.display({
      id: 'status',
      header: () => head('Status'),
      meta: { label: 'Status', headClassName: 'pl-6', cellClassName: 'pl-6' },
      cell: ({ row }) => {
        const o = row.original
        const pct = progressPercent(o)
        const notes = String(o.notes || '').trim()
        const badge = (
          <Badge className={`${statusTone(o, pct)} ${STATUS_PILL} cursor-pointer`} onClick={() => handleOpenOrder(o.id)}>
            <span className="size-1.5 shrink-0 rounded-full bg-current" />
            {o.status || 'Pending'}
            {o.status !== 'Completed' && o.status !== 'Cancelled' && o.status !== 'Refunded' ? ` · ${pct}%` : ''}
            {/* A note icon when the order has internal notes: hover to read them */}
            {notes ? <IconNote className="ml-0.5 size-3 opacity-70" aria-label="Has internal notes" /> : null}
          </Badge>
        )
        // Hovering shows just the internal notes, in the same plain bubble as the product names
        if (!notes) return badge
        return (
          <Tooltip>
            <TooltipTrigger className="inline-flex">{badge}</TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">{notes}</TooltipContent>
          </Tooltip>
        )
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <span className="sr-only">Action</span>,
      meta: { label: 'Action', headClassName: 'w-12', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const o = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Order actions" />}
            >
              <IconDotsVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenOrder(o.id)}>
                Open order
              </DropdownMenuItem>
              {canCancelOrder(o) && (
                <DropdownMenuItem variant="destructive" onClick={() => setCancelOrderTarget(o)}>
                  Cancel order
                </DropdownMenuItem>
              )}
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
  ], [handleOpenOrder, showFinance, showAddedBy])

  // Phones: one card per order (tap to open) instead of the wide table
  const renderOrderCard = useCallback((o) => {
    const pct = progressPercent(o)
    const open = o.status !== 'Completed' && o.status !== 'Cancelled' && o.status !== 'Refunded'
    const b2bPortal = !Number(o.from_website) && (Number(o.is_b2b) === 1 || o.client_type === 'B2B')
    const addedBy = o.created_by_name || (Number(o.from_website) ? 'Website' : b2bPortal ? 'B2B' : '')
    return (
      <button
        type="button"
        onClick={() => handleOpenOrder(o.id)}
        className="w-full rounded-xl border bg-card p-3 text-left shadow-xs transition-colors active:bg-muted/50"
      >
        <div className="flex items-center justify-between gap-2">
          <Badge className="badge-sky rounded-md font-semibold tabular-nums tracking-wide">{formatOrderNumberDisplay(o.order_number)}</Badge>
          <Badge className={`${statusTone(o, pct)} ${STATUS_PILL}`}>
            <span className="size-1.5 shrink-0 rounded-full bg-current" />
            {o.status || 'Pending'}{open ? ` · ${pct}%` : ''}
          </Badge>
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-sm font-semibold">{o.owner_name || o.client_name || '—'}</p>
          <p className="truncate text-xs text-muted-foreground">{o.owner_form_email || o.client_email || '—'}</p>
          {o.company_name ? (
            <p className="mt-1 truncate text-sm">
              {o.company_registered ? o.company_name : <span className="italic">{o.company_name}</span>}
              {!o.company_registered ? <Badge className="badge-amber ml-1.5 rounded-full text-[10px]">Desired name</Badge> : null}
            </p>
          ) : null}
          {/* Phones cannot hover: the internal notes show here, two lines at most */}
          {String(o.notes || '').trim() ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
              <IconNote className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-2 whitespace-pre-wrap break-words">{o.notes}</span>
            </p>
          ) : null}
        </div>
        <div className="mt-2">
          <ProductPills summary={o.products_summary || o.service_name} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
          <span>
            {o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
            {showAddedBy && addedBy ? ` · ${addedBy}` : ''}
          </span>
          {showFinance ? (
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatGBP(o.total)}
            </span>
          ) : null}
        </div>
      </button>
    )
  }, [handleOpenOrder, showFinance, showAddedBy])

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
      onValueChange: (value) => {
        setStatusFilter(value)
        setStatusGroup('all')
      },
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
    ...(showAddedBy ? [{
      key: 'added_by',
      placeholder: 'Added by',
      allLabel: 'Anyone',
      value: addedByFilter,
      onValueChange: setAddedByFilter,
      options: [
        ...(facets.added_by || []).map((m) => ({ label: m.full_name || `#${m.id}`, value: String(m.id) })),
        { label: 'B2B customer', value: 'b2b' },
        { label: 'Website / not recorded', value: 'website' },
      ],
    }] : []),
  ], [facets.companies, facets.products, facets.added_by, companyFilter, statusFilter, productFilter, paymentFilter,
      datePreset, addedByFilter, showAddedBy])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setStatusGroup('all')
    setProductFilter('all')
    setCompanyFilter('all')
    setPaymentFilter('all')
    setDatePreset('all')
    setAddedByFilter('all')
    setB2bClientId('all')
  }

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Orders Manager</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
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
        {/* Scrolls sideways on phones instead of cutting the last tab off */}
        <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            <SelectTrigger className="max-w-md text-sm">
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
        renderMobileCard={renderOrderCard}
        sections={inboxMode ? orderSections : undefined}
        sectionOf={(o) => o.__section}
      />

      {!inboxMode && (
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
      )}

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
        onOrderUpdated={() => fetchOrders(null)}
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
      <DeleteConfirmation
        isOpen={Boolean(cancelOrderTarget)}
        onClose={() => setCancelOrderTarget(null)}
        onConfirm={async () => {
          const target = cancelOrderTarget
          setCancelOrderTarget(null)
          if (target && (await cancelOrder(target))) fetchOrders(null)
        }}
        title="Cancel order"
        description={cancelOrderMessage(cancelOrderTarget)}
        confirmText="Yes, cancel"
        cancelText="Keep order"
      />
    </div>
  )
}
