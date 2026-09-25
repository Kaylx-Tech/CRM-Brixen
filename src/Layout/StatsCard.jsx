"use client"
import React from "react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { IconTrendingUp, IconTrendingDown } from "@tabler/icons-react"

export function StatCard({
  title,
  value,
  trendValue,
  trendDirection = "up",
  footerText,
  footerSubText,
  isLoading = false,
}) {
  if (isLoading) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <Skeleton className="h-4 w-24 mb-1" />
          <div className="flex items-center justify-between mt-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </CardHeader>
      </Card>
    )
  }

  const isDown = trendDirection === "down"
  const TrendIcon = isDown ? IconTrendingDown : IconTrendingUp

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        {trendValue && (
          <CardAction>
            <Badge 
              variant="outline" 
              className={`gap-1 font-medium ${
                isDown 
                  ? "text-rose-600 border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20" 
                  : "text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20"
              }`}
            >
              <TrendIcon className="size-3.5" />
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

export function SectionCards({ stats = [], isLoading = false }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCard key={i} isLoading={true} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
      {stats.map((stat, index) => (
        <StatCard key={index} {...stat} isLoading={false} />
      ))}
    </div>
  )
}
