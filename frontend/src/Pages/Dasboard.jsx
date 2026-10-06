import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { SectionCards } from '../Layout/StatsCard'
import { ChartBarMultiple, ChartPieSeparatorNone, ChartAreaSalesTrend, ChartTopPerformer } from '../Layout/Chart'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconCalendarWeek, IconPlus, IconRefresh, IconShoppingBag, IconUserCheck, IconSparkles } from "@tabler/icons-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { apiRequest, getApiBase } from "@/lib/api"

// ==========================================
// Helper Functions for Data Formatting
// ==========================================

// Currency formatting (£ GBP)
const formatCurrency = (val, displayVal) => {
  if (displayVal && typeof displayVal === 'string' && displayVal.trim() !== '') {
    const cleaned = displayVal.replace(/[^\d.,-]/g, '')
    if (cleaned) return `£${cleaned}`
  }
  const num = typeof val === 'number' ? val : parseFloat(val) || 0
  return `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Parse Trend Object from Backend MoM calculation
const getTrend = (trendObj, defaultVal = "+0%") => {
  if (trendObj && typeof trendObj === 'object') {
    return {
      trendValue: trendObj.text || defaultVal,
      trendDirection: trendObj.direction || (trendObj.text && trendObj.text.startsWith('-') ? "down" : "up")
    }
  }
  if (typeof trendObj === 'string') {
    return {
      trendValue: trendObj,
      trendDirection: trendObj.startsWith('-') ? "down" : "up"
    }
  }
  return { trendValue: defaultVal, trendDirection: "up" }
}

// Format Bar Chart Data (Sales Revenue Analytics)
const formatBarChartData = (charts, filter) => {
  if (!charts) return []
  if (filter === "This Year" && Array.isArray(charts.orders_yearly) && charts.orders_yearly.length > 0) {
    return charts.orders_yearly.map(d => ({
      month: d.label,
      revenue: typeof d.revenue === 'number' ? d.revenue : (parseFloat(d.revenue) || 0),
      orders: d.cnt || 0,
    }))
  }
  if (filter === "This Week" && Array.isArray(charts.orders_weekly) && charts.orders_weekly.length > 0) {
    return charts.orders_weekly.map(d => ({
      month: d.label,
      revenue: typeof d.revenue === 'number' ? d.revenue : (parseFloat(d.revenue) || 0),
      orders: d.cnt || 0,
    }))
  }
  if (filter === "This Month" && Array.isArray(charts.orders_daily) && charts.orders_daily.length > 0) {
    return charts.orders_daily.map(d => ({
      month: d.label,
      revenue: typeof d.revenue === 'number' ? d.revenue : (parseFloat(d.revenue) || 0),
      orders: d.cnt || 0,
    }))
  }
  return []
}

// Format Pie Chart Data (Portfolio Distribution)
const formatPortfolioPieData = (breakdown) => {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return []
  return breakdown.map((b, idx) => ({
    category: b.key,
    label: b.label,
    value: b.value || 0,
    pct: b.pct,
    fill: `var(--chart-${(idx % 4) + 1})`
  }))
}

// Format Sales Trend Data (Area Chart)
const formatSalesTrendData = (charts) => {
  if (!charts) return []
  if (Array.isArray(charts.sales_trend) && charts.sales_trend.length > 0) {
    return charts.sales_trend.map(t => ({
      week: t.week,
      online: t.online || 0,
      offline: t.offline || 0,
    }))
  }
  if (Array.isArray(charts.orders_weekly) && charts.orders_weekly.length > 0) {
    return charts.orders_weekly.map(w => ({
      week: w.label,
      online: w.cnt || 0,
      offline: 0,
    }))
  }
  if (Array.isArray(charts.orders_daily) && charts.orders_daily.length > 0) {
    return charts.orders_daily.slice(-10).map(d => ({
      week: `Day ${d.label}`,
      online: d.cnt || 0,
      offline: 0,
    }))
  }
  return []
}

// Format Operational Performance Data (Horizontal Bar)
const formatOperationsData = (rings) => {
  if (!Array.isArray(rings) || rings.length === 0) return []
  return rings.map(r => ({
    team: r.label,
    score: r.pct || r.value || 0
  }))
}

// ==========================================
// Dashboard Component
// ==========================================

const Dashboard = () => {
  const navigate = useNavigate()
  const [selectedMonth, setSelectedMonth] = useState("Current")
  const [barTimeFilter, setBarTimeFilter] = useState("This Year")
  const [dashboardData, setDashboardData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Compute month options dynamically (last 14 months + current + all time)
  const getMonthOptions = () => {
    const options = [{ label: "Current Month", value: "Current" }]
    const now = new Date()
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
      options.push({ label, value: `${year}-${month}` })
    }
    options.push({ label: "All Time", value: "all" })
    return options
  }

  const monthOptions = getMonthOptions()

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true)
    try {
      let query = ""
      if (selectedMonth && selectedMonth.toLowerCase() !== "current") {
        query = `?month=${encodeURIComponent(selectedMonth)}`
      }
      const res = await apiRequest(`/admin/stats${query}`, { label: 'Dashboard stats' })
      if (!res.ok) {
        setDashboardData(null)
        return
      }
      const json = res.data
      const resolved = json?.data && json.data.stats ? json.data : json
      if (resolved && (resolved.status === "success" || resolved.success || resolved.stats)) {
        setDashboardData(resolved)
      } else {
        setDashboardData(null)
        toast.error('Dashboard failed to load', {
          description: `Unexpected response from ${getApiBase()}/admin/stats`,
          duration: 8000,
        })
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err)
      setDashboardData(null)
      toast.error('Dashboard failed to load', {
        description: err?.message || 'Unexpected error',
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // 1. Memoized 5 Top KPI Stats
  const formattedStats = useMemo(() => {
    if (!dashboardData || !dashboardData.stats) return []

    const s = dashboardData.stats
    const salesTrend = getTrend(s.sales_trend, "+0%")
    const revTrend = getTrend(s.revenue_trend, "+0%")
    const custTrend = getTrend(s.customers_trend, "+0%")
    const turnoverTrend = getTrend(s.turnover_trend, "+0%")
    const profitTrend = getTrend(s.profit_trend, "+0%")

    return [
      {
        title: "Total Sales",
        value: String(s.total_orders ?? s.month_orders ?? 0),
        trendValue: salesTrend.trendValue,
        trendDirection: salesTrend.trendDirection,
      },
      {
        title: "Total Customers",
        value: String(s.total_customers ?? 0),
        trendValue: custTrend.trendValue,
        trendDirection: custTrend.trendDirection,
      },
      {
        title: "Total Turnover",
        value: formatCurrency(s.total_turnover, s.total_turnover_display),
        trendValue: turnoverTrend.trendValue,
        trendDirection: turnoverTrend.trendDirection,
      },
      {
        title: "Net Profit",
        value: formatCurrency(s.net_profit, s.net_profit_display),
        trendValue: profitTrend.trendValue,
        trendDirection: profitTrend.trendDirection,
      },
    ]
  }, [dashboardData])

  // 2. Memoized Bar Chart Data
  const barChartData = useMemo(() => {
    return formatBarChartData(dashboardData?.charts, barTimeFilter)
  }, [dashboardData, barTimeFilter])

  // 3. Memoized Pie Chart Data
  const portfolioPieData = useMemo(() => {
    return formatPortfolioPieData(dashboardData?.breakdown)
  }, [dashboardData])

  // 4. Memoized Area Chart Data
  const salesTrendData = useMemo(() => {
    return formatSalesTrendData(dashboardData?.charts)
  }, [dashboardData])

  // 5. Memoized Operations Data
  const operationsData = useMemo(() => {
    return formatOperationsData(dashboardData?.rings)
  }, [dashboardData])

  const monthLabel = dashboardData?.stats?.month_label || "Performance Summary"

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Showing statistics for {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-47.5 hidden sm:flex h-9">
              <IconCalendarWeek className="w-4 h-4 mr-1.5 shrink-0" />
              <SelectValue placeholder="Select period">
                {monthOptions.find(o => o.value === selectedMonth)?.label || "Select period"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            onClick={fetchDashboardData}
            title="Refresh statistics"
            disabled={isLoading}
          >
            <IconRefresh className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top 5 KPI Metric Cards via Skeleton/Props */}
      <SectionCards stats={formattedStats} isLoading={isLoading} />

      {/* Charts Grid - All Fed Through Props with Skeleton Loaders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartBarMultiple 
          data={barChartData}
          timeFilter={barTimeFilter}
          onTimeFilterChange={setBarTimeFilter}
          isLoading={isLoading}
        />

        <ChartPieSeparatorNone 
          data={portfolioPieData}
          isLoading={isLoading}
        />

        <ChartAreaSalesTrend 
          data={salesTrendData}
          isLoading={isLoading}
        />

        <ChartTopPerformer 
          data={operationsData}
          isLoading={isLoading}
        />
      </div>

      {/* Recent Activity Feed */}
      {isLoading ? (
        <Skeleton className="w-full h-[150px] rounded-xl" />
      ) : dashboardData?.activity && dashboardData.activity.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Recent Live Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {dashboardData.activity.map((item, idx) => (
                <div 
                  key={idx} 
                  className="flex items-start gap-3 p-3.5 rounded-xl border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {item.kind === 'order' ? (
                      <IconShoppingBag className="w-4 h-4" />
                    ) : item.kind === 'customer' ? (
                      <IconUserCheck className="w-4 h-4" />
                    ) : (
                      <IconSparkles className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {item.meta_tag || item.kind}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{item.meta_time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default Dashboard
