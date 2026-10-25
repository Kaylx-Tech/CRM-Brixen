"use client"

import React from "react"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis, Area, AreaChart, Label, LabelList, Pie, PieChart } from "recharts"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { m, fadeUp } from "@/lib/motion"
import { formatGBP } from "@/lib/money"

// Bars / areas / slices grow in smoothly (shorter and softer than the Recharts default)
const CHART_ANIMATION = { isAnimationActive: true, animationBegin: 120, animationDuration: 850, animationEasing: "ease-out" }

// Chart cards lift in with the same spring as the stat cards
const MotionCard = m.create(Card)
const cardMotion = { variants: fadeUp, initial: "hidden", animate: "show" }

const revenueChartConfig = {
  revenue: { label: "Revenue", color: "var(--primary)" },
}

// Range buttons, and what each one is compared with
const REVENUE_RANGES = [
  { value: "This Month", label: "This month", versus: "vs the same days last month" },
  { value: "7d", label: "7 days", versus: "vs the 7 days before" },
  { value: "30d", label: "30 days", versus: "vs the 30 days before" },
  { value: "90d", label: "90 days", versus: "vs the 90 days before" },
]

const shortMoney = (val) => `£${val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : Math.round(val || 0)}`

// "Sun, Oct 4" for a "2026-10-04" point
function tooltipDate(iso, fallback) {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

// Dots on the revenue line: a pulsing ring on the latest day and a small "Best day" tag on the peak
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

function RevenueDot({ cx, cy, index, lastIndex, peakIndex, payload }) {
  if (cx == null || cy == null) return <g />
  if (index === lastIndex) {
    return (
      <g>
        {!reduceMotion() && (
          <circle cx={cx} cy={cy} r={5} fill="var(--primary)" opacity={0.35}>
            <animate attributeName="r" values="5;13;5" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" />
          </circle>
        )}
        <circle cx={cx} cy={cy} r={5} fill="var(--primary)" stroke="var(--background)" strokeWidth={2} />
      </g>
    )
  }
  if (index === peakIndex && (payload?.revenue || 0) > 0) {
    const label = `Best day · ${shortMoney(payload.revenue)}`
    const w = label.length * 5.6 + 14
    return (
      <g>
        <circle cx={cx} cy={cy} r={3.5} fill="var(--background)" stroke="var(--primary)" strokeWidth={2} />
        <rect x={cx - w / 2} y={cy - 27} width={w} height={18} rx={9} fill="var(--primary)" />
        <text x={cx} y={cy - 14.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--primary-foreground)">{label}</text>
      </g>
    )
  }
  return <g />
}

// Dark pill: the day's revenue and the date
function RevenueTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg bg-foreground px-2.5 py-1.5 text-background shadow-lg">
      <div className="text-sm font-semibold tabular-nums">{shortMoney(point.revenue)}</div>
      <div className="text-[11px] opacity-70">{tooltipDate(point.date, point.month)}</div>
    </div>
  )
}

// Small coloured square that sits before each chart title
function TitleDot({ className }) {
  return <span className={`inline-block size-2.5 rounded-full ${className}`} />
}

/**
 * Revenue: a glowing theme-colour line that deepens towards today over a fading wash, a pulsing dot on
 * the latest day and a "Best day" tag on the peak, with the total and the change against the same span
 * before. Opens on this month.
 */
