"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Area, AreaChart, LabelList } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
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

export const description = "A multiple bar chart"

const chartData = [
  { month: "Apr ", revenue: 59 },
  { month: "May", revenue: 87 },
  { month: "Jun", revenue: 98 },
   { month: "Jul", revenue: 78 },
    { month: "Aug", revenue: 90 },
     { month: "Sep", revenue: 65 },
      { month: "Oct", revenue: 84 },
      { month: "Nov", revenue: 67 },
  { month: "Dec", revenue: 40 },
  { month: "Jan", revenue: 90 },
]

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-3)",
  },
}

export function ChartBarMultiple() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle>Revenue Analytics</CardTitle>
          <CardDescription>This month</CardDescription>
        </div>
        <Select defaultValue="this-month">
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
          <SelectGroup>
            <SelectItem value="this-month">This month</SelectItem>
            <SelectItem value="last-month">Last month</SelectItem>
            <SelectItem value="this-year">This year</SelectItem>
          </SelectGroup>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
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
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 4, 4]} barSize={40} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

const pieChartData = [
  { category: "multiple", value: 58, fill: "var(--color-multiple)" },
  { category: "taptap", value: 25, fill: "var(--color-taptap)" },
  { category: "tide", value: 17, fill: "var(--color-tide)" },
]

const pieChartConfig = {
  value: {
    label: "Share",
  },
  multiple: {
    label: "Multiple Products",
    color: "var(--chart-1)",
  },
  taptap: {
    label: "TapTap Business Bank",
    color: "var(--chart-2)",
  },
  tide: {
    label: "Tide Business Bank",
    color: "var(--chart-3)",
  },
}

import { Pie, PieChart } from "recharts"
import { CardFooter } from "@/components/ui/card"

export function ChartPieSeparatorNone() {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle>Sales Analytics</CardTitle>
          <CardDescription>This month</CardDescription>
        </div>
        <Select defaultValue="this-month">
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
            <SelectItem value="this-month">This month</SelectItem>
            <SelectItem value="last-month">Last month</SelectItem>
            <SelectItem value="this-year">This year</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
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
                data={pieChartData}
                dataKey="value"
                nameKey="category"
                stroke="0"
              />
            </PieChart>
          </ChartContainer>
        </CardContent>
        <div className="flex-[2] flex flex-col items-start gap-2.5 text-xs px-2 sm:px-0 mt-6 sm:mt-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--chart-1)]"></span>
            <span className="text-foreground">Multiple Products (58%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--chart-2)]"></span>
            <span className="text-foreground">TapTap Business Bank (25%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--chart-3)]"></span>
            <span className="text-foreground">Tide Business Bank (17%)</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

const areaChartData = [
  { week: "1", online: 150, offline: 40 },
  { week: "2", online: 300, offline: 100 },
  { week: "3", online: 380, offline: 120 },
  { week: "4", online: 250, offline: 70 },
  { week: "5", online: 140, offline: 110 },
  { week: "6", online: 180, offline: 60 },
  { week: "7", online: 220, offline: 80 },
  { week: "8", online: 210, offline: 90 },
]

const areaChartConfig = {
  online: {
    label: "Online Payment",
    color: "var(--chart-1)",
  },
  offline: {
    label: "Offline Sales",
    color: "var(--chart-2)",
  },
}

export function ChartAreaSalesTrend() {
  return (
    <ChartContainer config={areaChartConfig} className="w-full h-full min-h-[250px]">
      <AreaChart
        accessibilityLayer
        data={areaChartData}
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
  )
}

const topPerformerData = [
  { team: "Team Alpha", score: 186 },
  { team: "Team Beta", score: 305 },
  { team: "Team Gamma", score: 237 },
  { team: "Team Delta", score: 73 },
  { team: "Team Epsilon", score: 209 },
  { team: "Team Zeta", score: 214 },
]

const topPerformerConfig = {
  score: {
    label: "Score",
    color: "var(--chart-3)",
  },
}

export function ChartTopPerformer() {
  return (
    <ChartContainer config={topPerformerConfig} className="w-full h-full min-h-[250px]">
      <BarChart
        accessibilityLayer
        data={topPerformerData}
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
  )
}
