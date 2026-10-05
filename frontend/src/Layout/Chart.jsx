"use client"

import React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Area, AreaChart, LabelList, Pie, PieChart } from "recharts"

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

const barChartConfig = {
  revenue: {
    label: "Sales Revenue",
    color: "var(--chart-3)",
  },
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

  return (
    <Card className="flex flex-col chart-revenue-privacy relative">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle>Sales Revenue</CardTitle>
        </div>
        {onTimeFilterChange && (
          <Select value={timeFilter} onValueChange={onTimeFilterChange}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
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
            <CartesianGrid vertical={false} stroke="var(--border)" />
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
              cursor={false}
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
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 4, 4]} barSize={40} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
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
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle>Portfolio Distribution</CardTitle>
        </div>
      </CardHeader>
      <div className="flex flex-col sm:flex-row items-center justify-center flex-1">
        <CardContent className="flex-[3] w-full">
          <ChartContainer
            config={pieChartConfig}
            className="mx-auto aspect-square max-h-[280px]"
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
                stroke="0"
              />
            </PieChart>
          </ChartContainer>
        </CardContent>
        <div className="flex-[2] flex flex-col items-start gap-2.5 text-xs px-2 sm:px-0 mt-6 sm:mt-0">
          {pieData.map((item, index) => {
            const pct = item.pct ?? (total > 0 ? Math.round((item.value / total) * 100) : 0)
            return (
              <div key={index} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }}></span>
                <span className="text-foreground font-medium">{item.label} ({pct}%)</span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

const areaChartConfig = {
  online: {
    label: "Online Activity",
    color: "var(--chart-1)",
  },
  offline: {
    label: "Direct Intakes",
    color: "var(--chart-2)",
  },
}

export function ChartAreaSalesTrend({ data = [], isLoading = false }) {
  if (isLoading) {
    return <Skeleton className="w-full h-[360px] rounded-xl" />
  }

  const displayData = data && data.length > 0 ? data : []

  return (
    <Card className="flex flex-col chart-revenue-privacy relative">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Sales Trend</CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary"></span> Online Activity
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30"></span> Direct Intake
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
            <CartesianGrid vertical={false} stroke="var(--border)" />
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
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Area
              dataKey="online"
              type="natural"
              fill="var(--color-online)"
              fillOpacity={0.2}
              stroke="var(--color-online)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <Area
              dataKey="offline"
              type="natural"
              fill="var(--color-offline)"
              fillOpacity={0.4}
              stroke="var(--color-offline)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
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
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Completion & Operations</CardTitle>
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
            <CartesianGrid horizontal={false} vertical={true} stroke="var(--border)" />
            <YAxis
              dataKey="team"
              type="category"
              tickLine={false}
              axisLine={false}
              hide={true}
            />
            <XAxis type="number" hide={true} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="score" fill="var(--color-score)" radius={6} barSize={28}>
              <LabelList dataKey="team" position="insideLeft" fill="var(--background)" offset={12} fontSize={14} />
              <LabelList dataKey="score" position="right" fill="var(--foreground)" offset={12} fontSize={14} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