export function ChartRevenueOverTime({
  data = [],
  timeFilter = "This Month",
  onTimeFilterChange,
  isLoading = false,
}) {
  if (isLoading) {
    return <Skeleton className="w-full h-[360px] rounded-xl" />
  }

  const displayData = data && data.length > 0 ? data : []
  const total = displayData.reduce((sum, d) => sum + (d.revenue || 0), 0)
  const previousTotal = displayData.reduce((sum, d) => sum + (d.previous || 0), 0)
  const change = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null
  const up = change === null || change >= 0
  const range = REVENUE_RANGES.find((r) => r.value === timeFilter) || REVENUE_RANGES[0]
  const lastIndex = displayData.length - 1
  // The best day gets a small label (only when there was some revenue)
  const peakIndex = displayData.reduce((best, d, i) => ((d.revenue || 0) > (displayData[best]?.revenue || 0) ? i : best), 0)

  return (
    <MotionCard {...cardMotion} className="flex flex-col chart-revenue-privacy relative">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-0">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold">Revenue</CardTitle>
          <p className="text-xs text-muted-foreground">All orders, net of cancellations and refunds</p>
        </div>
        {onTimeFilterChange && (
          <div className="flex rounded-lg border bg-muted/60 p-0.5" role="tablist" aria-label="Revenue range">
            {REVENUE_RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="tab"
                aria-selected={r.value === range.value}
                onClick={() => onTimeFilterChange(r.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  r.value === range.value
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1 pt-1">
          <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatGBP(total)}</span>
          {change !== null && (
            <span className="text-xs text-muted-foreground">
              <span className={`font-semibold tabular-nums ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {up ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
              </span>{" "}
              {range.versus}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-3">
        <ChartContainer config={revenueChartConfig}>
          <AreaChart accessibilityLayer data={displayData} margin={{ top: 28, right: 14, left: 0, bottom: 0 }}>
            <defs>
              {/* Soft wash under the line, fading to nothing */}
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                <stop offset="70%" stopColor="var(--primary)" stopOpacity={0.06} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
              {/* The line deepens towards today */}
              <linearGradient id="revenueStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={1} />
              </linearGradient>
              <filter id="revenueGlow" x="-5%" y="-30%" width="110%" height="160%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 6" />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={8}
              axisLine={false}
              minTickGap={20}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickFormatter={shortMoney}
            />
            <ChartTooltip cursor={{ stroke: "var(--primary)", strokeOpacity: 0.45, strokeDasharray: "3 4" }} content={<RevenueTooltip />} />
            <Area type="monotone" dataKey="revenue" stroke="none" fill="url(#revenueFill)" activeDot={false} {...CHART_ANIMATION} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="url(#revenueStroke)"
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              filter="url(#revenueGlow)"
              dot={(props) => <RevenueDot key={props.index} {...props} lastIndex={lastIndex} peakIndex={peakIndex} />}
              activeDot={{ r: 5, fill: "var(--background)", stroke: "var(--primary)", strokeWidth: 2.5 }}
              tooltipType="none"
              {...CHART_ANIMATION}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </MotionCard>
  )
}

const pieChartConfig = {
  value: { label: "Share" },
  customers: { label: "Clients", color: "var(--chart-1)" },
  companies: { label: "Companies", color: "var(--chart-2)" },
  orders: { label: "Orders", color: "var(--chart-3)" },
  tickets: { label: "Tickets", color: "var(--chart-4)" },
}

export function ChartPieSeparatorNone({ data = [], isLoading = false }) {
  if (isLoading) {
    return <Skeleton className="w-full h-[360px] rounded-xl" />
  }

  const pieData = data && data.length > 0 ? data : []
  const total = pieData.reduce((acc, curr) => acc + (curr.value || 0), 0)

  return (
    <MotionCard {...cardMotion} className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2"><TitleDot className="bg-(--viz-2)" />Portfolio Distribution</CardTitle>
        </div>
      </CardHeader>
      <div className="flex flex-col sm:flex-row items-center justify-center flex-1">
        <CardContent className="flex-[3] w-full">
          <ChartContainer
            config={pieChartConfig}
            className="mx-auto aspect-square w-full max-w-[280px]"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="category"
                innerRadius="58%"
                outerRadius="92%"
                paddingAngle={2}
                cornerRadius={6}
                stroke="var(--card)"
                strokeWidth={2}
                {...CHART_ANIMATION}
              >
                <Label
                  content={({ viewBox }) =>
                    viewBox?.cx != null ? (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy - 6} className="fill-foreground text-2xl font-bold">
                          {total.toLocaleString("en-GB")}
                        </tspan>
                        <tspan x={viewBox.cx} y={viewBox.cy + 16} className="fill-muted-foreground text-xs">
                          Total
                        </tspan>
                      </text>
                    ) : null
                  }
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
        <div className="flex-[2] flex flex-col items-start gap-2.5 text-sm px-2 sm:px-0 mt-6 sm:mt-0">
          {pieData.map((item, index) => {
            const pct = item.pct ?? (total > 0 ? Math.round((item.value / total) * 100) : 0)
            return (
              <div key={index} className="flex w-full max-w-56 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                <span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }}></span>
                <span className="text-foreground font-medium truncate">{item.label}</span>
                <span className="ml-auto text-muted-foreground tabular-nums">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </MotionCard>
  )
}

const areaChartConfig = {
  online: {
    label: "Online Activity",
    color: "var(--viz-1)",
  },
  offline: {
    label: "Direct Intakes",
    color: "var(--viz-2)",
  },
}

export function ChartAreaSalesTrend({ data = [], isLoading = false }) {
  if (isLoading) {
    return <Skeleton className="w-full h-[360px] rounded-xl" />
  }

  const displayData = data && data.length > 0 ? data : []

  return (
    <MotionCard {...cardMotion} className="flex flex-col chart-revenue-privacy relative">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><TitleDot className="bg-(--viz-3)" />Sales Trend</CardTitle>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-(--viz-1)"></span> Online Activity
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-(--viz-2)"></span> Direct Intake
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-6 px-2 sm:px-6">
        <ChartContainer config={areaChartConfig} className="w-full h-full min-h-[250px]">
          <AreaChart
            accessibilityLayer
            data={displayData}
            margin={{
              left: -20,
              right: 12,
              top: 10,
              bottom: 0
            }}
          >
            <defs>
              <linearGradient id="trendOnline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-online)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--color-online)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="trendOffline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-offline)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-offline)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <ChartTooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }} content={<ChartTooltipContent />} />
            <Area
              dataKey="online"
              type="natural"
              fill="url(#trendOnline)"
              stroke="var(--color-online)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
              {...CHART_ANIMATION}
            />
            <Area
              dataKey="offline"
              type="natural"
              fill="url(#trendOffline)"
              stroke="var(--color-offline)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
              {...CHART_ANIMATION}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </MotionCard>
  )
}

const topPerformerConfig = {
  score: {
    label: "Score",
    color: "var(--chart-3)",
  },
}

export function ChartTopPerformer({ data = [], isLoading = false }) {
  if (isLoading) {
    return <Skeleton className="w-full h-[360px] rounded-xl" />
  }

  const displayData = data && data.length > 0 ? data : []

  return (
    <MotionCard {...cardMotion} className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><TitleDot className="bg-(--viz-4)" />Completion & Operations</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[250px] pt-4 px-2 sm:px-6">
        <ChartContainer config={topPerformerConfig} className="w-full h-full min-h-[250px]">
          <BarChart
            accessibilityLayer
            data={displayData}
            layout="vertical"
            margin={{
              left: 0,
              right: 32,
            }}
          >
            <YAxis
              dataKey="team"
              type="category"
              tickLine={false}
              axisLine={false}
              hide={true}
            />
            <XAxis type="number" hide={true} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="score" fill="var(--color-score)" radius={8} barSize={28} background={{ fill: "var(--muted)", radius: 8 }} {...CHART_ANIMATION}>
              {displayData.map((d, i) => (
                // Only the deep blues (1, 3, 5): the team name sits inside the bar in white
                <Cell key={d.team ?? i} fill={`var(--viz-${[1, 3, 5][i % 3]})`} />
              ))}
              <LabelList dataKey="team" position="insideLeft" fill="#ffffff" offset={12} fontSize={14} />
              <LabelList dataKey="score" position="right" fill="var(--foreground)" offset={12} fontSize={14} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </MotionCard>
  )
}
