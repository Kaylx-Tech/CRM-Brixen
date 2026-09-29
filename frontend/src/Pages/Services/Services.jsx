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
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconPlus, IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react"

const columnHelper = createColumnHelper()

const mockData = [
  {
    id: 1,
    name: 'VAT Registration',
    category: 'Corporate',
    sellPrice: '£150',
    originalPrice: '£50',
    profit: '£100',
    duration: '12 Months',
    status: 'Active'
  },
  {
    id: 2,
    name: 'Company Formation',
    category: 'Corporate',
    sellPrice: '£100',
    originalPrice: '£12',
    profit: '£88',
    duration: 'One Time',
    status: 'Active'
  }
]

const Services = () => {
  const [data, setData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const fetchServices = async () => {
    setIsLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/catalog/services`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (res.ok) {
        const json = await res.json()
        const servicesData = json.data || json
        const formatted = servicesData.map(s => ({
          ...s,
          sellPrice: `£${s.price || 0}`,
          originalPrice: `£${s.originalPrice || 0}`,
          profit: `£${(s.price || 0) - (s.originalPrice || 0)}`
        }))
        setData(formatted)
      } else {
        setData(mockData)
      }
    } catch (err) {
      console.error("Failed to load services", err)
      setData(mockData)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchServices()
  }, [])

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
      cell: ({ row }) => <span className="font-medium text-foreground">{row.getValue("name")}</span>,
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
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <IconDotsVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <IconEdit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
              <IconTrash className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }),
  ], [])

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
          <p className="text-muted-foreground text-sm mt-1">Manage services, prices, and categories.</p>
        </div>
        
        <Button onClick={ () => setIsAddOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
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
      />
    </div>
  )
}

export default Services
