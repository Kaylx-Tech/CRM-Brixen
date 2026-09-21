import React, { useState } from 'react'
import { Button } from "@/components/ui/button"
import AddCustomer from "./AddCustomer"
import ViewCustomer from "./ViewCustomer"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import { IconDotsVertical, IconArrowsSort, IconUserPlus } from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const dummyCustomers = [
  { id: 1, name: "John Doe", email: "john@example.com", type: "Normal", signedUp: "Sep 15, 2026", source: "Organic", companies: 0, orders: 2, status: "Active" },
  { id: 2, name: "Acme Corp", email: "billing@acme.com", type: "B2B", signedUp: "Sep 12, 2026", source: "Referral", companies: 1, orders: 15, status: "Active" },
  { id: 3, name: "Jane Smith", email: "jane@example.com", type: "Normal", signedUp: "Sep 10, 2026", source: "Social", companies: 0, orders: 1, status: "Inactive" },
]

const columnHelper = createColumnHelper()

const Customers = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewCustomer, setViewCustomer] = useState(null)

  const columns = React.useMemo(() => [
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
        return <Badge variant={type === 'B2B' ? 'default' : 'secondary'}>{type}</Badge>
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
        return <Badge variant={status === 'Active' ? 'outline' : 'destructive'}>{status}</Badge>
      }
    }),
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <IconDotsVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setViewCustomer(row.original)}>View customer</DropdownMenuItem>
                <DropdownMenuItem>Edit details</DropdownMenuItem>
                <DropdownMenuItem variant='destructive'>Delete</DropdownMenuItem>
              </DropdownMenuGroup>
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
      ]
    },
    {
      columnKey: "signedUp",
      placeholder: "Dates",
      options: [
        // Filtering by date would require complex logic, for demo we just pass exact match strings or "all"
        { label: "Today", value: "Today" },
        { label: "Last 7 days", value: "Last 7 days" },
      ]
    },
    {
      columnKey: "type",
      placeholder: "Types",
      options: [
        { label: "Normal", value: "Normal" },
        { label: "B2B", value: "B2B" },
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
        data={dummyCustomers}
        filterConfig={customerFilterConfig}
      />
     
      <AddCustomer isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      {viewCustomer && (
        <ViewCustomer 
          customer={viewCustomer} 
          isOpen={!!viewCustomer} 
          onClose={() => setViewCustomer(null)} 
        />
      )}
    </div>
  )
}

export default Customers
