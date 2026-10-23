

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
  IconRefresh,
  IconEye,
  IconCheck,
  IconAlertTriangle,
  IconPlus,
  IconBuildingBank,
  IconFileText
} from "@tabler/icons-react"
import { toast } from "sonner"
import { toastUndoableDelete, toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { apiRequest, getApiBase, toastApiEmpty } from "@/lib/api"

const columnHelper = createColumnHelper()

const Accountancy = () => {
  const [activeTab, setActiveTab] = useState('filing-status')
  const [filings, setFilings] = useState([])
  const [companyAccounts, setCompanyAccounts] = useState([])
  const [hmrcData, setHmrcData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

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
    setLoadError(null)
    try {
      const res = await apiRequest('/admin/accountancy', { label: 'Accountancy filings' })
      if (!res.ok) {
        setFilings([])
        setLoadError(res.reason)
        return
      }

      const data = res.data
      if (data?.data) {
        const list = Array.isArray(data.data.filings) ? data.data.filings : []
        setFilings(list)
        if (data.data.metrics) {
          setMetrics({
            overdue: data.data.metrics.overdue || 0,
            due_in_60_days: data.data.metrics.due_in_60_days || 0,
            in_progress: data.data.metrics.in_progress || 0,
            issues: data.data.metrics.issues || 0,
            filed: data.data.metrics.filed || 0
          })
        }
        if (list.length === 0) {
          toastApiEmpty('Accountancy filings', getApiBase())
        }
      }

      const accRes = await apiRequest('/admin/accountancy/company-accounts', {
        label: 'Company accounts',
        silent: true,
      })
      if (accRes.ok && Array.isArray(accRes.data?.data?.accounts)) {
        setCompanyAccounts(accRes.data.data.accounts)
      } else if (!accRes.ok) {
        toast.error('Company accounts tab failed to load', {
          description: accRes.reason,
          duration: 8000,
        })
      }

      const hmrcRes = await apiRequest('/admin/accountancy/hmrc', {
        label: 'HMRC CT600',
        silent: true,
      })
      if (hmrcRes.ok && Array.isArray(hmrcRes.data?.data?.ct600)) {
        setHmrcData(hmrcRes.data.data.ct600)
      } else if (!hmrcRes.ok) {
        toast.error('HMRC tab failed to load', {
          description: hmrcRes.reason,
          duration: 8000,
        })
      }
    } catch (err) {
      console.error("Failed to load accountancy filings:", err)
      setFilings([])
      setLoadError(err?.message || 'Unexpected error')
      toast.error('Accountancy failed to load', {
        description: err?.message || 'Unexpected error',
        duration: 8000,
      })
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
            <span className="text-sm text-muted-foreground mt-0.5">{item.company_number}</span>
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
      cell: ({ row }) => <span className="text-sm">{row.getValue("owner_name") || "Client"}</span>,
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
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue("year_end")}</span>,
    }),
    columnHelper.accessor("due_date", {
      header: "Due",
      cell: ({ row }) => <span className="text-sm font-semibold text-foreground">{row.getValue("due_date")}</span>,
    }),
    columnHelper.accessor("type", {
      header: "Type",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue("type")}</span>,
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
              <Button variant="ghost" className="h-7 w-7 p-0">
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
                Reset Filing
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ], [])

  // ── TanStack Table Columns (Company Accounts) ───────────────────────
  const companyAccountsColumns = useMemo(() => [
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
        const targetComp = filings.find(f => f.id === (item.company_id || item.id)) || item
        return (
          <div className="flex flex-col">
            <button
              type="button"
              className="text-left font-medium text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
              onClick={() => {
                setSelectedRecord(targetComp)
                setIsBooksModalOpen(true)
              }}
            >
              {item.company_name}
            </button>
            <span className="text-sm text-muted-foreground mt-0.5">
              {item.type || "Micro-entity Balance Sheet"} • Period {item.period || "2024-2025"}
            </span>
          </div>
        )
      },
    }),
    columnHelper.accessor("period", {
      header: "Period",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue("period") || "2024-2025"}</span>,
    }),
    columnHelper.accessor("turnover", {
      header: "Turnover",
      cell: ({ row }) => <span className="text-sm font-semibold text-foreground">{row.getValue("turnover") || "£0.00"}</span>,
    }),
    columnHelper.accessor("net_profit", {
      header: "Net Profit",
      cell: ({ row }) => <span className="text-sm font-bold text-emerald-600">{row.getValue("net_profit") || "£0.00"}</span>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") || "Draft"
        if (status === 'Filed') {
          return (
            <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
              Filed
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
        const targetComp = filings.find(f => f.id === (item.company_id || item.id)) || item
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm font-medium"
              onClick={() => {
                setSelectedRecord(targetComp)
                setIsBooksModalOpen(true)
              }}
            >
              View Statement & Books
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-7 w-7 p-0">
                  <span className="sr-only">Open menu</span>
                  <IconDotsVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedRecord(targetComp)
                      setIsBooksModalOpen(true)
                    }}
                  >
                    View Books
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedRecord(targetComp)
                      setIsFileModalOpen(true)
                    }}
                  >
                    File Accounts
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    }),
  ], [filings])

  // ── TanStack Table Columns (HMRC CT600) ──────────────────────────────
  const hmrcColumns = useMemo(() => [
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
        const targetComp = filings.find(f => f.id === (item.company_id || item.id)) || item
        return (
          <div className="flex flex-col">
            <button
              type="button"
              className="text-left font-medium text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
              onClick={() => {
                setSelectedRecord(targetComp)
                setIsBooksModalOpen(true)
              }}
            >
              {item.company_name}
            </button>
            <span className="text-sm text-muted-foreground mt-0.5">
              UTR: {item.utr || "9876543210"} • Period: {item.period || "01/06/2024 - 31/05/2025"}
            </span>
          </div>
        )
      },
    }),
    columnHelper.accessor("utr", {
      header: "UTR Number",
      cell: ({ row }) => <span className="text-sm font-mono text-muted-foreground">{row.getValue("utr") || "N/A"}</span>,
    }),
    columnHelper.accessor("tax_due", {
      header: "Tax Liability",
      cell: ({ row }) => <span className="text-sm font-bold text-foreground">{row.getValue("tax_due") || "£0.00"}</span>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") || "Pending Calculation"
        if (status.includes('Filed') || status === 'Nil Return Filed') {
          return (
            <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
              {status}
            </Badge>
          )
        }
        if (status === 'Dissolved') {
          return (
            <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              Dissolved
            </Badge>
          )
        }
        if (status === 'Strike off proposed') {
          return (
            <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Strike off proposed
            </Badge>
          )
        }
        return (
          <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {status}
          </Badge>
        )
      },
    }),
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        const item = row.original
        const targetComp = filings.find(f => f.id === (item.company_id || item.id)) || item
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm font-medium"
              onClick={() => {
                setSelectedRecord(targetComp)
                setIsBooksModalOpen(true)
              }}
            >
              Calculate CT600
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-7 w-7 p-0">
                  <span className="sr-only">Open menu</span>
                  <IconDotsVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedRecord(targetComp)
                      setIsBooksModalOpen(true)
                    }}
                  >
                    View Books
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedRecord(targetComp)
                      setIsFileModalOpen(true)
                    }}
                  >
                    File Accounts
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    }),
  ], [filings])

  // Filter configurations
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

  const companyAccountsFilterConfig = [
    {
      columnKey: "status",
      placeholder: "Status",
      options: [
        { label: "Draft", value: "Draft" },
        { label: "Filed", value: "Filed" },
        { label: "Ready to file", value: "Ready to file" },
      ]
    },
    {
      columnKey: "type",
      placeholder: "Account Type",
      options: [
        { label: "Micro-entity Balance Sheet", value: "Micro-entity Balance Sheet" },
        { label: "Full Accounts", value: "Full Accounts" },
        { label: "Dormant", value: "Dormant" },
      ]
    }
  ]

  const hmrcFilterConfig = [
    {
      columnKey: "status",
      placeholder: "Status",
      options: [
        { label: "Pending Calculation", value: "Pending Calculation" },
        { label: "Nil Return Filed", value: "Nil Return Filed" },
        { label: "Payment Due", value: "Payment Due" },
        { label: "Dissolved", value: "Dissolved" },
        { label: "Strike off proposed", value: "Strike off proposed" },
      ]
    }
  ]

  // Prepared data with guaranteed unique IDs
  const companyAccountsData = useMemo(() => {
    const list = companyAccounts.length > 0 ? companyAccounts : filings
    return list.map((acc, index) => ({
      ...acc,
      id: acc.id || acc.company_id || `acc-${index}`,
      company_id: acc.company_id || acc.id || index,
      period: acc.period || "2024-2025",
      type: acc.type || "Micro-entity Balance Sheet",
      turnover: acc.turnover || "£0.00",
      net_profit: acc.net_profit || "£0.00",
      status: acc.status || "Draft",
    }))
  }, [companyAccounts, filings])

  const hmrcTableData = useMemo(() => {
    const list = hmrcData.length > 0 ? hmrcData : filings
    return list.map((h, index) => ({
      ...h,
      id: h.id || h.company_id || `hmrc-${index}`,
      company_id: h.company_id || h.id || index,
      utr: h.utr || h.utr_number || "9876543210",
      period: h.period || "01/06/2024 - 31/05/2025",
      tax_due: h.tax_due || h.tax_liability || "£0.00",
      status: h.status || (h.company_status === 'Dissolved' ? 'Dissolved' : 'Pending Calculation'),
    }))
  }, [hmrcData, filings])

  const confirmSingleDelete = () => {
    if (!recordToDelete) return
    const victim = recordToDelete
    const snapshot = filings
    setRecordToDelete(null)
    setIsDeleting(false)
    setFilings((prev) => prev.filter((f) => f.id !== victim.id))

    toastUndoableDelete({
      message: `Filing reset for "${victim.company_name}"`,
      description: 'Undo available for a few seconds',
      onUndo: () => setFilings(snapshot),
      onCommit: async () => {
        const res = await apiRequest(`/admin/accountancy/${victim.id}`, {
          method: 'DELETE',
          label: 'Reset filing',
          silent: true,
        })
        if (!res.ok) throw new Error(res.reason || 'Failed to reset filing')
      },
    })
  }

  const confirmBulkDelete = () => {
    if (!bulkDeleteRows || bulkDeleteRows.length === 0) return
    const ids = bulkDeleteRows.map((r) => r.original.id)
    const idSet = new Set(ids)
    const snapshot = filings
    setBulkDeleteRows(null)
    setIsDeleting(false)
    setFilings((prev) => prev.filter((f) => !idSet.has(f.id)))

    toastUndoableDelete({
      message: `${ids.length} filing record(s) reset`,
      description: 'Undo available for a few seconds',
      onUndo: () => setFilings(snapshot),
      onCommit: async () => {
        const res = await apiRequest('/admin/accountancy/bulk-delete', {
          method: 'POST',
          label: 'Bulk reset filings',
          body: JSON.stringify({ ids }),
          silent: true,
        })
        if (!res.ok) throw new Error(res.reason || 'Bulk reset failed')
      },
    })
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
          <DataTable
            columns={companyAccountsColumns}
            data={companyAccountsData}
            filterConfig={companyAccountsFilterConfig}
            isLoading={isLoading}
            searchPlaceholder="Search company accounts..."
            onDeleteSelected={(rows) => setBulkDeleteRows(rows)}
          />
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════
            TAB 3: HMRC
        ════════════════════════════════════════════════════════════ */}
        <TabsContent value="hmrc" className="space-y-6 m-0">
          <DataTable
            columns={hmrcColumns}
            data={hmrcTableData}
            filterConfig={hmrcFilterConfig}
            isLoading={isLoading}
            searchPlaceholder="Search HMRC CT600 filings..."
            onDeleteSelected={(rows) => setBulkDeleteRows(rows)}
          />
        </TabsContent>
      </Tabs>

      {/* ── File Accounts Modal ──────────────────────────────────── */}
      <FileAccount
        isOpen={isFileModalOpen}
        onClose={() => setIsFileModalOpen(false)}
        company={selectedRecord}
        companies={filings}
        onFileSubmitted={() => loadAccountancyData()}
      />

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
