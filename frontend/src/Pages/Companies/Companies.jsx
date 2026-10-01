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
} from '@tabler/icons-react'
import CompanyCard from './CompanyCard'
import AddCompany from './AddCompany'
import ImportWebfilingModal from './ImportWebfilingModal'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { apiRequest, getApiBase, toastApiEmpty } from '@/lib/api'

const Companies = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isWebfilingModalOpen, setIsWebfilingModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [companies, setCompanies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [activeTab, setActiveTab] = useState('all')

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
            deadlineText: c.accounts_next_due ? `Accounts due: ${c.accounts_next_due}` : 'No upcoming deadlines',
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

  useEffect(() => {
    fetchCompanies()
  }, [])

  const filteredCompanies = companies.filter((company) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      (company.name && company.name.toLowerCase().includes(term)) ||
      (company.number && company.number.toLowerCase().includes(term)) ||
      (company.director && company.director.toLowerCase().includes(term))

    if (!matchesSearch) return false

    if (activeTab === 'attention') {
      return company.status === 'Overdue' || company.status === 'Inactive'
    }
    if (activeTab === 'not-registered') {
      return company.status === 'Pending' || company.status === 'Draft'
    }
    return true
  })

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

  // Delete Handlers
  const handleConfirmDelete = async () => {
    const idsToDelete = singleDeleteId ? [singleDeleteId] : selectedIds
    if (!idsToDelete.length) return

    setIsDeleting(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')

      let res
      if (idsToDelete.length === 1 && singleDeleteId) {
        res = await fetch(`${apiUrl}/admin/companies/${singleDeleteId}`, {
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
      if (res.ok && data.success !== false) {
        toast.success(data.message || `Deleted ${idsToDelete.length} company records`)
        setSelectedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)))
        setDeleteConfirmOpen(false)
        setSingleDeleteId(null)
        fetchCompanies()
      } else {
        throw new Error(data.message || 'Failed to delete companies')
      }
    } catch (err) {
      toast.error(err.message || 'Error deleting companies')
    } finally {
      setIsDeleting(false)
    }
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
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={fetchCompanies}
            disabled={isLoading}
            title="Refresh list"
          >
            <IconRefresh className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
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

      {loadError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-medium">Could not load companies</p>
          <p className="mt-1 text-destructive/90 whitespace-pre-wrap">{loadError}</p>
          <p className="mt-1 text-muted-foreground text-xs">API: {getApiBase()}</p>
        </div>
      ) : null}

      {/* Stats/Tabs & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="flex-wrap h-auto justify-start">
            <TabsTrigger value="all" className="py-2">
              All
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-xs min-w-[20px] text-center inline-flex items-center justify-center">
                {isLoading ? <Skeleton className="h-3 w-4 rounded-xs" /> : companies.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="uk" className="py-2">
              UK Portfolio
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-xs min-w-[20px] text-center inline-flex items-center justify-center">
                {isLoading ? <Skeleton className="h-3 w-4 rounded-xs" /> : companies.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="attention"
              className="py-2 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive text-destructive"
            >
              Attention
            </TabsTrigger>
            <TabsTrigger value="not-registered" className="py-2">
              Draft / Pending
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative w-full md:w-auto shrink-0">
          <IconSearch className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, number, director…"
            className="w-full md:w-[280px] pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Bulk Action Bar when items selected */}
      {selectedIds.length > 0 && (
        <Card className="animate-in animate-out p-2 fade-in slide-in-from-top-2  duration-200">
          <CardContent className="w-full p-0.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs">
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
            <Button variant="ghost" size="sm" onClick={handleDeselectAll} className="text-xs h-8">
              Clear selection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs h-8"
              onClick={() => {
                setSingleDeleteId(null)
                setDeleteConfirmOpen(true)
              }}
            >
              <IconTrash className="mr-1.5 h-3.5 w-3.5" />
              Delete Selected ({selectedIds.length})
            </Button>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Grid / Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 pb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-[270px] rounded-xl" />
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
              : 'No registered company records available for the selected view.'}
          </p>
          {searchTerm && (
            <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
              Clear Search
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 pb-8">
          {filteredCompanies.map((company, i) => (
            <CompanyCard
              key={company.id || i}
              company={company}
              isSelected={selectedIds.includes(company.id)}
              onToggleSelect={handleToggleSelect}
              onDelete={(id) => {
                setSingleDeleteId(id)
                setDeleteConfirmOpen(true)
              }}
            />
          ))}
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