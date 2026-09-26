import React, { useState, useEffect, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SectionCards } from "../../Layout/StatsCard"
import FileAccount from "./FileAcount"
import ViewAccount from "./ViewAccount"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import DeleteConfirmation from "../../components/DeleteConfirmation"
import {
  IconDotsVertical,
  IconArrowsSort,
  IconBook,
  IconRefresh,
  IconEye,
  IconCheck,
  IconAlertTriangle,
  IconFileCheck,
  IconPlus,
  IconBuildingBank,
  IconFileText
} from "@tabler/icons-react"
import { toast } from "sonner"

const columnHelper = createColumnHelper()

const fallbackFilings = [
  {
    id: 1,
    company_name: "52 ALDERLEY ROAD LLP",
    company_number: "OC385142",
    owner_name: "Brixen Admin",
    has_address: true,
    idv_status: "Not started",
    psc_status: "Not started",
    issues_count: 4,
    year_end: "31/05/2024",
    due_date: "28/02/2025",
    type: "Micro-entity",
    status: "Overdue"
  },
  {
    id: 2,
    company_name: "A.J.B. FLOORING LIMITED",
    company_number: "04832315",
    owner_name: "Andrew John Bendell",
    has_address: true,
    idv_status: "Not started",
    psc_status: "Not started",
    issues_count: 4,
    year_end: "31/07/2024",
    due_date: "30/04/2025",
    type: "Micro-entity",
    status: "Overdue"
  },
  {
    id: 3,
    company_name: "ABBAS & SONS ENTERPRISES LTD",
    company_number: "15915437",
    owner_name: "Sivilija Puidokaite",
    has_address: true,
    idv_status: "Not started",
    psc_status: "Not started",
    issues_count: 4,
    year_end: "31/08/2024",
    due_date: "31/05/2026",
    type: "Micro-entity",
    status: "Overdue"
  },
  {
    id: 4,
    company_name: "ACCOUNTS & PAYROLL TRAINING LTD",
    company_number: "04926953",
    owner_name: "Helen Mary Piper",
    has_address: true,
    idv_status: "Not started",
    psc_status: "Not started",
    issues_count: 4,
    year_end: "31/10/2024",
    due_date: "31/07/2025",
    type: "Micro-entity",
    status: "Overdue"
  },
  {
    id: 5,
    company_name: "AHMAD ZEESHAN ECOM LTD",
    company_number: "16852141",
    owner_name: "Khurram Uz Zaman Amjad",
    has_address: true,
    idv_status: "Not started",
    psc_status: "Not started",
    issues_count: 3,
    year_end: "30/11/2025",
    due_date: "31/08/2027",
    type: "Micro-entity",
    status: "Not Started"
  },
  {
    id: 6,
    company_name: "AHZ HUB LIMITED",
    company_number: "NI738262",
    owner_name: "Kirstie Louise Beard",
    has_address: true,
    idv_status: "Not started",
    psc_status: "Not started",
    issues_count: 3,
    year_end: "28/02/2026",
    due_date: "30/11/2027",
    type: "Micro-entity",
    status: "Not Started"
  }
]

const fallbackAccounts = [
  { id: 1, company_name: "52 ALDERLEY ROAD LLP", period: "2024-2025", type: "Micro-entity Balance Sheet", status: "Draft", turnover: "£45,000", net_profit: "£18,200" },
  { id: 2, company_name: "A.J.B. FLOORING LIMITED", period: "2024-2025", type: "Micro-entity Balance Sheet", status: "Ready to File", turnover: "£112,400", net_profit: "£34,150" },
  { id: 3, company_name: "ABBAS & SONS ENTERPRISES LTD", period: "2024-2025", type: "Dormant Accounts", status: "Filed", turnover: "£0", net_profit: "£0" },
]

