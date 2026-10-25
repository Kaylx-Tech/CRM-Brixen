import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { SectionCards } from '../Layout/StatsCard'
import { ChartRevenueOverTime, ChartPieSeparatorNone, ChartAreaSalesTrend, ChartTopPerformer } from '../Layout/Chart'
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  IconCalendarEvent,
  IconCalendarWeek,
  IconCash,
  IconChartLine,
  IconCurrencyPound,
  IconFileDescription,
  IconLayoutDashboard,
  IconPackage,
  IconShoppingBag,
  IconShoppingCart,
  IconSparkles,
  IconTicket,
  IconUserCheck,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { apiRequest, getApiBase } from "@/lib/api"
import { canViewRevenue, getCurrentUser } from "@/lib/permissions"
import { formatGBP } from "@/lib/money"
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn"
import { m, spring } from "@/lib/motion"

// ==========================================
// Dashboard layout: which cards each user wants to see
// ==========================================

const MAIN_CARDS = [
  { key: "Number of Sales" },
  { key: "Sales Revenue", money: true },
  { key: "Total Customers" },
  { key: "Total Turnover", money: true },
  { key: "Net Profit", money: true },
]

const WORK_CARDS = [
  { key: "Today's Orders" },
  { key: "Open Tickets" },
  { key: "Documents Pending" },
  { key: "Total Products" },
  { key: "Pending Payments", money: true },
]

const SECTIONS = [
  { key: "chart:sales", label: "Revenue over time chart" },
  { key: "chart:portfolio", label: "Portfolio chart" },
  { key: "chart:trend", label: "Sales Trend chart" },
  { key: "chart:operations", label: "Operations chart" },
  { key: "section:top-performer", label: "Top Performer" },
  { key: "section:activity", label: "Recent Live Activity" },
]

// Grade badge gradient: A green, B blue, C amber, anything lower rose
const gradeColor = (grade = "") => {
  const g = String(grade).toUpperCase()
  if (g.startsWith("A")) return "from-emerald-500 to-teal-500"
  if (g.startsWith("B")) return "from-blue-500 to-indigo-500"
  if (g.startsWith("C")) return "from-amber-500 to-orange-500"
  return "from-rose-500 to-pink-500"
}

const activityColor = (kind) =>
  kind === "order"
    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
    : kind === "customer"
      ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"

// Saved per user in this browser
const layoutKey = () => `brixen.dashboard.hidden.${getCurrentUser()?.id || "me"}`

function loadHidden() {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey()) || "[]")
    return new Set(Array.isArray(saved) ? saved : [])
  } catch {
    return new Set()
  }
}

