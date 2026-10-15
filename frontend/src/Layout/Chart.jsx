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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { m, fadeUp } from "@/lib/motion"

// Bars / areas / slices grow in smoothly (shorter and softer than the Recharts default)
const CHART_ANIMATION = { isAnimationActive: true, animationBegin: 120, animationDuration: 850, animationEasing: "ease-out" }

// Chart cards lift in with the same spring as the stat cards
const MotionCard = m.create(Card)
const cardMotion = { variants: fadeUp, initial: "hidden", animate: "show" }

const barChartConfig = {
  revenue: {
    label: "Sales Revenue",
    color: "var(--viz-1)",
  },
}

// Small coloured square that sits before each chart title
function TitleDot({ className }) {
  return <span className={`inline-block size-2.5 rounded-full ${className}`} />
}

export function ChartBarMultiple({
  data = [],
  timeFilter = "This Year",
  onTimeFilterChange,
  isLoading = false,
}) {
  if (isLoading) {
    return <Skeleton className="w-full h-[360px] rounded-xl" />
  }

  const displayData = data && data.length > 0 ? data : []
  // The best period gets the full gradient, the rest stay lighter
  const peak = displayData.reduce((best, d, i) => (d.revenue > (displayData[best]?.revenue ?? -1) ? i : best), -1)

  return (
    <MotionCard {...cardMotion} className="flex flex-col chart-revenue-privacy relative">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2"><TitleDot className="bg-(--viz-1)" />Sales Revenue</CardTitle>
        </div>
        {onTimeFilterChange && (
          <Select value={timeFilter} onValueChange={onTimeFilterChange}>
            <SelectTrigger className="w-[120px] h-8 text-sm">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="This Year">This Year</SelectItem>
                <SelectItem value="This Month">This Month</SelectItem>
                <SelectItem value="This Week">This Week</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={barChartConfig}>
          <BarChart accessibilityLayer data={displayData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="var(--viz-1)" />
              </linearGradient>
              <linearGradient id="revenueBarSoft" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.18} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              tickFormatter={(val) => `£${val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : val}`}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5, radius: 8 }}
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <div className="flex items-center justify-between w-full min-w-[130px] gap-2">
                      <span className="text-muted-foreground">Sales Revenue</span>
                      <span className="  font-medium text-foreground tabular-nums">
                        £{Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="revenue" fill="url(#revenueBarSoft)" radius={[8, 8, 4, 4]} maxBarSize={40} {...CHART_ANIMATION}>
              {displayData.map((d, i) => (
                <Cell key={d.month ?? i} fill={i === peak ? "url(#revenueBar)" : "url(#revenueBarSoft)"} />
              ))}
            </Bar>
          </BarChart>
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
                <Cell key={d.team ?? i} fill={`var(--viz-${(i % 5) + 1})`} />
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
