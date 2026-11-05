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
            director: c.director_name || c.director || 'Director',
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
  // Year filter (Apple Photos style): the newest year with companies first; "none" = no incorporation date
  const [pickedYear, setPickedYear] = useState('')
  const incMonth = ALL_MONTHS
  const monthCounts = companies.reduce((acc, c) => {
    const key = incorporationMonth(c.incDate)
    if (key) acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const yearCounts = companies.reduce((acc, c) => {
    const key = incorporationMonth(c.incDate)?.slice(0, 4) || 'none'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const yearOptions = Object.keys(yearCounts).filter((y) => y !== 'none').sort().reverse()
  if (yearCounts.none) yearOptions.push('none')
  const incYear = yearOptions.includes(pickedYear) ? pickedYear : yearOptions[0] || ''
  const yearOf = (c) => incorporationMonth(c.incDate)?.slice(0, 4) || 'none'

  const filteredCompanies = companies.filter((company) => {
    if (incYear && yearOf(company) !== incYear) return false
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
  const filterKey = `${activeTab}|${searchTerm}|${pageSize}|${incYear}`
  const [pageInfo, setPageInfo] = useState({ key: filterKey, page: 1 })
  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize))
  const currentPage = Math.min(pageInfo.key === filterKey ? pageInfo.page : 1, totalPages)
  const setPage = (p) => {
    setPageInfo({ key: filterKey, page: p })
    document.querySelector('main')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const pageCompanies = filteredCompanies.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const monthGroups = []
  for (const company of pageCompanies) {
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

        {/* Month registered + search */}
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto shrink-0">
          {/* Year filter: a slim segmented control; the picked year is a solid pill (like Add Company) that slides */}
          {yearOptions.length > 0 && (
            <div
              role="tablist"
              aria-label="Year registered"
              className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-muted/70 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {yearOptions.map((y) => {
                const on = y === incYear
                return (
                  <button
                    key={y}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setPickedYear(y)}
                    className={`relative flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors ${on ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {on && (
                      <m.span
                        layoutId="company-year-pill"
                        className="absolute inset-0 rounded-full bg-primary shadow-sm"
                        transition={spring}
                      />
                    )}
                    <span className="relative">{y === 'none' ? 'No date' : y}</span>
                    <span className={`relative text-[11px] tabular-nums ${on ? 'text-primary-foreground/75' : 'text-muted-foreground/70'}`}>{yearCounts[y]}</span>
                  </button>
                )
              })}
            </div>
          )}
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
        <p className="text-sm text-muted-foreground -mt-2">
          Accounts overdue, confirmation statement pending, default Companies House address, or strike-off.
        </p>
      )}

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
          <h3 className="text-lg font-semibold tracking-tight">No companies found</h3>
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
                <div className="sticky top-[74px] z-[9] -mx-1 mb-2 flex items-center gap-2 bg-background/85 px-1 py-2 backdrop-blur-md">
                  <h3 className="text-base font-semibold tracking-tight">{groupLabel(group.key)}</h3>
                  {group.key !== 'none' && <span className="text-xs text-muted-foreground">{group.key.slice(0, 4)}</span>}
                  <span className="text-xs text-muted-foreground">
                    · {groupCount(group.key)} compan{groupCount(group.key) === 1 ? 'y' : 'ies'} registered
                  </span>
                  {/* Jump to another month of this page; the pinned bar's month is highlighted */}
                  {monthGroups.length > 1 && (
                    <nav className="ml-auto hidden items-center gap-0.5 sm:flex" aria-label="Months">
                      {monthGroups.map((g) => (
                        <button
                          key={g.key}
                          type="button"
                          className={`rounded-full px-2 py-0.5 text-xs transition-colors ${g.key === group.key ? 'bg-primary font-semibold text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                          onClick={() => document.getElementById(`month-${g.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        >
                          {g.key === 'none' ? 'No date' : new Date(`${g.key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })}
                        </button>
                      ))}
                    </nav>
                  )}
                </div>
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