function saveHidden(hidden) {
  try {
    localStorage.setItem(layoutKey(), JSON.stringify([...hidden]))
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
}

function CustomizeDashboard({ hidden, onToggle, onReset }) {
  const money = canViewRevenue()
  const visible = (list) => list.filter((c) => money || !c.money)
  const hiddenCount = [...visible(MAIN_CARDS), ...visible(WORK_CARDS), ...SECTIONS]
    .filter((c) => hidden.has(c.key)).length

  const group = (label, items) => (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="py-1.5 text-xs">{label}</DropdownMenuLabel>
      {items.map((c) => (
        <DropdownMenuCheckboxItem
          key={c.key}
          checked={!hidden.has(c.key)}
          onCheckedChange={() => onToggle(c.key)}
        >
          {c.label || c.key}
        </DropdownMenuCheckboxItem>
      ))}
    </DropdownMenuGroup>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <IconLayoutDashboard className="w-4 h-4" />
        Customize
        {hiddenCount > 0 && (
          <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
            {hiddenCount} hidden
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {group("Main cards", visible(MAIN_CARDS))}
        <DropdownMenuSeparator />
        {group("Work cards", visible(WORK_CARDS))}
        <DropdownMenuSeparator />
        {group("Charts & sections", SECTIONS)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onReset} disabled={hiddenCount === 0}>
          Show all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ==========================================
// Helper Functions for Data Formatting
// ==========================================

// Currency formatting (£ GBP)
// £1,250 or £1,250.50 (no ".00"); the server's display text is used when there is no number
const formatCurrency = (val, displayVal) => {
  const num = typeof val === 'number' ? val : parseFloat(val)
  if (Number.isFinite(num)) return formatGBP(num)
  if (displayVal && typeof displayVal === 'string' && displayVal.trim() !== '') {
    const cleaned = displayVal.replace(/[^\d.-]/g, '')
    if (cleaned) return formatGBP(cleaned)
  }
  return formatGBP(0)
}

// Parse Trend Object from Backend MoM calculation
const getTrend = (trendObj, defaultVal = "+0%") => {
  if (trendObj === null) {
    return { trendValue: "", trendDirection: "up" } // no previous period (All Time) → hide badge
  }
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

// Revenue over time: each point of the chosen range with the same point one period earlier
const RANGE_SERIES = { "This Month": "orders_daily", "This Week": "orders_weekly", "This Year": "orders_yearly" }
const toNumber = (v) => (typeof v === 'number' ? v : (parseFloat(v) || 0))
const formatBarChartData = (charts, filter) => {
  const key = RANGE_SERIES[filter]
  if (!charts || !key || !Array.isArray(charts[key])) return []
  const previous = Array.isArray(charts[`${key}_prev`]) ? charts[`${key}_prev`] : []
  return charts[key].map((d, i) => ({
    month: d.label,
    revenue: toNumber(d.revenue),
    previous: previous[i]?.revenue == null ? null : toNumber(previous[i].revenue),
    orders: d.cnt || 0,
  }))
}

// Format Pie Chart Data (Portfolio Distribution)
const formatPortfolioPieData = (breakdown) => {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return []
  return breakdown.map((b, idx) => ({
    category: b.key,
    label: b.label,
    value: b.value || 0,
    pct: b.pct,
    fill: `var(--viz-${(idx % 5) + 1})`
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

// "Good morning / afternoon / evening" by the local time
function greetingFor(date) {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

function firstName(user) {
  const full = String(user?.full_name || user?.name || '').trim()
  if (full) return full.split(/\s+/)[0]
  return String(user?.email || '').split('@')[0] || ''
}

const greetWord = {
  hidden: { opacity: 0, y: 10, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: spring },
}

/** Dashboard heading: a time-of-day greeting with the signed-in person's first name, words easing in one by one and a small wave. */
function DashboardGreeting({ monthLabel }) {
  const [now, setNow] = useState(() => new Date())
  // Follows the clock, so the greeting changes from morning to afternoon while the page is open
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const name = firstName(getCurrentUser())
  const words = `${greetingFor(now)}${name ? `, ${name}` : ''}`.split(' ')

  return (
    <div>
      <m.h2
        key={words.join(' ')}
        className="flex flex-wrap items-center gap-x-[0.3em] text-2xl font-bold tracking-tight"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
        aria-label={words.join(' ')}
      >
        {words.map((word, i) => (
          <m.span key={i} variants={greetWord} className="inline-block" aria-hidden="true">{word}</m.span>
        ))}
        <m.span
          className="inline-block origin-[70%_70%]"
          aria-hidden="true"
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 1, rotate: [0, 18, -8, 18, -4, 10, 0] }}
          transition={{ opacity: { delay: 0.35 }, rotate: { delay: 0.5, duration: 1.4, ease: 'easeInOut' } }}
        >
          👋
        </m.span>
      </m.h2>
      <m.p
        className="text-sm text-muted-foreground mt-0.5"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.3 }}
      >
        Showing statistics for {monthLabel}
      </m.p>
    </div>
  )
}

const Dashboard = () => {
  const navigate = useNavigate()
  const [selectedMonth, setSelectedMonth] = useState("Current")
  const [barTimeFilter, setBarTimeFilter] = useState("This Month")
  const [dashboardData, setDashboardData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hidden, setHidden] = useState(loadHidden)

  const toggleCard = useCallback((key) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveHidden(next)
      return next
    })
  }, [])

  const showAll = useCallback(() => {
    const next = new Set()
    saveHidden(next)
    setHidden(next)
  }, [])

  const shown = (key) => !hidden.has(key)

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
  useRefreshOnReturn(fetchDashboardData)

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

    // Money cards exist only when the backend allows this user to see revenue
    const showMoney = s.total_revenue !== undefined

    return [
      {
        title: "Number of Sales",
        hero: true,
        icon: IconShoppingCart,
        value: String(s.total_orders ?? s.month_orders ?? 0),
        trendValue: salesTrend.trendValue,
        trendDirection: salesTrend.trendDirection,
      },
      ...(showMoney ? [{
        title: "Sales Revenue",
        tone: "emerald",
        icon: IconCurrencyPound,
        value: formatCurrency(s.total_revenue_raw, s.total_revenue),
        trendValue: revTrend.trendValue,
        trendDirection: revTrend.trendDirection,
      }] : []),
      {
        title: "Total Customers",
        tone: "violet",
        icon: IconUsers,
        value: String(s.total_customers ?? 0),
        trendValue: custTrend.trendValue,
        trendDirection: custTrend.trendDirection,
      },
      ...(showMoney ? [
        {
          title: "Total Turnover",
          tone: "orange",
          icon: IconChartLine,
          value: formatCurrency(s.total_turnover, s.total_turnover_display),
          trendValue: turnoverTrend.trendValue,
          trendDirection: turnoverTrend.trendDirection,
        },
        {
          title: "Net Profit",
          tone: "teal",
          icon: IconWallet,
          value: formatCurrency(s.net_profit, s.net_profit_display),
          trendValue: profitTrend.trendValue,
          trendDirection: profitTrend.trendDirection,
        },
      ] : []),
    ]
  }, [dashboardData])

  // Secondary KPI row (work queue)
  const extraStats = useMemo(() => {
    const s = dashboardData?.stats
    if (!s) return []
    return [
      { title: "Today's Orders", tone: "blue", icon: IconCalendarEvent, value: String(s.today_orders ?? 0), footerSubText: `${s.today_customers ?? 0} new customers today`, onClick: () => navigate('/admin/orders') },
      { title: "Open Tickets", tone: "rose", icon: IconTicket, value: String(s.open_tickets ?? 0) },
      { title: "Documents Pending", tone: "amber", icon: IconFileDescription, value: String(s.pending_documents ?? 0), footerSubText: `of ${s.total_documents ?? 0} documents`, onClick: () => navigate('/admin/documents') },
      { title: "Total Products", tone: "violet", icon: IconPackage, value: String(s.total_products ?? 0), onClick: () => navigate('/admin/services') },
      ...(s.pending_payments !== undefined
        ? [{ title: "Pending Payments", tone: "sky", icon: IconCash, value: formatCurrency(null, s.pending_payments), onClick: () => navigate('/admin/payments') }]
        : []),
    ]
  }, [dashboardData, navigate])

  // Only the cards this user keeps on; placeholders follow the same choice while loading
  const mainCards = useMemo(() => {
    if (formattedStats.length || !isLoading) return formattedStats.filter((c) => !hidden.has(c.title))
    const money = canViewRevenue()
    return MAIN_CARDS.filter((c) => (money || !c.money) && !hidden.has(c.key)).map((c) => ({ title: c.key }))
  }, [formattedStats, hidden, isLoading])
  const workCards = useMemo(() => {
    if (extraStats.length || !isLoading) return extraStats.filter((c) => !hidden.has(c.title))
    const money = canViewRevenue()
    return WORK_CARDS.filter((c) => (money || !c.money) && !hidden.has(c.key)).map((c) => ({ title: c.key }))
  }, [extraStats, hidden, isLoading])

  const chartsShown = ["chart:sales", "chart:portfolio", "chart:trend", "chart:operations"].filter(shown).length

  const topPerformers = dashboardData?.top_performers || []

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
        <DashboardGreeting monthLabel={monthLabel} />
        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-47.5 hidden sm:flex">
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


          <CustomizeDashboard hidden={hidden} onToggle={toggleCard} onReset={showAll} />
        </div>
      </div>

      {/* KPI cards: when cards are hidden and both rows fit on one line, they share a single row */}
      {mainCards.length + workCards.length <= 6 ? (
        mainCards.length + workCards.length > 0 && (
          <SectionCards stats={[...mainCards, ...workCards]} isLoading={isLoading} compact />
        )
      ) : (
        <>
          {mainCards.length > 0 && <SectionCards stats={mainCards} isLoading={isLoading} compact />}
          {workCards.length > 0 && <SectionCards stats={workCards} isLoading={isLoading} compact />}
        </>
      )}

      {/* Charts Grid - All Fed Through Props with Skeleton Loaders */}
      {chartsShown > 0 && (
        <div className={`grid grid-cols-1 gap-6 ${chartsShown > 1 ? "lg:grid-cols-2" : ""}`}>
          {shown("chart:sales") && (
            <ChartRevenueOverTime
              data={barChartData}
              timeFilter={barTimeFilter}
              onTimeFilterChange={setBarTimeFilter}
              isLoading={isLoading}
            />
          )}

          {shown("chart:portfolio") && (
            <ChartPieSeparatorNone
              data={portfolioPieData}
              isLoading={isLoading}
            />
          )}

          {shown("chart:trend") && (
            <ChartAreaSalesTrend
              data={salesTrendData}
              isLoading={isLoading}
            />
          )}

          {shown("chart:operations") && (
            <ChartTopPerformer
              data={operationsData}
              isLoading={isLoading}
            />
          )}
        </div>
      )}

      {/* Top Performers (staff incentive grades) */}
      {!isLoading && shown("section:top-performer") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Top Performer</CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff performance data for this month yet</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {topPerformers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3.5 rounded-xl border bg-muted/20">
                    <Badge className={`h-8 w-10 justify-center text-sm border-0 text-white bg-linear-to-br ${gradeColor(p.grade)}`}>{p.grade}</Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.full_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {p.completed_count}/{p.assigned_count} tasks · SLA {p.sla_rate}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity Feed */}
      {!shown("section:activity") ? null : isLoading ? (
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
                  <div className={`p-2 rounded-lg ${activityColor(item.kind)}`}>
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
                    <p className="text-sm text-muted-foreground truncate">{item.subtitle}</p>
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
