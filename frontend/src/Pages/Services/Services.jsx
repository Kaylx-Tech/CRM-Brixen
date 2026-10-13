import React, { useState, useMemo, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import AddService from "./AddService"
import ViewService from "./ViewService"
import DeleteConfirmation from "../../components/DeleteConfirmation"
import { isAdminRole } from "@/lib/permissions"
import FormFieldsBuilder, { formFieldsError } from "./FormFieldsBuilder"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconPlus, IconDotsVertical, IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"
import { apiRequest, getApiBase, toastApiEmpty } from "@/lib/api"
import { toastUndoableDelete, toastProcessing, toastDone, toastFail } from "@/lib/toastActions"

const columnHelper = createColumnHelper()

const Services = () => {
  const [data, setData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  // Prices sync to the website, so only admins add, edit or delete services (old portal rule)
  const canManageCatalog = isAdminRole()
  const [viewingService, setViewingService] = useState(null)

  // Edit state
  const [editService, setEditService] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '', category: 'Corporate', description: '',
    sellPrice: '', originalPrice: '0', duration: '12 Months', status: 'Active'
  })

  // Delete state
  const [serviceToDelete, setServiceToDelete] = useState(null)
  const [bulkDeleteRows, setBulkDeleteRows] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchServices = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest('/catalog/services', { label: 'Services' })
      if (!res.ok) {
        setData([])
        setLoadError(res.reason)
        return
      }
      const json = res.data
      const servicesData = json?.data || json
      const list = Array.isArray(servicesData) ? servicesData : []
      const formatted = list.map(s => {
        const price = Number(s.price) || 0
        const costPrice = Number(s.cost_price ?? s.originalPrice) || 0
        return {
          ...s,
          sellPrice: `£${price}`,
          originalPrice: `£${costPrice}`,
          profit: `£${price - costPrice}`
        }
      })
      setData(formatted)
      if (formatted.length === 0) toastApiEmpty('Services', getApiBase())
    } catch (err) {
      console.error("Failed to load services", err)
      setData([])
      setLoadError(err?.message || 'Unexpected error')
      toast.error('Services failed to load', {
        description: err?.message || 'Unexpected error',
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchServices()
  }, [])

  // ── Open Edit Dialog ──
  const openEditDialog = (service) => {
    setEditService(service)
    setEditForm({
      name: service.name || '',
      category: service.category || 'Corporate',
      description: service.description || '',
      sellPrice: String(Number(service.price) || ''),
      originalPrice: String(Number(service.cost_price) || '0'),
      duration: service.duration || '12 Months',
      status: service.status || 'Active',
      form_fields: Array.isArray(service.form_fields) ? service.form_fields : [],
    })
  }

  // ── Submit Edit ──
  const handleEditSubmit = async () => {
    if (!editForm.name.trim() || !editForm.sellPrice) {
      toast.error("Name and Sell price are required.")
      return
    }
    const formError = formFieldsError(editForm.form_fields)
    if (formError) {
      toast.error(formError)
      return
    }

    setIsEditing(true)
    const toastId = toastProcessing('Updating service…')
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/catalog/services/${editService.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(editForm)
      })
      const json = await res.json()
      if (res.ok) {
        const sync = json.data?.website_sync
        if (sync && !sync.ok && !sync.skipped) {
          // Saved in the CRM but WooCommerce refused the change: say so clearly
          toastFail(toastId, json.message || "Saved in the CRM, but the website was not updated")
        } else {
          toastDone(toastId, json.message || "Service updated successfully")
        }
        setEditService(null)
        fetchServices()
      } else {
        toastFail(toastId, json.message || json.error || "Failed to update service")
      }
    } catch (error) {
      toastFail(toastId, "Network error: " + error.message)
    } finally {
      setIsEditing(false)
    }
  }

  // ── Confirm Delete (optimistic + Undo) ──
  const confirmDelete = () => {
    if (!serviceToDelete?.id) return
    const victim = serviceToDelete
    const snapshot = data
    setServiceToDelete(null)
    setIsDeleting(false)
    setData((prev) => prev.filter((s) => s.id !== victim.id))

    toastUndoableDelete({
      message: `Service "${victim.name || 'service'}" deleted`,
      description: 'Undo available for a few seconds',
      onUndo: () => setData(snapshot),
      onCommit: async () => {
        const apiUrl = import.meta.env.VITE_API_URL || '/api'
        const token = localStorage.getItem('token')
        const res = await fetch(`${apiUrl}/catalog/services/${victim.id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json.message || json.error || 'Failed to delete service')
        }
      },
    })
  }

  // ── Confirm Bulk Delete (optimistic + Undo) ──
  const confirmBulkDelete = () => {
    if (!bulkDeleteRows || bulkDeleteRows.length === 0) return
    const serviceIds = bulkDeleteRows.map((r) => r.original.id).filter(Boolean)
    if (serviceIds.length === 0) return
    const idSet = new Set(serviceIds)
    const snapshot = data
    setBulkDeleteRows(null)
    setIsDeleting(false)
    setData((prev) => prev.filter((s) => !idSet.has(s.id)))

    toastUndoableDelete({
      message: `${serviceIds.length} service(s) deleted`,
      description: 'Undo available for a few seconds',
      onUndo: () => setData(snapshot),
      onCommit: async () => {
        const apiUrl = import.meta.env.VITE_API_URL || '/api'
        const token = localStorage.getItem('token')
        const res = await fetch(`${apiUrl}/catalog/services/bulk-delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ service_ids: serviceIds }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json.message || json.error || 'Failed to bulk delete services.')
        }
      },
    })
  }

  const columns = useMemo(() => [
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    }),
    columnHelper.accessor("name", {
      header: "Service",
      cell: ({ row }) => {
        const service = row.original
        return (
          <button
            type="button"
            className="text-left font-medium text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
            onClick={() => setViewingService(service)}
          >
            {row.getValue("name")}
          </button>
        )
      },
    }),
    columnHelper.accessor("category", {
      header: "Category",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue("category")}</span>,
    }),
    columnHelper.accessor("sellPrice", {
      header: "Sell price",
      cell: ({ row }) => <span className="font-medium">{row.getValue("sellPrice")}</span>,
    }),
    columnHelper.accessor("originalPrice", {
      header: "Original price",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("originalPrice")}</span>,
    }),
    columnHelper.accessor("profit", {
      header: "Profit",
      cell: ({ row }) => <span className="font-semibold text-green-600 dark:text-green-400">{row.getValue("profit")}</span>,
    }),
    columnHelper.accessor("duration", {
      header: "Duration",
      cell: ({ row }) => <span className="text-sm">{row.getValue("duration")}</span>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status")
        return (
          <Badge className={status === 'Active' ? 'badge-green' : 'badge-amber'}>
            {status}
          </Badge>
        )
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const service = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Service actions" />}
            >
              <IconDotsVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setViewingService(service)}>
                View Details
              </DropdownMenuItem>
              {canManageCatalog && (
                <>
                  <DropdownMenuItem onClick={() => openEditDialog(service)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setServiceToDelete(service)}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ], [canManageCatalog])

  const filterConfig = [
    {
      columnKey: "category",
      placeholder: "Category",
      options: [
        { label: "Corporate", value: "Corporate" },
        { label: "Accountancy", value: "Accountancy" },
        { label: "Other", value: "Other" },
      ]
    },
    {
      columnKey: "status",
      placeholder: "Status",
      options: [
        { label: "Active", value: "Active" },
        { label: "Inactive", value: "Inactive" },
      ]
    },
    {
      columnKey: "duration",
      placeholder: "Duration",
      options: [
        { label: "One Time", value: "One Time" },
        { label: "1 Month", value: "1 Month" },
        { label: "3 Months", value: "3 Months" },
        { label: "6 Months", value: "6 Months" },
        { label: "12 Months", value: "12 Months" },
      ]
    }
  ];

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Services Catalog</h2>
        </div>
        
        {canManageCatalog && (
          <Button onClick={ () => setIsAddOpen(true)}>
            <IconPlus className="mr-2 h-4 w-4" />
            Add Service
          </Button>
        )}
        <AddService 
          isOpen={isAddOpen} 
          onClose={() => setIsAddOpen(false)} 
          onSuccess={fetchServices}
        />
      </div>


      <DataTable
        columns={columns}
        data={data}
        filterConfig={filterConfig}
        isLoading={isLoading}
        onDeleteSelected={canManageCatalog ? (rows) => setBulkDeleteRows(rows) : undefined}
      />

      {/* ── Edit Service Dialog ── */}
      <Dialog open={!!editService} onOpenChange={(open) => !open && setEditService(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>
              Update the service details below.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="-mx-6" viewportClassName="max-h-[60vh]">
          <div className="grid gap-4 px-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                disabled={isEditing}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-category">Category *</Label>
              <Select
                value={editForm.category}
                onValueChange={(val) => setEditForm(prev => ({ ...prev, category: val }))}
                disabled={isEditing}
              >
                <SelectTrigger id="edit-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Solutions">Solutions</SelectItem>
                  <SelectItem value="Professional">Professional</SelectItem>
                  <SelectItem value="Forms">Forms</SelectItem>
                  <SelectItem value="Digital">Digital</SelectItem>
                  <SelectItem value="Corporate">Corporate</SelectItem>
                  <SelectItem value="Accountancy">Accountancy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                className="min-h-[80px]"
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                disabled={isEditing}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-sellPrice">Sell price (£) *</Label>
                <Input
                  id="edit-sellPrice"
                  type="number"
                  value={editForm.sellPrice}
                  onChange={(e) => setEditForm(prev => ({ ...prev, sellPrice: e.target.value }))}
                  disabled={isEditing}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-originalPrice">Original / cost price (£)</Label>
                <Input
                  id="edit-originalPrice"
                  type="number"
                  value={editForm.originalPrice}
                  onChange={(e) => setEditForm(prev => ({ ...prev, originalPrice: e.target.value }))}
                  disabled={isEditing}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-duration">Duration</Label>
                <Select
                  value={editForm.duration}
                  onValueChange={(val) => setEditForm(prev => ({ ...prev, duration: val }))}
                  disabled={isEditing}
                >
                  <SelectTrigger id="edit-duration" className="w-full">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="One Time">One Time</SelectItem>
                    <SelectItem value="1 Month">1 Month</SelectItem>
                    <SelectItem value="3 Months">3 Months</SelectItem>
                    <SelectItem value="6 Months">6 Months</SelectItem>
                    <SelectItem value="12 Months">12 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(val) => setEditForm(prev => ({ ...prev, status: val }))}
                  disabled={isEditing}
                >
                  <SelectTrigger id="edit-status" className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <FormFieldsBuilder
              value={editForm.form_fields || []}
              onChange={(form_fields) => setEditForm((prev) => ({ ...prev, form_fields }))}
              disabled={isEditing}
            />
          </div>
          </ScrollArea>
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setEditService(null)} disabled={isEditing}>Cancel</Button>
            <Button onClick={handleEditSubmit} disabled={isEditing}>
              {isEditing && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Service Modal ── */}
      <ViewService
        service={viewingService}
        isOpen={!!viewingService}
        onClose={() => setViewingService(null)}
        onEdit={openEditDialog}
      />

      {/* ── Delete Confirmation ── */}
      <DeleteConfirmation
        isOpen={!!serviceToDelete}
        onClose={() => setServiceToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Service"
        description={`This will permanently delete "${serviceToDelete?.name || 'this service'}" from the catalog.`}
        confirmText="Delete"
        isLoading={isDeleting}
      />

      {/* ── Bulk Delete Confirmation ── */}
      <DeleteConfirmation
        isOpen={!!bulkDeleteRows}
        onClose={() => setBulkDeleteRows(null)}
        onConfirm={confirmBulkDelete}
        title="Delete Selected Services"
        description={`This will permanently delete ${bulkDeleteRows?.length || 0} selected service(s) from the catalog.`}
        confirmText={`Delete (${bulkDeleteRows?.length || 0})`}
        isLoading={isDeleting}
      />
    </div>
  )
}

export default Services
