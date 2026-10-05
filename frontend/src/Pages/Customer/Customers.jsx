import React, { useState, useEffect, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AddCustomer from "./AddCustomer"
import ViewCustomer from "./ViewCustomer"
import SetCustomerPassword from "./SetCustomerPassword"
import DeleteConfirmation from "../../components/DeleteConfirmation"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import { IconDotsVertical, IconArrowsSort, IconUserPlus, IconKey, IconTrash, IconEye, IconAlertTriangle } from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { apiRequest, getApiBase, toastApiEmpty } from "@/lib/api"
import { toastUndoableDelete } from "@/lib/toastActions"

const columnHelper = createColumnHelper()

const Customers = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewCustomer, setViewCustomer] = useState(null)
  const [passwordCustomer, setPasswordCustomer] = useState(null)
  const [customerToDelete, setCustomerToDelete] = useState(null)
  const [bulkDeleteRows, setBulkDeleteRows] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [updatingTypeId, setUpdatingTypeId] = useState(null)
  const [activeTypeTab, setActiveTypeTab] = useState('All')
  const [customers, setCustomers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const handleUpdateCustomerType = async (customerId, newType) => {
    setUpdatingTypeId(customerId)
    const toastId = toast.loading('Updating customer type…')
    try {
      const res = await apiRequest('/admin/customers/type', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customerId,
          type: newType,
        }),
        label: 'Update customer type',
        silent: true,
      })
      if (res.ok) {
        setCustomers((prev) =>
          prev.map((c) => (c.id === customerId ? { ...c, type: newType } : c))
        )
        toast.success(`Customer type updated to ${newType}`, { id: toastId })
      } else {
        toast.error(res.reason || 'Failed to update customer type', { id: toastId })
      }
    } catch (err) {
      toast.error(err?.message || 'Error updating customer type', { id: toastId })
    } finally {
      setUpdatingTypeId(null)
    }
  }

  const loadCustomers = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest('/admin/customers', { label: 'Customers' })
      if (!res.ok) {
        setCustomers([])
        setLoadError(res.reason)
        return
      }
      const data = res.data || {}
      const rawList = data.customers || data.data?.customers || data.data?.clients || (Array.isArray(data.data) ? data.data : null) || (Array.isArray(data) ? data : [])
      if (Array.isArray(rawList)) {
        const mapped = rawList.map((c) => {
          let type = 'Individual'
          if (Number(c.is_b2b) === 1 || String(c.client_type || '').toUpperCase() === 'B2B') {
            type = 'B2B'
          } else if (String(c.client_type || '').toLowerCase() === 'business') {
            type = 'Business'
          }
          return {
            id: c.id,
            name: c.full_name || 'Customer',
            email: c.email || '',
            type: type,
            signedUp: c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent',
            source: c.wordpress_user_id ? 'Website signup' : 'CRM',
            companies: c.companies_count ?? 0,
            orders: c.orders_count ?? 0,
            status: c.status || 'Active',
            raw: c,
          }
        })
        setCustomers(mapped)
        if (mapped.length === 0) toastApiEmpty('Customers', getApiBase())
      } else {
        setCustomers([])
        setLoadError('API returned an unexpected response shape (no customers list).')
        toast.error('Customers failed to load', {
          description: 'API returned an unexpected response shape (no customers list).',
          duration: 8000,
        })
      }
    } catch (err) {
      console.error("Failed to load customers from backend", err)
      setCustomers([])
      setLoadError(err?.message || 'Unexpected error')
      toast.error('Customers failed to load', {
        description: err?.message || 'Unexpected error',
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  // Handler: Single Customer Delete (optimistic + Undo)
  const confirmSingleDelete = () => {
    if (!customerToDelete?.id) return
    const victim = customerToDelete
    const snapshot = customers
    setCustomerToDelete(null)
    setIsDeleting(false)
    setCustomers((prev) => prev.filter((c) => c.id !== victim.id))

    toastUndoableDelete({
      message: `Customer "${victim.name}" deleted`,
      description: victim.email || 'Undo available for a few seconds',
      onUndo: () => setCustomers(snapshot),
      onCommit: async () => {
        const apiUrl = import.meta.env.VITE_API_URL || '/api'
        const token = localStorage.getItem('token')
        const res = await fetch(`${apiUrl}/admin/customers/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            customer_id: victim.id,
            force_delete_genuine: true,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!(res.ok && (data.status === 'success' || data.success === true))) {
          throw new Error(data.message || data.error || 'Failed to delete customer.')
        }
      },
    })
  }

  // Handler: Bulk Customer Delete (optimistic + Undo)
  const confirmBulkDelete = () => {
    if (!bulkDeleteRows || bulkDeleteRows.length === 0) return
    const rows = bulkDeleteRows
    const customerIds = rows.map((r) => r.original.id).filter(Boolean)
    if (customerIds.length === 0) return
    const idSet = new Set(customerIds)
    const snapshot = customers
    setBulkDeleteRows(null)
    setIsDeleting(false)
    setCustomers((prev) => prev.filter((c) => !idSet.has(c.id)))

    toastUndoableDelete({
      message: `${customerIds.length} customer(s) deleted`,
      description: 'Undo available for a few seconds',
      onUndo: () => setCustomers(snapshot),
      onCommit: async () => {
        const apiUrl = import.meta.env.VITE_API_URL || '/api'
        const token = localStorage.getItem('token')
        const res = await fetch(`${apiUrl}/admin/customers/bulk-delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            customer_ids: customerIds,
            force_delete_genuine: true,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!(res.ok && (data.status === 'success' || data.success === true))) {
          throw new Error(data.message || data.error || 'Failed to bulk delete customers.')
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
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Customer Name
            <IconArrowsSort className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const customer = row.original
        return (
          <button
            type="button"
            className="text-left font-medium text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
            onClick={() => setViewCustomer(customer)}
          >
            {customer.name}
          </button>
        )
      },
    }),
    columnHelper.accessor("email", {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Email
            <IconArrowsSort className="ml-2 h-4 w-4" />
          </Button>
        )
      },
    }),
    columnHelper.accessor("type", {
      header: "Type",
      cell: ({ row }) => {
        const customer = row.original
        const type = customer.type || 'Individual'
        return (
          <Select
            value={type}
            onValueChange={(val) => handleUpdateCustomerType(customer.id, val)}
            disabled={updatingTypeId === customer.id}
          >
            <SelectTrigger className="h-7 w-[105px] text-xs font-medium">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="overflow-hidden p-0">
              <SelectGroup className="p-1">
                <SelectItem value="Individual">Individual</SelectItem>
                <SelectItem value="Business">Business</SelectItem>
                <SelectItem value="B2B">B2B</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )
      }
    }),
    columnHelper.accessor("signedUp", {
      header: "Signed up",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.getValue("signedUp")}</span>,
    }),
    columnHelper.accessor("source", {
      header: "Source",
      cell: ({ row }) => {
        const source = row.getValue("source")
        if (source === 'Website signup') {
          return <Badge className="badge-sky">Website signup</Badge>
        }
        return <Badge className="badge-green">{source || 'CRM'}</Badge>
      }
    }),
    columnHelper.accessor("companies", {
      header: "Companies",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          {row.getValue("companies")}
        </span>
      ),
    }),
    columnHelper.accessor("orders", {
      header: "Orders",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          {row.getValue("orders")}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status")
        if (status === 'Active') {
          return <Badge className="badge-green">Active</Badge>
        }
        if (status === 'Pending') {
          return <Badge className="badge-amber">Pending</Badge>
        }
        return <Badge className="badge-red">{status || 'Inactive'}</Badge>
      }
    }),
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        const customer = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <IconDotsVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setViewCustomer(customer)}>
                  View Customer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPasswordCustomer(customer)}>
                  Set Password
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                variant="destructive"
                onClick={() => setCustomerToDelete(customer)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ], [])

  const filteredCustomers = useMemo(() => {
    if (activeTypeTab === 'All') return customers
    return customers.filter((c) => (c.type || '').toLowerCase() === activeTypeTab.toLowerCase())
  }, [customers, activeTypeTab])

  const customerFilterConfig = [
    {
      columnKey: "source",
      placeholder: "Sources",
      options: [
        { label: "Organic", value: "Organic" },
        { label: "Referral", value: "Referral" },
        { label: "Social", value: "Social" },
        { label: "CRM", value: "CRM" },
        { label: "Website signup", value: "Website signup" },
      ]
    },
    {
      columnKey: "status",
      placeholder: "Status",
      options: [
        { label: "Active", value: "Active" },
        { label: "Inactive", value: "Inactive" },
      ]
    }
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customers & New Signups</h2>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <IconUserPlus className="mr-2 h-4 w-4" />
          Create Customer
        </Button>
      </div>

      <Tabs
        value={activeTypeTab}
        onValueChange={setActiveTypeTab}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="All" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            All
          </TabsTrigger>
          <TabsTrigger value="Individual" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Individual
          </TabsTrigger>
          <TabsTrigger value="Business" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Business
          </TabsTrigger>
          <TabsTrigger value="B2B" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            B2B
          </TabsTrigger>
        </TabsList>
      </Tabs>


      <DataTable
        columns={columns}
        data={filteredCustomers}
        filterConfig={customerFilterConfig}
        isLoading={isLoading}
        onDeleteSelected={(rows) => setBulkDeleteRows(rows)}
      />
     
      {/* Create Customer Modal */}
      <AddCustomer 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCustomerCreated={() => loadCustomers()} 
      />

      {/* View Customer Details Modal */}
      {viewCustomer && (
        <ViewCustomer 
          customer={viewCustomer} 
          isOpen={!!viewCustomer} 
          onClose={() => setViewCustomer(null)} 
        />
      )}

      {/* Set/Reset Password Modal */}
      {passwordCustomer && (
        <SetCustomerPassword
          customer={passwordCustomer}
          isOpen={!!passwordCustomer}
          onClose={() => setPasswordCustomer(null)}
          onPasswordSet={() => loadCustomers()}
        />
      )}

      {/* Single Delete Confirmation Dialog */}
      <DeleteConfirmation
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={confirmSingleDelete}
        title="Delete Customer"
        description="This will permanently delete this client and all associated access."
        confirmText="Delete"
        isLoading={isDeleting}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <DeleteConfirmation
        isOpen={!!bulkDeleteRows}
        onClose={() => setBulkDeleteRows(null)}
        onConfirm={confirmBulkDelete}
        title="Delete Selected Customers"
        description="This will permanently delete all selected client accounts and associated access."
        confirmText={`Delete (${bulkDeleteRows?.length || 0})`}
        isLoading={isDeleting}
      />
    </div>
  )
}

export default Customers
