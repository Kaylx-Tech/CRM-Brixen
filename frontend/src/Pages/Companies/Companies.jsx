import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  IconUpload,
  IconBuildingPlus,
  IconSearch,
  IconRefresh,
  IconTrash,
  IconAlertTriangle,
  IconLoader2,
  IconSend,
  IconCheck,
  IconCalendarDue,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react'

// Companies per page (dropdown under the grid); skeleton cards while loading
const PAGE_SIZES = [25, 50, 75, 100]
const SKELETON_COUNT = 9

// Not registered yet: no real Companies House number (REG- / PENDING placeholder), whatever its status says
const isNotRegistered = (c) => c.isRegistered === false || c.status === 'Pending' || c.status === 'Draft'

// Month filter: "2026-10" from the incorporation date (2026-10-14, 14/10/2026 or 14 Oct 2026)
const ALL_MONTHS = 'all'
function incorporationMonth(value) {
  const text = String(value || '').trim()
  let m = text.match(/^(\d{4})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  m = text.match(/^\d{1,2}[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`
  const parsed = text ? new Date(text) : null
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
  }
  return null
}
// "2026-10-14" from the same formats, for sorting newest first
function incorporationDay(value) {
  const text = String(value || '').trim()
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const parsed = text ? new Date(text) : null
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  }
  return null
}
// "Nov 2026" for the card's month tag
const shortMonthLabel = (key) => {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}
const monthLabel = (key) => {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
import { SectionCards } from '../../Layout/StatsCard'
import CompanyCard from './CompanyCard'
import AddCompany from './AddCompany'
import ImportWebfilingModal from './ImportWebfilingModal'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { toastUndoableDelete } from '@/lib/toastActions'
import { Card, CardContent } from '@/components/ui/card'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { isAdminRole, isManagerOrAbove } from '@/lib/permissions'
import { needsAttention } from './attention'
import OfferDialog from './OfferDialog'
import PendingCheckDialog from './PendingCheckDialog'
import { m, spring } from '@/lib/motion'
import { apiRequest, getApiBase, toastApiEmpty } from '@/lib/api'
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn"

const Companies = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isWebfilingModalOpen, setIsWebfilingModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [companies, setCompanies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [pageOpenedAt] = useState(() => Date.now())
  const [isBackfilling, setIsBackfilling] = useState(false)

  const backfillFormations = async () => {
    setIsBackfilling(true)
    try {
      const res = await apiRequest('/admin/companies/backfill-formations', { method: 'POST', label: 'Formation orders', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'Could not check the formation orders')
        return
      }
      toast.success(res.data?.message || 'Formation orders checked')
      if ((res.data?.data?.created || []).length) fetchCompanies()
    } finally {
      setIsBackfilling(false)
    }
  }

  // Selection & Bulk delete state
  const [selectedIds, setSelectedIds] = useState([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [singleDeleteId, setSingleDeleteId] = useState(null)

  const fetchCompanies = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest('/admin/companies?limit=500', { label: 'Companies' })
      if (!res.ok) {
        setCompanies([])
        setLoadError(res.reason)
        return
      }
      const data = res.data || {}
      const rawList =
        data.companies ||
        data.data?.companies ||
        (Array.isArray(data.data) ? data.data : null) ||
        (Array.isArray(data) ? data : [])
      if (Array.isArray(rawList)) {
        setCompanies(
          rawList.map((c) => ({
            id: c.id,
            name: c.company_name || c.name || 'Unnamed Company',
            number: c.company_number || c.number || '#00000000',
            director: c.director_name || c.director || '',
            address: c.registered_office_address || c.reg_office || c.address || 'United Kingdom',
            status: c.status || 'Active',
            incDate: c.incorporation_date || c.inc_date || null,
            countryFlag: '🇬🇧',
            countryName: 'UK',
            deadlineText: c.deadlineText || (c.accounts_next_due ? `Accounts due: ${c.accounts_next_due}` : 'No upcoming deadlines'),
            isRegistered: c.is_registered !== false,
            attention: Array.isArray(c.attention) ? c.attention : [],
            is_genuine: c.is_genuine,
            data_locked: c.data_locked,
            raw: c,
          }))
        )
        if (rawList.length === 0) toastApiEmpty('Companies', getApiBase())
        return
      }
      setCompanies([])
      setLoadError('API returned an unexpected response shape (no companies list).')
      toast.error('Companies failed to load', {
        description: 'API returned an unexpected response shape (no companies list).',
        duration: 8000,
      })
    } catch (err) {
      console.error('Failed to load companies:', err)
      setCompanies([])
      setLoadError(err?.message || 'Unexpected error')
      toast.error('Companies failed to load', {
        description: err?.message || 'Unexpected error',
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }
  useRefreshOnReturn(fetchCompanies)

  useEffect(() => {
    fetchCompanies()
  }, [])

  const attentionCompanies = companies.filter((c) => c.isRegistered && needsAttention(c))

  // Offer to Fix (OfferDialog.jsx): the newest offer of each company, loaded with the Attention tab
  const [offers, setOffers] = useState({})
  const [offerFor, setOfferFor] = useState(null)
  const [sendingAll, setSendingAll] = useState(false)
  const loadOffers = () =>
    apiRequest('/admin/attention-offers', { label: 'Offers', silent: true }).then((res) => {
      if (res.ok) setOffers(res.data.data?.offers || {})
    })
  useEffect(() => {
    if (activeTab === 'attention') loadOffers()
  }, [activeTab])
  const offerToAll = async () => {
    const waiting = attentionCompanies.filter((c) => !offers[String(c.id)]?.accepted_at)
    if (!waiting.length) return
    if (!window.confirm(`Email an offer to the clients of ${waiting.length} compan${waiting.length === 1 ? 'y' : 'ies'}? Each gets the service that fixes its problem. Companies with an offer in the last 3 days, no matching service or no email are skipped.`)) return
    setSendingAll(true)
    const res = await apiRequest('/admin/attention-offers/send-all', { method: 'POST', body: { company_ids: waiting.map((c) => c.id) }, label: 'Offers', silent: true })
    setSendingAll(false)
    if (res.ok) {
      const skipped = res.data.data?.skipped || []
      toast.success(res.data.message || 'Offers sent.', skipped.length ? { description: skipped.slice(0, 4).map((x) => `${x.company}: ${x.reason}`).join(' · ') } : undefined)
      loadOffers()
    } else toast.error(res.data?.error || res.reason || 'The offers were not sent.')
  }

  // Draft / Pending › Check All With Companies House (PendingCheckDialog.jsx)
  const [pendingCheckOpen, setPendingCheckOpen] = useState(false)

  // Check All Now: every company in Attention re-checked with Companies House straight away
  const [checkingAll, setCheckingAll] = useState(false)
  const checkAllNow = async () => {
    setCheckingAll(true)
    const res = await apiRequest('/admin/companies/ch-refresh', { method: 'POST', body: { ids: attentionCompanies.map((c) => c.id) }, label: 'Companies House', silent: true })
    if (!res.ok) {
      setCheckingAll(false)
      return toast.error(res.data?.error || res.reason || 'Companies House did not answer.')
    }
    toast.success(res.data?.message || 'Checking…', { description: 'Companies that are up to date leave this list in a moment.' })
    // About a quarter of a second per company at Companies House; look again when they should be done
    const wait = Math.min(30000, 3000 + attentionCompanies.length * 400)
    setTimeout(() => {
      fetchCompanies()
      setCheckingAll(false)
    }, wait)
  }

  // Headline numbers; Attention and Not registered switch the tab below
  const pendingCount = companies.filter(isNotRegistered).length
  const activeCount = companies.filter((c) => !isNotRegistered(c) && String(c.status).toLowerCase() === 'active').length
  const closedCount = companies.filter((c) => /dissolved|liquidation|closed|removed|struck/i.test(String(c.status))).length
  const dueSoonCount = companies.filter((c) => {
    const due = c.raw?.accounts_next_due ? new Date(c.raw.accounts_next_due) : null
    if (!due || Number.isNaN(due.getTime())) return false
    const days = (due.getTime() - pageOpenedAt) / 86400000
    return days >= 0 && days <= 30
  }).length
  const companyStats = [
    { title: 'Total Companies', hero: true, value: String(companies.length), footerSubText: 'Show all', onClick: () => setActiveTab('all'), active: activeTab === 'all' },
    { title: 'Active', tone: 'emerald', value: String(activeCount), footerSubText: 'Trading on Companies House' },
    { title: 'Needs Attention', tone: 'rose', value: String(attentionCompanies.length), footerSubText: 'Overdue, pending or at risk', onClick: () => setActiveTab('attention'), active: activeTab === 'attention' },
    { title: 'Accounts Due Soon', tone: 'amber', icon: IconCalendarDue, value: String(dueSoonCount), footerSubText: 'Within the next 30 days' },
    { title: 'Not Registered', tone: 'violet', icon: IconBuildingPlus, value: String(pendingCount), footerSubText: `${closedCount} closed or dissolved`, onClick: () => setActiveTab('not-registered'), active: activeTab === 'not-registered' },
  ]

  // Months that have registered companies, newest first, with how many in each
  const incMonth = ALL_MONTHS
  const monthCounts = companies.reduce((acc, c) => {
    const key = incorporationMonth(c.incDate)
    if (key) acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const filteredCompanies = companies.filter((company) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      (company.name && company.name.toLowerCase().includes(term)) ||
      (company.number && company.number.toLowerCase().includes(term)) ||
      (company.director && company.director.toLowerCase().includes(term))

    if (!matchesSearch) return false

    if (activeTab === 'attention') {
      return company.isRegistered && needsAttention(company)
    }
    if (activeTab === 'not-registered') {
      return isNotRegistered(company)
    }
    return true
  })
  // Newest registered first (by incorporation date); companies without a date go last
  const incKey = (c) => incorporationDay(c.incDate) || ''
  filteredCompanies.sort((a, b) => incKey(b).localeCompare(incKey(a)))

  // A new search, tab or page size starts again on page 1
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const filterKey = `${activeTab}|${searchTerm}|${pageSize}`
  const [pageInfo, setPageInfo] = useState({ key: filterKey, page: 1 })
  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize))
  const currentPage = Math.min(pageInfo.key === filterKey ? pageInfo.page : 1, totalPages)
  const setPage = (p) => {
    setPageInfo({ key: filterKey, page: p })
    document.querySelector('main')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const pageCompanies = filteredCompanies.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const monthGroups = []
  // Attention is one plain list (what needs doing), not split by the month the companies were registered
  if (activeTab === 'attention') monthGroups.push({ key: 'attention', companies: pageCompanies })
  else for (const company of pageCompanies) {
    const key = incorporationMonth(company.incDate) || 'none'
    const last = monthGroups[monthGroups.length - 1]
    if (last && last.key === key) last.companies.push(company)
    else monthGroups.push({ key, companies: [company] })
  }
  const groupLabel = (key) => (key === 'none' ? 'No registration date' : new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long' }))
  const groupCount = (key) => filteredCompanies.filter((c) => (incorporationMonth(c.incDate) || 'none') === key).length

  // 1 … 4 5 6 … 18
  const pageNumbers = []
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) pageNumbers.push(p)
    else if (pageNumbers[pageNumbers.length - 1] !== '…') pageNumbers.push('…')
  }


  // Selection handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    const visibleIds = filteredCompanies.map((c) => c.id).filter(Boolean)
    const allSelected = visibleIds.every((id) => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const handleDeselectAll = () => {
    setSelectedIds([])
  }

  // Delete Handlers (optimistic + Undo)
  const handleConfirmDelete = () => {
    const idsToDelete = singleDeleteId ? [singleDeleteId] : [...selectedIds]
    if (!idsToDelete.length) return
    const idSet = new Set(idsToDelete)
    const snapshot = companies
    const removedCount = idsToDelete.length

    setDeleteConfirmOpen(false)
    setSingleDeleteId(null)
    setIsDeleting(false)
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)))
    setCompanies((prev) => prev.filter((c) => !idSet.has(c.id)))

    toastUndoableDelete({
      message:
        removedCount === 1
          ? 'Company deleted'
          : `${removedCount} companies deleted`,
      description: 'Undo available for a few seconds',
      onUndo: () => setCompanies(snapshot),
      onCommit: async () => {
        const apiUrl = import.meta.env.VITE_API_URL || '/api'
        const token = localStorage.getItem('token')
        let res
        if (idsToDelete.length === 1) {
          res = await fetch(`${apiUrl}/admin/companies/${idsToDelete[0]}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          })
        } else {
          res = await fetch(`${apiUrl}/admin/companies/bulk-delete`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ company_ids: idsToDelete }),
          })
        }
        const data = await res.json().catch(() => ({}))
        if (!(res.ok && data.success !== false)) {
          throw new Error(data.message || 'Failed to delete companies')
        }
      },
    })
  }

  const isAllVisibleSelected =
    filteredCompanies.length > 0 &&
    filteredCompanies.every((c) => selectedIds.includes(c.id))

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Registered Companies</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setIsWebfilingModalOpen(true)}>
            <IconUpload className="mr-2 h-4 w-4" />
            Import WebFiling
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <IconBuildingPlus className="mr-2 h-4 w-4" />
            Add Company
          </Button>
        </div>
      </div>

      <SectionCards stats={companyStats} isLoading={isLoading} compact />

      {/* Older formation orders (before Pending companies were automatic) can be picked up here */}
      {activeTab === 'not-registered' && isManagerOrAbove() && (
        <div className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-violet-900/50 dark:bg-violet-950/20">
          <span className="text-muted-foreground">
            Formation orders (Incorporation, packages …) add their new company here as Pending. Check older orders
            that came in before this was automatic.
          </span>
          <Button size="sm" variant="outline" className="shrink-0" disabled={isBackfilling} onClick={backfillFormations}>
            {isBackfilling ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconRefresh className="h-4 w-4" />}
            Check formation orders
          </Button>
        </div>
      )}

      {/* Stats/Tabs & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="flex-wrap h-auto justify-start">
            <TabsTrigger value="all" className="py-2">
              All
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-sm min-w-[20px] text-center inline-flex items-center justify-center">
                {isLoading ? <Skeleton className="h-3 w-4 rounded-xs" /> : companies.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="uk" className="py-2">
              UK Portfolio
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-sm min-w-[20px] text-center inline-flex items-center justify-center">
                {isLoading ? <Skeleton className="h-3 w-4 rounded-xs" /> : companies.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="attention"
              className="py-2 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive text-destructive"
            >
              Attention
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-sm min-w-[20px] text-center inline-flex items-center justify-center ${attentionCompanies.length ? 'bg-destructive text-white' : 'bg-muted-foreground/20'}`}>
                {isLoading ? <Skeleton className="h-3 w-4 rounded-xs" /> : attentionCompanies.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="not-registered" className="py-2">
              Draft / Pending
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-sm min-w-[20px] text-center inline-flex items-center justify-center">
                {isLoading ? <Skeleton className="h-3 w-4 rounded-xs" /> : pendingCount}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto shrink-0">
          <div className="relative w-full md:w-auto">
            <IconSearch className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, number, director…"
              className="w-full md:w-[280px] pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>


      {activeTab === 'attention' && !isLoading && (
        <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Accounts overdue, confirmation statement pending, default Companies House address, or strike-off. Offer to Fix sends the client a
            one-click offer for the service that sorts it out; an email offer not accepted gets a reminder after 3 and 7 days.
          </p>
          {attentionCompanies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={checkingAll} onClick={checkAllNow}>
                {checkingAll ? <IconLoader2 className="size-4 animate-spin" /> : <IconRefresh className="size-4" />} Check All Now
              </Button>
              <Button size="sm" variant="outline" disabled={sendingAll} onClick={offerToAll}>
                {sendingAll ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />} Offer to All
              </Button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'not-registered' && !isLoading && (
        <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Pending companies turn into the registered company by themselves once Companies House has them (checked every 5 minutes).
          </p>
          {pendingCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => setPendingCheckOpen(true)}>
              <IconRefresh className="size-4" /> Check All With Companies House
            </Button>
          )}
        </div>
      )}
      {pendingCheckOpen && <PendingCheckDialog onClose={() => setPendingCheckOpen(false)} onChanged={fetchCompanies} />}

      {/* Bulk Action Bar when items selected */}
      {selectedIds.length > 0 && (
        <Card className="animate-in animate-out p-2 fade-in slide-in-from-top-2  duration-200">
          <CardContent className="w-full p-0.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={isAllVisibleSelected}
                onCheckedChange={handleSelectAll}
                id="select-all-header"
              />
              <label htmlFor="select-all-header" className="cursor-pointer">
                {isAllVisibleSelected ? 'Deselect visible' : `Select all visible (${filteredCompanies.length})`}
              </label>
            </div>
            <span className="text-muted-foreground">•</span>
            <span className="text-primary font-medium">
              {selectedIds.length} {selectedIds.length === 1 ? 'company' : 'companies'} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleDeselectAll} className="text-sm h-7">
              Clear selection
            </Button>
            {isAdminRole() && (
              <Button
                variant="destructive"
                size="sm"
                className="text-[13px] h-[26px]"
                onClick={() => {
                  setSingleDeleteId(null)
                  setDeleteConfirmOpen(true)
                }}
              >
                <IconTrash className="mr-1.5 h-3.5 w-3.5" />
                Delete Selected ({selectedIds.length})
              </Button>
            )}
          </div>
          </CardContent>
        </Card>
      )}

      {/* Grid / Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-8">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <Skeleton key={i} className="w-full h-[150px] rounded-xl" />
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed text-center bg-card/40 my-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60 mb-3 text-muted-foreground">
            <IconSearch className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight">No Companies Found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
            {searchTerm
              ? `No records found matching "${searchTerm}". Try searching by a different name or number.`
              : activeTab === 'attention'
                ? 'No Companies House attention items right now.'
                : 'No registered company records available for the selected view.'}
          </p>
          {searchTerm && (
            <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
              Clear Search
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-8">
        <div>
          <div>
            {monthGroups.map((group, gi) => (
              <section key={group.key} id={`month-${group.key}`} data-month={group.key} className="mb-5 scroll-mt-[84px]">
                {/* The month heading stays pinned at the top while its companies scroll past */}
                {group.key !== 'attention' && <div className="sticky top-[74px] z-[9] -mx-1 mb-2 flex items-center gap-2 bg-background/85 px-1 py-2 backdrop-blur-md">
                  <h3 className="text-base font-semibold tracking-tight">{groupLabel(group.key)}</h3>
                  {group.key !== 'none' && <span className="text-xs text-muted-foreground">{group.key.slice(0, 4)}</span>}
                  <span className="text-xs text-muted-foreground">
                    · {groupCount(group.key)} compan{groupCount(group.key) === 1 ? 'y' : 'ies'} registered
                  </span>
                </div>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.companies.map((company, ci) => {
                    const i = gi * 3 + ci
                    return (
                      <m.div
                        key={company.id || `${group.key}-${ci}`}
                        className="h-full"
                        initial={i < 12 ? { opacity: 0, y: 14, scale: 0.985 } : false}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ ...spring, delay: Math.min(i, 12) * 0.035 }}
                      >
                        <CompanyCard
                          company={company}
                          isSelected={selectedIds.includes(company.id)}
                          onToggleSelect={handleToggleSelect}
                          onRefresh={fetchCompanies}
                          offer={activeTab === 'attention' ? offers[String(company.id)] : undefined}
                          onOffer={activeTab === 'attention' ? setOfferFor : undefined}
                          onDelete={isAdminRole() ? (id) => {
                            setSingleDeleteId(id)
                            setDeleteConfirmOpen(true)
                          } : undefined}
                        />
                      </m.div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        {offerFor && (
          <OfferDialog
            company={offerFor}
            onClose={() => setOfferFor(null)}
            onSent={(offer) => offer && setOffers((o) => ({ ...o, [String(offerFor.id)]: offer }))}
          />
        )}

        {/* Companies per page (25 / 50 / 75 / 100) and the page buttons */}
        {filteredCompanies.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredCompanies.length)} of{' '}
                {filteredCompanies.length} companies
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="w-auto gap-1" aria-label="Companies per page">
                  <SelectValue>{`${pageSize} per page`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} per page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                <IconChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              {pageNumbers.map((p, idx) =>
                p === '…' ? (
                  <span key={`gap-${idx}`} className="px-1.5 text-sm text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === currentPage ? 'default' : 'ghost'}
                    size="sm"
                    className="min-w-8 tabular-nums"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                )
              )}
              <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
                Next
                <IconChevronRight className="h-4 w-4" />
              </Button>
            </div>}
          </div>
        )}
        </div>
      )}

      {/* Reusable Delete Confirmation Dialog */}
      <DeleteConfirmation
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setSingleDeleteId(null)
        }}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        title={singleDeleteId ? "Delete Company" : "Delete Selected Companies"}
        description={
          singleDeleteId
            ? "Are you sure you want to permanently delete this company record?"
            : `Are you sure you want to permanently delete ${selectedIds.length} selected company records?`
        }
        confirmText={isDeleting ? "Deleting..." : singleDeleteId ? "Delete" : `Delete (${selectedIds.length})`}
      />

      <AddCompany
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          fetchCompanies()
        }}
      />

      <ImportWebfilingModal
        isOpen={isWebfilingModalOpen}
        onClose={() => setIsWebfilingModalOpen(false)}
        onImportSuccess={() => {
          fetchCompanies()
        }}
      />
    </div>
  )
}

export default Companies