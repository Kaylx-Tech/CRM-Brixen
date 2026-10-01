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
import { toast } from "sonner"
import { apiRequest, getApiBase, toastApiEmpty } from "@/lib/api"

const columnHelper = createColumnHelper()

const Customers = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewCustomer, setViewCustomer] = useState(null)
  const [passwordCustomer, setPasswordCustomer] = useState(null)
  const [customerToDelete, setCustomerToDelete] = useState(null)
  const [bulkDeleteRows, setBulkDeleteRows] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [activeTypeTab, setActiveTypeTab] = useState('All')
  const [customers, setCustomers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

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

  // Handler: Single Customer Delete
  const confirmSingleDelete = async () => {
    if (!customerToDelete?.id) return
    setIsDeleting(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem("token")
      const res = await fetch(`${apiUrl}/admin/customers/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          customer_id: customerToDelete.id,
          force_delete_genuine: true,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.status === 'success' || data.success === true)) {
        toast.success(data.message || `Customer "${customerToDelete.name}" deleted successfully.`)
        setCustomerToDelete(null)
        loadCustomers()
      } else {
        toast.error(data.message || data.error || 'Failed to delete customer.')
      }
    } catch (err) {
      toast.error('Network error while deleting customer: ' + err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  // Handler: Bulk Customer Delete
  const confirmBulkDelete = async () => {
    if (!bulkDeleteRows || bulkDeleteRows.length === 0) return
    const customerIds = bulkDeleteRows.map((r) => r.original.id).filter(Boolean)
    if (customerIds.length === 0) return

    setIsDeleting(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem("token")
      const res = await fetch(`${apiUrl}/admin/customers/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          customer_ids: customerIds,
          force_delete_genuine: true,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.status === 'success' || data.success === true)) {
        toast.success(data.message || `Successfully removed ${customerIds.length} customer account(s).`)
        setBulkDeleteRows(null)
        loadCustomers()
      } else {
        toast.error(data.message || data.error || 'Failed to bulk delete customers.')
      }
    } catch (err) {
      toast.error('Network error during bulk delete: ' + err.message)
    } finally {
      setIsDeleting(false)
    }
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
        const type = row.getValue("type")
        if (type === 'B2B') {
          return <Badge className="badge-purple">B2B</Badge>
        }
        if (type === 'Business') {
          return <Badge className="badge-amber">Business</Badge>
        }
        return <Badge className="badge-blue">{type || 'Individual'}</Badge>
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

      {loadError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-medium">Could not load customers</p>
          <p className="mt-1 text-destructive/90 whitespace-pre-wrap">{loadError}</p>
          <p className="mt-1 text-muted-foreground text-xs">API: {getApiBase()}</p>
        </div>
      ) : null}

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
