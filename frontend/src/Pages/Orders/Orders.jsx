import React, { useState, useMemo, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import { SectionCards } from "../../Layout/StatsCard"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  IconArrowsSort,
  IconPlus,
  IconFileInvoice,
  IconPencil,
  IconFolderOpen,
  IconTrash,
  IconInfoCircle,
  IconChevronDown,
  IconChevronUp,
  IconDotsVertical
} from "@tabler/icons-react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

const columnHelper = createColumnHelper()

const mockData = [
  {
    id: 1,
    orderNum: '#GB15335',
    date: '28/09/26',
    ownerName: 'Ishrat Sajjad',
    ownerEmail: 'Clockcarkltd@gmail.com',
    company: 'CLOCK CARK LTD',
    products: [{ name: 'Tide', color: 'teal' }],
    price: '£50',
    payment: 'PKR',
    status: '100%',
    statusColor: 'green'
  },
  {
    id: 2,
    orderNum: '#GB15334',
    date: '28/09/26',
    ownerName: 'Ahmed Shahid',
    ownerEmail: 'jareenaqvi2@gmail.com',
    company: 'FLIP ELEVATE LTD',
    products: [
      { name: 'AD01 Form', color: 'blue' },
      { name: 'Registered Office Address', color: 'pink' },
      { name: 'KYC', color: 'green' }
    ],
    price: '£80',
    payment: 'PKR',
    status: '0%',
    statusColor: 'blue'
  },
  {
    id: 3,
    orderNum: '#GB15333',
    date: '23/09/26',
    ownerName: 'Syed Khadim Hussain Shah',
    ownerEmail: 'syedkhadimhussain@outlook.com',
    company: 'ONLINE SWITCH LTD',
    products: [{ name: 'Confirmation', color: 'gray' }],
    price: '£70',
    payment: 'PKR',
    status: '100%',
    statusColor: 'green'
  },
  {
    id: 4,
    orderNum: '#GB15332',
    date: '23/09/26',
    ownerName: 'Muhammad Imran Aslam',
    ownerEmail: 'inprotelltd@gmail.com',
    company: 'INPROTEL LTD',
    products: [{ name: 'Confirmation', color: 'gray' }],
    price: '£70',
    payment: 'PKR',
    status: '100%',
    statusColor: 'green'
  },
  {
    id: 5,
    orderNum: '#GB15331',
    date: '23/09/26',
    ownerName: 'Muhammad Rohan Nasim',
    ownerEmail: 'Rohanltdduk01@gmail.com',
    company: 'ROHAN DEALS LTD',
    products: [{ name: 'Tide', color: 'teal' }],
    price: '£0',
    payment: 'GBP',
    status: '100%',
    statusColor: 'green'
  }
];

