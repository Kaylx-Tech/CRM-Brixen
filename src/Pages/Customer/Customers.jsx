import React, { useState, useEffect, useMemo } from 'react'
import { Button } from "@/components/ui/button"
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

const columnHelper = createColumnHelper()

const Customers = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewCustomer, setViewCustomer] = useState(null)
  const [passwordCustomer, setPasswordCustomer] = useState(null)
  const [customerToDelete, setCustomerToDelete] = useState(null)
  const [bulkDeleteRows, setBulkDeleteRows] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [customers, setCustomers] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const loadCustomers = async () => {
    setIsLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${apiUrl}/admin/customers`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === "success" && Array.isArray(data.customers)) {
          const mapped = data.customers.map((c) => {
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
        }
      }
    } catch (err) {
      console.error("Failed to load customers from backend", err)
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
      const res = await fetch(`${apiUrl}/admin/customers/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer_id: customerToDelete.id,
          force_delete_genuine: true,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.status === 'success') {
        toast.success(data.message || `Customer "${customerToDelete.name}" deleted successfully.`)
        setCustomerToDelete(null)
        loadCustomers()
      } else {
        toast.error(data.message || 'Failed to delete customer.')
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
      const res = await fetch(`${apiUrl}/admin/customers/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer_ids: customerIds,
          force_delete_genuine: true,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.status === 'success') {
        toast.success(data.message || `Successfully removed ${customerIds.length} customer account(s).`)
        setBulkDeleteRows(null)
        loadCustomers()
      } else {
        toast.error(data.message || 'Failed to bulk delete customers.')
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
        let badgeVariant = 'secondary'
        if (type === 'B2B') badgeVariant = 'default'
        else if (type === 'Business') badgeVariant = 'outline'
        return <Badge variant={badgeVariant}>{type}</Badge>
      }
    }),
    columnHelper.accessor("signedUp", {
      header: "Signed up",
    }),
    columnHelper.accessor("source", {
      header: "Source",
    }),
    columnHelper.accessor("companies", {
      header: "Companies",
    }),
    columnHelper.accessor("orders", {
      header: "Orders",
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status")
        const isActive = status === 'Active'
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
            isActive
              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
              : "bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
            {status}
          </span>
        )
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
      columnKey: "type",
      placeholder: "Types",
      options: [
        { label: "Individual", value: "Individual" },
        { label: "Business", value: "Business" },
        { label: "B2B", value: "B2B" },
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
          <p className="text-muted-foreground text-sm mt-1">Normal website customers and B2B portal accounts.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <IconUserPlus className="mr-2 h-4 w-4" />
          Create Customer
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={customers}
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
