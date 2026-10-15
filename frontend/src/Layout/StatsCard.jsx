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
import { IconTrendingUp, IconTrendingDown } from "@tabler/icons-react"
import { cn } from "cn"
import { m, fadeUp, staggerContainer, snappySpring } from "@/lib/motion"

// The Card itself animates (the grid styles target the card as a direct child)
const MotionCard = m.create(Card)

/* Inline shimmer bar — replaces Skeleton without changing card dimensions */
function Shimmer({ className }) {
  return (
    <span
      className={cn(
        "inline-block rounded-md bg-muted animate-pulse",
        className
      )}
    />
  )
}

export function StatCard({
  title,
  value,
  trendValue,
  trendDirection = "up",
  footerText,
  footerSubText,
  isLoading = false,
  compact = false,
  onClick,
  active = false,
}) {
  const isDown = trendDirection === "down"
  const TrendIcon = isDown ? IconTrendingDown : IconTrendingUp
  const interactive = typeof onClick === "function"

  return (
    <MotionCard
      variants={fadeUp}
      whileTap={interactive ? { scale: 0.98, transition: snappySpring } : undefined}
      size={compact ? "sm" : "default"}
      className={cn(
        "@container/card",
        interactive && "cursor-pointer transition-colors hover:bg-muted/30",
        active && "ring-1 ring-primary/40 border-primary/30"
      )}
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <CardHeader className={compact ? "gap-0.5" : undefined}>
        <CardDescription className={compact ? "text-[11px]" : undefined}>
          {isLoading ? <Shimmer className="h-3 w-20" /> : title}
        </CardDescription>
        <CardTitle
          className={cn(
            "font-semibold tabular-nums",
            typeof value === "string" && /[£$€]/.test(value) && "privacy-currency-mask",
            compact
              ? "text-xl @[250px]/card:text-2xl"
              : "text-2xl @[250px]/card:text-3xl"
          )}
        >
          {isLoading ? <Shimmer className={compact ? "h-6 w-16 mt-0.5" : "h-8 w-20 mt-1"} /> : value}
        </CardTitle>
        {(trendValue || isLoading) && (
          <CardAction>
            {isLoading ? (
              <Shimmer className="h-5 w-12 rounded-full" />
            ) : (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 font-medium",
                  compact && "px-1.5 py-0 text-[10px]",
                  isDown
                    ? "text-rose-600 border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20"
                    : "text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20"
                )}
              >
                <TrendIcon className={compact ? "size-3" : "size-3.5"} />
                {trendValue}
              </Badge>
            )}
          </CardAction>
        )}
      </CardHeader>
      {(footerText || footerSubText || isLoading) && (
        <CardFooter
          className={cn(
            "flex-col items-start",
            compact ? "gap-0.5 pt-0 text-[11px]" : "gap-1.5 text-sm"
          )}
        >
          {isLoading ? (
            <Shimmer className="h-3 w-28" />
          ) : (
            <>
              {footerText && (
                <div className="line-clamp-1 flex gap-1.5 font-medium">
                  {footerText} {!compact && <TrendIcon className="size-4" />}
                </div>
              )}
              {footerSubText && (
                <div className="text-muted-foreground line-clamp-1">{footerSubText}</div>
              )}
            </>
          )}
        </CardFooter>
      )}
    </MotionCard>
  )
}

export function SectionCards({ stats = [], isLoading = false, compact = false }) {
  /* Use stats.length when loaded, fall back to 4 placeholders while loading */
  const items = isLoading
    ? Array.from({ length: stats.length || 4 }).map(() => ({}))
    : stats

  const count = items.length
  const gridCols =
    count >= 6
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      : count === 5
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"

  return (
    // Placeholders sit still; when the numbers arrive the cards come in one after another
    <m.div
      key={isLoading ? "loading" : "ready"}
      variants={staggerContainer(0.06, 0.02)}
      initial={isLoading ? false : "hidden"}
      animate="show"
      className={cn(
        "grid gap-3 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card",
        gridCols
      )}
    >
      {items.map((stat, index) => (
        <StatCard key={stat.title || index} {...stat} compact={compact} isLoading={isLoading} />
      ))}
    </m.div>
  )
}
