"use client"
import React from "react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  IconAlertTriangle,
  IconBuildingSkyscraper,
  IconCalendarEvent,
  IconChecklist,
  IconCircleCheck,
  IconClockHour4,
  IconCurrencyPound,
  IconFileDescription,
  IconMail,
  IconPackage,
  IconReportMoney,
  IconShoppingCart,
  IconSparkles,
  IconTicket,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react"
import { cn } from "cn"
import { m, fadeUp, staggerContainer, snappySpring } from "@/lib/motion"

// The Card itself animates (the grid styles target the card as a direct child)
const MotionCard = m.create(Card)

// Colour per card: soft tinted surface, a glow in the corner and a coloured icon chip
const TONES = {
  blue: { card: "from-blue-500/12 via-card to-card", glow: "bg-blue-500/25", chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  emerald: { card: "from-emerald-500/12 via-card to-card", glow: "bg-emerald-500/25", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  violet: { card: "from-violet-500/12 via-card to-card", glow: "bg-violet-500/25", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  orange: { card: "from-orange-500/12 via-card to-card", glow: "bg-orange-500/25", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  teal: { card: "from-teal-500/12 via-card to-card", glow: "bg-teal-500/25", chip: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  rose: { card: "from-rose-500/12 via-card to-card", glow: "bg-rose-500/25", chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  amber: { card: "from-amber-500/14 via-card to-card", glow: "bg-amber-500/25", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  sky: { card: "from-sky-500/12 via-card to-card", glow: "bg-sky-500/25", chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
}

// Cards without their own tone take these in order
const TONE_ORDER = ["blue", "emerald", "violet", "orange", "teal", "rose", "amber", "sky"]

// Cards without their own icon get one from words in the title
const TITLE_ICONS = [
  [/overdue|attention|fail|error|bounce|reject|cancel/i, IconAlertTriangle],
  [/pending|waiting|due|progress|processing|queued/i, IconClockHour4],
  [/paid|complete|done|verified|sent|resolved|closed|active/i, IconCircleCheck],
  [/revenue|turnover|profit|amount|value|price|£|payment|invoice|spent|outstanding/i, IconCurrencyPound],
  [/customer|client|user|staff|team|member|director/i, IconUsers],
  [/compan/i, IconBuildingSkyscraper],
  [/order|sale/i, IconShoppingCart],
  [/document|file|upload/i, IconFileDescription],
  [/ticket|support/i, IconTicket],
  [/task/i, IconChecklist],
  [/email|mail/i, IconMail],
  [/service|product|catalog/i, IconPackage],
  [/account|filing|return|tax|vat/i, IconReportMoney],
  [/today|month|week|year|new/i, IconCalendarEvent],
]

// Meaning first (overdue red, pending amber, done green…), then the order above
const TITLE_TONES = [
  [/overdue|issue|fail|owe|reject|quarantine|cancel|not deliver/i, "rose"],
  [/pending|due|waiting|part paid|review/i, "amber"],
  [/progress|processing/i, "violet"],
  [/complete|paid|received|filed|deliver|posted|resolved|profit/i, "emerald"],
  [/cost/i, "orange"],
  [/revenue|sell|billed|turnover/i, "sky"],
]

const toneFor = (title = "", index = 0) =>
  TITLE_TONES.find(([re]) => re.test(title))?.[1] ?? TONE_ORDER[index % TONE_ORDER.length]

const iconForTitle = (title = "") => TITLE_ICONS.find(([re]) => re.test(title))?.[1] ?? IconSparkles

// The headline card: solid brand gradient with white text
const HERO = {
  card: "border-transparent ring-0 from-[#1A69F8] via-[#3b5bff] to-[#7c3aed] text-white shadow-lg shadow-blue-500/25 dark:from-[#F77C07] dark:via-[#f06a0a] dark:to-[#d9480f] dark:shadow-orange-500/20",
  glow: "bg-white/25",
  chip: "bg-white/20 text-white",
}

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
  isLoading = false,
  compact = false,
  onClick,
  active = false,
  tone,
  hero = false,
  icon: Icon,
}) {
  const isDown = trendDirection === "down"
  const TrendIcon = isDown ? IconTrendingDown : IconTrendingUp
  const interactive = typeof onClick === "function"
  const look = hero && !isLoading ? HERO : TONES[tone]

  return (
    <MotionCard
      variants={fadeUp}
      whileHover={{ y: -3, transition: snappySpring }}
      whileTap={interactive ? { scale: 0.98, transition: snappySpring } : undefined}
      size={compact ? "sm" : "default"}
      className={cn(
        "@container/card relative overflow-hidden shadow-xs",
        look ? cn("bg-linear-to-br", look.card) : "bg-linear-to-t from-primary/5 to-card",
        interactive && "cursor-pointer",
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
      {look && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -top-10 -right-10 rounded-full blur-2xl",
            compact ? "size-24" : "size-32",
            look.glow
          )}
        />
      )}
      <CardHeader className={cn("relative @max-[200px]/card:grid-cols-1!", compact ? "gap-0.5" : undefined)}>
        <CardDescription
          className={cn(
            compact ? "flex items-center gap-2 text-[11px]" : "flex flex-col items-start gap-2.5",
            hero && !isLoading && "text-white/85"
          )}
        >
          {Icon && !isLoading && (
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-lg",
                compact ? "size-6" : "size-9 rounded-xl",
                look?.chip
              )}
            >
              <Icon className={compact ? "size-3.5" : "size-5"} />
            </span>
          )}
          {isLoading ? <Shimmer className="h-3 w-20" /> : title}
        </CardDescription>
        <CardTitle
          className={cn(
            // "!" so the card's own small-size title rule (group-data-[size=sm]:text-sm) cannot shrink the number
            "font-bold tabular-nums leading-tight tracking-tight",
            typeof value === "string" && /[£$€]/.test(value) && "privacy-currency-mask",
            compact
              ? "mt-1 text-2xl! @[250px]/card:text-3xl!"
              : "mt-1 text-3xl! @[250px]/card:text-4xl!"
          )}
        >
          {isLoading ? <Shimmer className={compact ? "h-6 w-16 mt-0.5" : "h-8 w-20 mt-1"} /> : value}
        </CardTitle>
        {(trendValue || isLoading) && (
          // A narrow card (phones) puts the trend under the number so it is never cut off
          <CardAction className="@max-[200px]/card:col-start-1 @max-[200px]/card:row-span-1 @max-[200px]/card:row-start-3 @max-[200px]/card:mt-1 @max-[200px]/card:justify-self-start">
            {isLoading ? (
              <Shimmer className="h-5 w-12 rounded-full" />
            ) : (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 font-medium",
                  compact && "px-1.5 py-0 text-[10px]",
                  hero
                    ? "text-white border-white/30 bg-white/15"
                    : isDown
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
      {/* No line of text under the number (footerText / footerSubText are ignored) */}
    </MotionCard>
  )
}

export function SectionCards({ stats = [], isLoading = false, compact = false }) {
  /* Use stats.length when loaded, fall back to 4 placeholders while loading */
  const items = isLoading
    ? Array.from({ length: stats.length || 4 }).map(() => ({}))
    : stats

  // Auto-fit: however many cards are shown, they stretch to fill the row (no empty space on the right)
  const gridCols = compact
    ? "grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]"
    : "grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]"

  return (
    // Placeholders sit still; when the numbers arrive the cards come in one after another
    <m.div
      key={isLoading ? "loading" : "ready"}
      variants={staggerContainer(0.06, 0.02)}
      initial={isLoading ? false : "hidden"}
      animate="show"
      className={cn(
        "grid gap-3",
        gridCols
      )}
    >
      {items.map((stat, index) => (
        <StatCard
          key={stat.title || index}
          {...stat}
          hero={false}
          tone={stat.tone ?? toneFor(stat.title, index)}
          icon={stat.icon ?? (stat.title ? iconForTitle(stat.title) : undefined)}
          compact={compact}
          isLoading={isLoading}
        />
      ))}
    </m.div>
  )
}
