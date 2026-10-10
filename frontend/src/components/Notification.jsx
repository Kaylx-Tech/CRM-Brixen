import React, { useState, useEffect, useCallback } from "react"
import {
  IconBell,
  IconBellRinging,
  IconRefresh,
  IconTrash,
  IconChecks,
  IconAlertCircle,
  IconCircleCheck,
  IconFileText,
  IconPackage,
  IconCreditCard,
  IconArrowRight,
  IconListCheck,
} from "@tabler/icons-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Button } from "./ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRelativeTime, resolveAdminLink } from "@/lib/notifications"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  toastUndoableDelete,
  toastProcessing,
  toastDone,
  toastFail,
} from "@/lib/toastActions"
import { authHeaders } from "@/lib/api"

// Icon mapper by notification type
function getNotificationIcon(type = "") {
  const t = (type || "").toLowerCase()
  if (t.includes("task")) {
    return <IconListCheck className="h-4 w-4 text-violet-500" />
  }
  if (t.includes("order") || t.includes("package")) {
    return <IconPackage className="h-4 w-4 text-blue-500" />
  }
  if (t.includes("payment") || t.includes("invoice")) {
    return <IconCreditCard className="h-4 w-4 text-emerald-500" />
  }
  if (t.includes("doc") || t.includes("kyc")) {
    return <IconFileText className="h-4 w-4 text-amber-500" />
  }
  if (t.includes("alert") || t.includes("warning") || t.includes("overdue")) {
    return <IconAlertCircle className="h-4 w-4 text-destructive" />
  }
  if (t.includes("success") || t.includes("approved")) {
    return <IconCircleCheck className="h-4 w-4 text-emerald-500" />
  }
  return <IconBell className="h-4 w-4 text-primary" />
}

export default function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || "/api"

  // Fetch notifications from backend
  const fetchNotifications = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true)
    try {
      const res = await fetch(`${apiUrl}/client/notifications`, {
        credentials: "include",
        headers: { ...authHeaders() },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === "success" && Array.isArray(data.notifications)) {
          setNotifications(data.notifications)
          setUnreadCount(typeof data.unread_count === "number" ? data.unread_count : 0)
        }
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [apiUrl])

  // Initial fetch, 30s polling (only while the tab is visible) and a refresh when the user comes back to the tab
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchNotifications()
    }, 30000)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchNotifications()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [fetchNotifications])

  // Re-fetch when dropdown opens
  const handleOpenChange = (open) => {
    setIsOpen(open)
    if (open) {
      fetchNotifications()
    }
  }

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    const toastId = toastProcessing("Marking all as read…")
    try {
      const res = await fetch(`${apiUrl}/client/notifications/read`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })))
        setUnreadCount(0)
        toastDone(toastId, "All notifications marked as read")
      } else {
        toastFail(toastId, "Failed to mark notifications as read")
      }
    } catch {
      toastFail(toastId, "Failed to mark notifications as read")
    }
  }

  // Mark single notification as read and navigate if link is present
  const handleNotificationClick = async (item) => {
    if (!item.is_read) {
      try {
        await fetch(`${apiUrl}/client/notifications/read`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: item.id }),
        })
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: 1 } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } catch (err) {
        console.error("Failed to mark notification read:", err)
      }
    }

    const href = resolveAdminLink(item.link)
    if (href) {
      setIsOpen(false)
      if (href.startsWith("http")) {
        window.open(href, "_blank", "noopener,noreferrer")
      } else {
        navigate(href)
      }
    }
  }

  // Clear all notifications (optimistic + Undo)
  const handleClearAll = () => {
    const snapshot = notifications
    const prevUnread = unreadCount
    setNotifications([])
    setUnreadCount(0)

    toastUndoableDelete({
      message: "Notifications cleared",
      description: "Undo available for a few seconds",
      onUndo: () => {
        setNotifications(snapshot)
        setUnreadCount(prevUnread)
      },
      onCommit: async () => {
        const res = await fetch(`${apiUrl}/client/notifications/clear`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        })
        if (res.ok) return
        const delRes = await fetch(`${apiUrl}/client/notifications`, {
          method: "DELETE",
          headers: { ...authHeaders() },
          credentials: "include",
        })
        if (!delRes.ok) throw new Error("Failed to clear notifications")
      },
    })
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className="relative inline-flex items-center justify-center rounded-md p-1.5 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <IconBellRinging className="h-4 w-4 text-primary animate-pulse" />
        ) : (
          <IconBell className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
        )}
        {unreadCount > 0 && (
          <Badge
            variant="default"
            className="absolute -top-1.5 -right-1.5 font-semibold text-[9px] min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground border-2 border-background"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </PopoverTrigger>

      <PopoverContent
        className="w-[calc(100vw-2rem)] sm:w-[26rem] p-0 shadow-xl rounded-xl border border-border/70 overflow-hidden"
        align="end"
      >
        {/* Header */}
        <div className="bg-muted/60 backdrop-blur-sm flex items-center justify-between border-b border-border/60 py-2.5 px-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleMarkAllAsRead}
                title="Mark all as read"
              >
                <IconChecks className="h-3.5 w-3.5 mr-1" />
                Read all
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                onClick={handleClearAll}
                title="Clear all notifications"
              >
                <IconTrash className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => fetchNotifications(true)}
              disabled={isRefreshing}
              title="Refresh"
            >
              <IconRefresh className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 p-2 rounded-lg items-start">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-12" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-10 px-6 flex flex-col items-center justify-center text-center">
            <div className="bg-muted/80 p-3 rounded-full mb-3 text-muted-foreground">
              <IconBell className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1">No notifications</h4>
            <p className="text-xs text-muted-foreground max-w-56 leading-relaxed mb-4">
              You're completely caught up! New alerts and updates will appear here.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 cursor-pointer"
              onClick={() => fetchNotifications(true)}
              disabled={isRefreshing}
            >
              <IconRefresh className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto overscroll-contain">
            <ul className="divide-y divide-border/40">
              {notifications.map((item) => {
                const isUnread = !item.is_read
                const href = resolveAdminLink(item.link)
                return (
                  <li
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleNotificationClick(item)
                      }
                    }}
                    className={`px-4 py-3 transition-colors cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60 flex gap-3 items-start group ${
                      isUnread ? "bg-primary/[0.05]" : ""
                    }`}
                  >
                    {/* Icon */}
                    <div className="h-8 w-8 rounded-lg bg-muted/80 flex items-center justify-center shrink-0 border border-border/40">
                      {getNotificationIcon(item.type)}
                    </div>

                    {/* Notification content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <span className={`text-[13px] leading-snug ${isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>
                          {item.title || "Notification"}
                        </span>
                        {/* The dot slot always takes the same width, so unread and read rows line up */}
                        <span className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <span className="text-[11px] text-muted-foreground/80 whitespace-nowrap">
                            {formatRelativeTime(item.created_at)}
                          </span>
                          <span className={`h-2 w-2 rounded-full ${isUnread ? "bg-primary" : "bg-transparent"}`} />
                        </span>
                      </div>

                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {item.message || item.description || ""}
                      </p>

                      {href && (
                        <div className="mt-1.5 flex items-center text-[11px] font-medium text-primary gap-0.5">
                          <span className="group-hover:underline">View details</span>
                          <IconArrowRight className="h-3 w-3 inline transition-transform group-hover:translate-x-0.5" />
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="border-t border-border/60 px-3 py-2 bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs justify-center cursor-pointer"
            onClick={() => {
              setIsOpen(false)
              navigate("/admin/notifications")
            }}
          >
            View all notifications
            <IconArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