const Orders = () => {
  const [orders, setOrders] = useState(mockData)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('All Orders')
  const [companyOptions, setCompanyOptions] = useState([])

  // Update an editable field in-place so inline edits persist across re-renders
  const updateOrderField = React.useCallback((id, field, value) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)))
  }, [])

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '/api'
        const token = localStorage.getItem('token')
        const res = await fetch(`${apiUrl}/admin/companies?limit=500`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (res.ok) {
          const data = await res.json()
          const rawList = data.companies || data.data?.companies || (Array.isArray(data.data) ? data.data : []) || []
          if (Array.isArray(rawList)) {
            const opts = rawList.map(c => ({
              label: c.company_name || c.name || 'Unknown',
              value: c.company_name || c.name || c.id
            }))
            opts.sort((a, b) => a.label.localeCompare(b.label))
            setCompanyOptions(opts)
          }
        }
      } catch (err) {
        console.error("Failed to load companies for filter", err)
      }
    }
    fetchCompanies()
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
    columnHelper.accessor("orderNum", {
      header: "ORDER #",
      cell: ({ row }) => (
        <Badge className="badge-sky rounded-full cursor-pointer">
          {row.getValue("orderNum")}
        </Badge>
      ),
    }),
    columnHelper.accessor("ownerName", {
      header: "OWNER",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm text-foreground">{row.original.ownerName}</span>
          <span className="text-xs text-muted-foreground">{row.original.ownerEmail}</span>
        </div>
      ),
    }),
    columnHelper.accessor("company", {
      header: "COMPANY",
      cell: ({ row }) => <span className=" text-xs">{row.getValue("company")}</span>,
    }),
    columnHelper.accessor("products", {
      header: "PRODUCT",
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue) return true
        const products = row.getValue(columnId) || []
        return products.some((p) => p.name === filterValue)
      },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5 max-w-[250px]">
          {row.original.products.map((p, idx) => {
            let badgeClass = "badge-sky";
            if (p.color === 'teal' || p.color === 'green') badgeClass = "badge-green";
            if (p.color === 'pink') badgeClass = "badge-purple";
            if (p.color === 'gray') badgeClass = "bg-muted text-muted-foreground";

            return (
              <Badge key={idx} className={badgeClass}>
                <span className="w-1 h-1 rounded-full bg-current mr-1.5 opacity-60"></span>
                {p.name}
              </Badge>
            )
          })}
        </div>
      ),
    }),
    columnHelper.accessor("date", {
      header: "DATE",
      cell: ({ row }) => <span className="font-medium text-xs text-muted-foreground">{row.getValue("date")}</span>,
    }),
    columnHelper.accessor("price", {
      header: "PRICE",
      cell: ({ row }) => (
        <Input
          value={row.original.price}
          onChange={(e) => updateOrderField(row.original.id, "price", e.target.value)}
          className="h-8 w-20 text-sm font-bold bg-transparent"
        />
      ),
    }),
    columnHelper.accessor("payment", {
      header: "PAYMENT",
      filterFn: (row, columnId, filterValue) =>
        !filterValue || row.getValue(columnId) === filterValue,
      cell: ({ row }) => (
        <Select
          value={row.original.payment}
          onValueChange={(val) => updateOrderField(row.original.id, "payment", val)}
        >
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent className="w-24">
            <SelectGroup>
              <SelectItem value="PKR">PKR</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
              <SelectItem value="Website">Website</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      ),
    }),
    columnHelper.accessor("status", {
      header: "STATUS",
      filterFn: (row, columnId, filterValue) =>
        !filterValue || row.getValue(columnId) === filterValue,
      cell: ({ row }) => {
        const color = row.original.statusColor;
        if (color === 'green') return <Badge className="badge-green">{row.getValue("status")}</Badge>;
        if (color === 'blue') return <Badge className="badge-sky">{row.getValue("status")}</Badge>;

        return <Badge variant="secondary">{row.getValue("status")}</Badge>;
      }
    }),
    columnHelper.display({
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <IconDotsVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View Details</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }),
  ], [updateOrderField])

  // Build product/status filter options from the actual data so filters always match
  const productOptions = useMemo(() => {
    const names = new Set()
    orders.forEach((o) => (o.products || []).forEach((p) => p?.name && names.add(p.name)))
    return Array.from(names).sort().map((name) => ({ label: name, value: name }))
  }, [orders])

  const statusOptions = useMemo(() => {
    const values = new Set()
    orders.forEach((o) => o?.status && values.add(o.status))
    return Array.from(values).sort().map((s) => ({ label: s, value: s }))
  }, [orders])

  const filterConfig = [
    {
      columnKey: "company",
      placeholder: "Company name",
      options: companyOptions
    },
    {
      columnKey: "status",
      placeholder: "Status",
      options: statusOptions
    },
    {
      columnKey: "products",
      placeholder: "Product",
      options: productOptions
    },
    {
      columnKey: "payment",
      placeholder: "Payment",
      options: [
        { label: "PKR", value: "PKR" },
        { label: "GBP", value: "GBP" },
        { label: "Website", value: "Website" },
      ]
    }
  ];

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Orders Manager</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage all client orders and quick CRM orders.</p>
        </div>
        <div className="flex gap-2">
          <Button>
            <IconPlus className="mr-2 h-4 w-4" />
            Create Order
          </Button>
          <Button variant="outline">
            <IconFileInvoice className="mr-2 h-4 w-4" />
            Quick CRM Order
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <SectionCards
        stats={[
          { title: 'Total Orders', value: '24' },
          { title: 'Pending', value: '0' },
          { title: 'In Progress', value: '6' },
          { title: 'Completed', value: '18' },
          { title: 'Total Revenue', value: '£2160.00' },
        ]}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-9 bg-background">
          <TabsTrigger value="All Orders" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">All Orders</TabsTrigger>
          <TabsTrigger value="Customers" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Customers</TabsTrigger>
          <TabsTrigger value="B2B Clients" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">B2B Clients</TabsTrigger>
        </TabsList>
      </Tabs>



      {/* Table */}
      <DataTable
        columns={columns}
        data={orders}
        filterConfig={filterConfig}
        isLoading={isLoading}
      />
    </div>
  )
}

export default Orders
