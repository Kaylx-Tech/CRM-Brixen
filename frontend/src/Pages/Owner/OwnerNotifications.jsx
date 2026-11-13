import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { cn } from "cn"
import {
  IconBell,
  IconBuildingSkyscraper,
  IconCash,
  IconChecks,
  IconCreditCard,
  IconMapPin,
} from "@tabler/icons-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ownerApi } from "@/lib/owner"

// How often the bell asks for new notifications (and again whenever the tab comes back into view)
const REFRESH_MS = 60_000

const KIND = {
  signup: { icon: IconBuildingSkyscraper, tone: "bg-primary/10 text-primary" },
  topup: { icon: IconCash, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  registered_office: { icon: IconMapPin, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  payment: { icon: IconCreditCard, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", or the date. The server's times are UTC. */
function timeAgo(value) {
  if (!value) return ""
  const when = new Date(String(value).replace(" ", "T") + (String(value).endsWith("Z") ? "" : "Z"))
  const seconds = Math.max(0, (Date.now() - when.getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  if (seconds < 7 * 86400) {
    const days = Math.floor(seconds / 86400)
    return `${days} day${days === 1 ? "" : "s"} ago`
  }
  return when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * The owner's notifications, shared by the bells in the sidebar and the phone header: loads on start, every
 * minute and when the tab comes back, and marks notifications read for this owner.
 */
export function useOwnerNotifications() {
  const [data, setData] = useState({ notifications: [], unread: 0 })

  const load = useCallback(async () => {
    const res = await ownerApi("/notifications")
    if (res.ok && res.data) setData(res.data)
  }, [])

  const markRead = useCallback(async (ids) => {
    // Show it at once; the server's answer then confirms the list and the count
    setData((prev) => {
      const read = (n) => !ids || ids.includes(n.id)
      const notifications = prev.notifications.map((n) => (read(n) ? { ...n, is_read: true } : n))
      const newlyRead = prev.notifications.filter((n) => read(n) && !n.is_read).length
      return { notifications, unread: ids ? Math.max(0, prev.unread - newlyRead) : 0 }
    })
    const res = await ownerApi("/notifications/read", { method: "POST", body: ids ? { ids } : {} })
    if (res.ok && res.data) setData(res.data)
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    const onVisible = () => document.visibilityState === "visible" && load()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [load])

  return { ...data, load, markRead }
}

/** The bell with the unread count; it opens the list. Clicking a notification marks it read and opens its page. */
export function OwnerNotificationBell({ state, className, align = "end" }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { notifications, unread, load, markRead } = state

  const openOne = (n) => {
    if (!n.is_read) markRead([n.id])
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) load()
      }}
    >
      <PopoverTrigger
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
          className,
        )}
      >
        <IconBell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="font-semibold">
            Notifications
            {unread > 0 && <span className="ml-1.5 text-xs font-medium text-muted-foreground">{unread} new</span>}
          </p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markRead(null)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <IconChecks className="size-3.5" /> Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
              <IconBell className="size-6 opacity-50" />
              No notifications yet. New signups, transfers to approve, registered office requests and card payments
              show up here.
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const kind = KIND[n.kind] || KIND.signup
                const Icon = kind.icon
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openOne(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                        !n.is_read && "bg-primary/[0.04]",
                      )}
                    >
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", kind.tone)}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm leading-snug", n.is_read ? "font-medium" : "font-semibold")}>
                          {n.title}
                        </span>
                        {n.body && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                      </span>
                      {!n.is_read && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