const fallbackHMRC = [
  { id: 1, company_name: "52 ALDERLEY ROAD LLP", utr: "9876543210", period: "01/06/2024 - 31/05/2025", tax_due: "£3,458.00", status: "Pending Calculation" },
  { id: 2, company_name: "A.J.B. FLOORING LIMITED", utr: "8765432109", period: "01/08/2024 - 31/07/2025", tax_due: "£6,488.50", status: "Payment Due" },
  { id: 3, company_name: "ABBAS & SONS ENTERPRISES LTD", utr: "7654321098", period: "01/09/2024 - 31/08/2025", tax_due: "£0.00", status: "Nil Return Filed" },
]

const Accountancy = () => {
  const [activeTab, setActiveTab] = useState('filing-status')
  const [filings, setFilings] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Metrics KPI state
  const [metrics, setMetrics] = useState({
    overdue: 67,
    due_in_60_days: 4,
    in_progress: 0,
    issues: 162,
    filed: 0
  })

  // Modal Dialogs
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [isFileModalOpen, setIsFileModalOpen] = useState(false)
  const [isBooksModalOpen, setIsBooksModalOpen] = useState(false)
  const [filingType, setFilingType] = useState('Micro-entity')
  const [recordToDelete, setRecordToDelete] = useState(null)
  const [bulkDeleteRows, setBulkDeleteRows] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadAccountancyData = async () => {
    setIsLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${apiUrl}/api/accountancy/filings`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === "success" && data.data) {
          if (Array.isArray(data.data.filings) && data.data.filings.length > 0) {
            setFilings(data.data.filings)
          } else {
            setFilings(fallbackFilings)
          }
          if (data.data.metrics) {
            setMetrics({
              overdue: data.data.metrics.overdue || 67,
              due_in_60_days: data.data.metrics.due_in_60_days || 4,
              in_progress: data.data.metrics.in_progress || 0,
              issues: data.data.metrics.issues || 162,
              filed: data.data.metrics.filed || 0
            })
          }
          return
        }
      }
      setFilings(fallbackFilings)
    } catch (err) {
      console.error("Failed to load accountancy filings:", err)
      setFilings(fallbackFilings)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAccountancyData()
  }, [])

  // ── TanStack Table Column Definitions (Filing Status) ───────────────
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
    columnHelper.accessor("company_name", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Company
          <IconArrowsSort className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex flex-col">
            <button
              type="button"
              className="text-left font-medium text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
              onClick={() => {
                setSelectedRecord(item)
                setIsBooksModalOpen(true)
              }}
            >
              {item.company_name}
            </button>
            <span className="text-xs font-mono text-muted-foreground mt-0.5">{item.company_number}</span>
          </div>
        )
      },
    }),
    columnHelper.accessor("owner_name", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Owner
          <IconArrowsSort className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="text-sm">{row.getValue("owner_name")}</span>,
    }),
    columnHelper.accessor("has_address", {
      header: "Address",
      cell: () => (
        <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
          On file
        </Badge>
      ),
    }),
    columnHelper.accessor("idv_status", {
      header: "IDV",
      cell: ({ row }) => {
        const idv = row.getValue("idv_status")
        return idv === 'Verified' ? (
          <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
            Verified
          </Badge>
        ) : (
          <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {idv}
          </Badge>
        )
      },
    }),
    columnHelper.accessor("psc_status", {
      header: "PSC",
      cell: ({ row }) => {
        const psc = row.getValue("psc_status")
        return psc === 'Verified' ? (
          <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
            Verified
          </Badge>
        ) : (
          <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
            {psc}
          </Badge>
        )
      },
    }),
    columnHelper.accessor("issues_count", {
      header: "Issues",
      cell: ({ row }) => {
        const count = row.getValue("issues_count")
        return count > 0 ? (
          <Badge className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
            {count} block
          </Badge>
        ) : (
          <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
            0 issues
          </Badge>
        )
      },
    }),
    columnHelper.accessor("year_end", {
      header: "Year End",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.getValue("year_end")}</span>,
    }),
    columnHelper.accessor("due_date", {
      header: "Due",
      cell: ({ row }) => <span className="text-xs font-semibold text-foreground">{row.getValue("due_date")}</span>,
    }),
    columnHelper.accessor("type", {
      header: "Type",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.getValue("type")}</span>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status")
        if (status === 'Overdue') {
          return (
            <Badge className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
              Overdue
            </Badge>
          )
        }
        if (status === 'Filed') {
          return (
            <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
              Filed
            </Badge>
          )
        }
        if (status === 'Due Soon') {
          return (
            <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              Due Soon
            </Badge>
          )
        }
        return (
          <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            {status}
          </Badge>
        )
      },
    }),
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        const item = row.original
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
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedRecord(item)
                    setIsBooksModalOpen(true)
                  }}
                >
                  View Books
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedRecord(item)
                    setIsFileModalOpen(true)
                  }}
                >
                File Accounts
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setRecordToDelete(item)}
              >
                Remove Record
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ], [])

  // Filter configuration matching Customers.jsx structure
  const accountancyFilterConfig = [
    {
      columnKey: "status",
      placeholder: "Status",
      options: [
        { label: "Overdue", value: "Overdue" },
        { label: "Due Soon", value: "Due Soon" },
        { label: "Not Started", value: "Not Started" },
        { label: "Filed", value: "Filed" },
      ]
    },
    {
      columnKey: "type",
      placeholder: "Filing Types",
      options: [
        { label: "Micro-entity", value: "Micro-entity" },
        { label: "Dormant", value: "Dormant" },
        { label: "Full Accounts", value: "Full Accounts" },
      ]
    },
    {
      columnKey: "idv_status",
      placeholder: "IDV Status",
      options: [
        { label: "Verified", value: "Verified" },
        { label: "Not started", value: "Not started" },
      ]
    }
  ]

  const confirmSingleDelete = () => {
    toast.success(`Record for "${recordToDelete?.company_name}" removed.`)
    setFilings(prev => prev.filter(f => f.id !== recordToDelete?.id))
    setRecordToDelete(null)
  }

  const confirmBulkDelete = () => {
    if (!bulkDeleteRows) return
    const ids = bulkDeleteRows.map(r => r.original.id)
    setFilings(prev => prev.filter(f => !ids.includes(f.id)))
    toast.success(`Removed ${ids.length} selected filing record(s).`)
    setBulkDeleteRows(null)
  }

  // Compute stats data for SectionCards
  const stats = useMemo(() => [
    {
      title: "OVERDUE",
      value: metrics.overdue,
    },
    {
      title: "DUE IN 60 DAYS",
      value: metrics.due_in_60_days,
    },
    {
      title: "IN PROGRESS",
      value: metrics.in_progress,
    },
    {
      title: "ISSUES",
      value: metrics.issues,
    },
    {
      title: "FILED",
      value: metrics.filed,
    },
  ], [metrics])

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ── Page Header (Identical to Customers.jsx layout) ────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Accountancy</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Companies House Annual Accounts, Micro-entity filing status & HMRC Corporation Tax.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={loadAccountancyData}
            disabled={isLoading}
          >
            <IconRefresh className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setSelectedRecord(filings[0] || null)
              setIsFileModalOpen(true)
            }}
          >
            <IconPlus className="mr-2 h-4 w-4" />
            File Accounts
          </Button>
        </div>
      </div>

      {/* ── Tabs Navigation ────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/60 p-1 rounded-xl mb-4">
          <TabsTrigger value="filing-status" className="rounded-lg px-4 py-2 font-medium text-sm">
            Filing status
          </TabsTrigger>
          <TabsTrigger value="company-accounts" className="rounded-lg px-4 py-2 font-medium text-sm">
            Company Accounts
          </TabsTrigger>
          <TabsTrigger value="hmrc" className="rounded-lg px-4 py-2 font-medium text-sm">
            HMRC
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════
            TAB 1: FILING STATUS
        ════════════════════════════════════════════════════════════ */}
        <TabsContent value="filing-status" className="space-y-6 m-0">
          {/* Top 5 KPI SectionCards */}
          <SectionCards stats={stats} isLoading={isLoading} />

          {/* TanStack DataTable (Exact same as Customers.jsx) */}
          <DataTable
            columns={columns}
            data={filings}
            filterConfig={accountancyFilterConfig}
            isLoading={isLoading}
            onDeleteSelected={(rows) => setBulkDeleteRows(rows)}
          />
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════
            TAB 2: COMPANY ACCOUNTS
        ════════════════════════════════════════════════════════════ */}
        <TabsContent value="company-accounts" className="space-y-6 m-0">
          <Card className="shadow-none border border-border/70 rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">Company Balance Sheets & Profit/Loss</h3>
                  <p className="text-sm text-muted-foreground">Detailed accounting statements ready for year-end submission.</p>
                </div>
              </div>
              <div className="divide-y divide-border">
                {fallbackAccounts.map(acc => (
                  <div key={acc.id} className="py-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{acc.company_name}</p>
                      <p className="text-xs text-muted-foreground">{acc.type} • Period {acc.period}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Turnover</p>
                        <p className="font-mono font-semibold">{acc.turnover}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Net Profit</p>
                        <p className="font-mono font-bold text-emerald-600">{acc.net_profit}</p>
                      </div>
                      <Badge variant={acc.status === 'Filed' ? 'default' : 'secondary'}>
                        {acc.status}
                      </Badge>
                      <Button variant="outline" size="sm" className="h-8">
                        View Statement
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════
            TAB 3: HMRC
        ════════════════════════════════════════════════════════════ */}
        <TabsContent value="hmrc" className="space-y-6 m-0">
          <Card className="shadow-none border border-border/70 rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">HMRC Corporation Tax Returns (CT600)</h3>
                  <p className="text-sm text-muted-foreground">Track UTR numbers, tax computations, and payment obligations.</p>
                </div>
              </div>
              <div className="divide-y divide-border">
                {fallbackHMRC.map(h => (
                  <div key={h.id} className="py-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{h.company_name}</p>
                      <p className="text-xs font-mono text-muted-foreground">UTR: {h.utr} • Period: {h.period}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Tax Liability</p>
                        <p className="font-mono font-bold text-foreground">{h.tax_due}</p>
                      </div>
                      <Badge variant={h.status.includes('Filed') ? 'default' : 'secondary'}>
                        {h.status}
                      </Badge>
                      <Button variant="outline" size="sm" className="h-8">
                        Calculate CT600
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── File Accounts Modal ──────────────────────────────────── */}
      {selectedRecord && (
        <FileAccount
          isOpen={isFileModalOpen}
          onClose={() => setIsFileModalOpen(false)}
          company={selectedRecord}
          onFileSubmitted={() => loadAccountancyData()}
        />
      )}

      {/* ── View Account / Books Workspace Modal ──────────────────── */}
      {selectedRecord && (
        <ViewAccount
          isOpen={isBooksModalOpen}
          onClose={() => setIsBooksModalOpen(false)}
          company={selectedRecord}
          onProceedToFile={(comp) => {
            setSelectedRecord(comp)
            setIsFileModalOpen(true)
          }}
        />
      )}

      {/* ── Single Delete Confirmation Dialog ────────────────────────── */}
      <DeleteConfirmation
        isOpen={!!recordToDelete}
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmSingleDelete}
        title="Remove Filing Record"
        description={`This will remove the filing track record for "${recordToDelete?.company_name}".`}
        confirmText="Remove"
        isLoading={isDeleting}
      />

      {/* ── Bulk Delete Confirmation Dialog ──────────────────────────── */}
      <DeleteConfirmation
        isOpen={!!bulkDeleteRows}
        onClose={() => setBulkDeleteRows(null)}
        onConfirm={confirmBulkDelete}
        title="Remove Selected Records"
        description="This will remove the selected company filing track records."
        confirmText={`Remove (${bulkDeleteRows?.length || 0})`}
        isLoading={isDeleting}
      />
    </div>
  )
}

export default Accountancy
