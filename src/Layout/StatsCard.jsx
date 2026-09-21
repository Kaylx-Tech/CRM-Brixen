"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { IconTrendingUp, IconTrendingDown } from "@tabler/icons-react"

export function StatCard({
  title,
  value,
  trendValue,
  trendDirection = "up",
  footerText,
  footerSubText,
}) {
  const TrendIcon = trendDirection === "up" ? IconTrendingUp : IconTrendingDown

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        {trendValue && (
          <CardAction>
            <Badge variant="outline">
              <TrendIcon />
              {trendValue}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      {(footerText || footerSubText) && (
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {footerText && (
            <div className="line-clamp-1 flex gap-2 font-medium">
              {footerText} <TrendIcon className="size-4" />
            </div>
          )}
          {footerSubText && <div className="text-muted-foreground">{footerSubText}</div>}
        </CardFooter>
      )}
    </Card>
  )
}

const statsData = [
  { title: "Number of sales", value: "12" },
  { title: "Sales Revenue", value: "£40.00" },
  { title: "Total Products", value: "30" },
  { title: "Total Customers", value: "46" },
  { title: "Total Turnover", value: "£880.00" },
  { title: "Net Profit", value: "£540.00" },
]

import { useEffect, useState } from "react"

export function SectionCards() {
  const [stats, setStats] = useState(statsData)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Replace with the actual endpoint if it differs in the backend
        const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/dashboard/stats`, {
          // If authentication is needed, add token/credentials here
        })
        if (res.ok) {
          const data = await res.json()
          if (data.status === "success" && data.stats) {
            setStats(data.stats)
          }
        }
      } catch (err) {
        console.error("Failed to fetch stats", err)
      }
    }
    
    // Uncomment this when the backend endpoint is ready
    // fetchStats()
  }, [])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
      {stats.map((stat, index) => (
        <StatCard key={index} {...stat} />
      ))}
    </div>
  )
}
