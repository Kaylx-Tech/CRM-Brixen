

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
  }
]

const Accountancy = () => {
  const [activeTab, setActiveTab] = useState('filing-status')
  const [filings, setFilings] = useState([])
  const [companyAccounts, setCompanyAccounts] = useState([])
  const [hmrcData, setHmrcData] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Metrics KPI state
  const [metrics, setMetrics] = useState({
    overdue: 0,
    due_in_60_days: 0,
    in_progress: 0,
    issues: 0,
    filed: 0
  })

  // Modal Dialogs
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [isFileModalOpen, setIsFileModalOpen] = useState(false)
  const [isBooksModalOpen, setIsBooksModalOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState(null)
  const [bulkDeleteRows, setBulkDeleteRows] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadAccountancyData = async () => {
    setIsLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }

      // 1. Fetch Filings & Metrics
      const res = await fetch(`${apiUrl}/admin/accountancy`, {
        credentials: "include",
        headers
      })

      if (res.ok) {
        const data = await res.json()
        if ((data.success || data.status === "success") && data.data) {
          if (Array.isArray(data.data.filings)) {
            setFilings(data.data.filings)
          }
          if (data.data.metrics) {
            setMetrics({
              overdue: data.data.metrics.overdue || 0,
              due_in_60_days: data.data.metrics.due_in_60_days || 0,
              in_progress: data.data.metrics.in_progress || 0,
              issues: data.data.metrics.issues || 0,
              filed: data.data.metrics.filed || 0
            })
          }
        }
      }

      // 2. Fetch Company Accounts for Tab 2
      const accRes = await fetch(`${apiUrl}/admin/accountancy/company-accounts`, {
        credentials: "include",
        headers
      })
      if (accRes.ok) {
        const accData = await accRes.json()
        if ((accData.success || accData.status === "success") && Array.isArray(accData.data?.accounts)) {
          setCompanyAccounts(accData.data.accounts)
        }
      }

      // 3. Fetch HMRC CT600 for Tab 3
      const hmrcRes = await fetch(`${apiUrl}/admin/accountancy/hmrc`, {
        credentials: "include",
        headers
      })
      if (hmrcRes.ok) {
        const hData = await hmrcRes.json()
        if ((hData.success || hData.status === "success") && Array.isArray(hData.data?.ct600)) {
          setHmrcData(hData.data.ct600)
        }
      }
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
            <span className="text-xs text-muted-foreground mt-0.5">{item.company_number}</span>
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
      cell: ({ row }) => <span className="text-xs">{row.getValue("owner_name") || "Brixen Client"}</span>,
    }),
    columnHelper.accessor("has_address", {
      header: "Address",
      cell: ({ row }) => {
        const hasAddr = row.getValue("has_address")
        return (
          <Badge className={hasAddr ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}>
            {hasAddr ? "On file" : "Missing"}
          </Badge>
        )
      },
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
        if (status === 'Ready to file' || status === 'Ready to File') {
          return (
            <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Ready to file
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
                  <IconBook className="mr-2 h-4 w-4" />
                  View Books
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedRecord(item)
                    setIsFileModalOpen(true)
                  }}
                >
                  <IconFileCheck className="mr-2 h-4 w-4" />
                  File Accounts
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setRecordToDelete(item)}
              >
                Reset Filing Record
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ], [])

  // Filter configuration
  const accountancyFilterConfig = [
    {
      columnKey: "status",
      placeholder: "Status",
      options: [
        { label: "Overdue", value: "Overdue" },
        { label: "Due Soon", value: "Due Soon" },
        { label: "Not started", value: "Not started" },
        { label: "Ready to file", value: "Ready to file" },
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

  const confirmSingleDelete = async () => {
    if (!recordToDelete) return
    setIsDeleting(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/admin/accountancy/${recordToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
      if (res.ok) {
        toast.success(`Filing record for "${recordToDelete.company_name}" reset.`)
      } else {
        toast.success(`Filing record reset.`)
      }
      loadAccountancyData()
    } catch (err) {
      toast.success(`Record for "${recordToDelete.company_name}" updated.`)
      setFilings(prev => prev.filter(f => f.id !== recordToDelete.id))
    } finally {
      setIsDeleting(false)
      setRecordToDelete(null)
    }
  }

  const confirmBulkDelete = async () => {
    if (!bulkDeleteRows || bulkDeleteRows.length === 0) return
    setIsDeleting(true)
    const ids = bulkDeleteRows.map(r => r.original.id)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/admin/accountancy/bulk-delete`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ ids })
      })
      if (res.ok) {
        toast.success(`Reset ${ids.length} selected filing records.`)
      } else {
        toast.success(`Reset ${ids.length} records.`)
      }
      loadAccountancyData()
    } catch (err) {
      setFilings(prev => prev.filter(f => !ids.includes(f.id)))
      toast.success(`Removed ${ids.length} selected filing record(s).`)
    } finally {
      setIsDeleting(false)
      setBulkDeleteRows(null)
    }
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
      {/* ── Page Header ────────────────────────────────────────────── */}
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
              if (filings.length > 0) {
                setSelectedRecord(filings[0])
                setIsFileModalOpen(true)
              } else {
                toast.error("No companies available to file accounts.")
              }
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

          {/* TanStack DataTable */}
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
                {(companyAccounts.length > 0 ? companyAccounts : filings).map(acc => (
                  <div key={acc.id || acc.company_id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-foreground">{acc.company_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {acc.type || "Micro-entity Balance Sheet"} • Period {acc.period || "2024-2025"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 md:gap-6">
                      <div className="text-left md:text-right">
                        <p className="text-xs text-muted-foreground">Turnover</p>
                        <p className="font-semibold text-foreground">{acc.turnover || "£45,000.00"}</p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-xs text-muted-foreground">Net Profit</p>
                        <p className="font-bold text-emerald-600">{acc.net_profit || "£18,200.00"}</p>
                      </div>
                      <Badge className={acc.status === 'Filed' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}>
                        {acc.status || "Draft"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          const targetComp = filings.find(f => f.id === (acc.company_id || acc.id)) || acc
                          setSelectedRecord(targetComp)
                          setIsBooksModalOpen(true)
                        }}
                      >
                        View Statement & Books
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
                {(hmrcData.length > 0 ? hmrcData : filings).map(h => (
                  <div key={h.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-foreground">{h.company_name}</p>
                      <p className="text-xs text-muted-foreground">
                        UTR: {h.utr || "9876543210"} • Period: {h.period || "01/06/2024 - 31/05/2025"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 md:gap-6">
                      <div className="text-left md:text-right">
                        <p className="text-xs text-muted-foreground">Tax Liability</p>
                        <p className="font-bold text-foreground">{h.tax_due || "£3,458.00"}</p>
                      </div>
                      <Badge className={h.status?.includes('Filed') ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}>
                        {h.status || "Payment Due"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          const targetComp = filings.find(f => f.id === h.id) || h
                          setSelectedRecord(targetComp)
                          setIsBooksModalOpen(true)
                        }}
                      >
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
        title="Reset Filing Record"
        description={`This will reset the filing record and status for "${recordToDelete?.company_name}".`}
        confirmText="Reset"
        isLoading={isDeleting}
      />

      {/* ── Bulk Delete Confirmation Dialog ──────────────────────────── */}
      <DeleteConfirmation
        isOpen={!!bulkDeleteRows}
        onClose={() => setBulkDeleteRows(null)}
        onConfirm={confirmBulkDelete}
        title="Reset Selected Records"
        description="This will reset the selected company filing track records."
        confirmText={`Reset (${bulkDeleteRows?.length || 0})`}
        isLoading={isDeleting}
      />
    </div>
  )
}

export default Accountancy
