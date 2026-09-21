import React from 'react'
import { SectionCards } from '../Layout/StatsCard'
import { ChartBarMultiple, ChartPieSeparatorNone, ChartAreaSalesTrend, ChartTopPerformer } from '../Layout/Chart'
import ToastSaveDemo from '../components/ToastSaveDemo'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconCalendarWeek, IconPlus } from "@tabler/icons-react"
const Dashboard = () => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground text-sm">Your performance summary · September 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <Select>
            <SelectTrigger className="w-[120px] hidden sm:flex h-9">
              <IconCalendarWeek className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="August">August</SelectItem>
                <SelectItem value="September">September</SelectItem>
                <SelectItem value="October">October</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button>
            <IconPlus className="w-4 h-4 mr-2" />
            New Order</Button>
        </div>
      </div>

      <SectionCards />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartBarMultiple />

        <ChartPieSeparatorNone />

        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sales Trend</CardTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary"></span> Online Payment</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted-foreground/30"></span> Offline Sales</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-6 px-2 sm:px-6">
            <ChartAreaSalesTrend />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Top Performer</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-[250px] pt-4 px-2 sm:px-6">
            <ChartTopPerformer />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Dashboard
