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
} from "@tabler/icons-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

// ==========================================
// Time Helper
// ==========================================
function formatRelativeTime(dateStr) {
  if (!dateStr) return "just now"
  try {
    const normalized = dateStr.includes(" ") && !dateStr.includes("T")
      ? dateStr.replace(" ", "T") + "Z"
      : dateStr
    const date = new Date(normalized)
    if (isNaN(date.getTime())) return dateStr
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 45) return "just now"
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-GB", { month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

// Icon mapper by notification type
function getNotificationIcon(type = "") {
  const t = (type || "").toLowerCase()
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

  // Initial fetch and 60s periodic polling
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(() => {
      fetchNotifications()
    }, 60000)
    return () => clearInterval(interval)
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
    try {
      const res = await fetch(`${apiUrl}/client/notifications/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })))
        setUnreadCount(0)
        toast.success("All notifications marked as read")
      }
    } catch {
      toast.error("Failed to mark notifications as read")
    }
  }

  // Mark single notification as read and navigate if link is present
  const handleNotificationClick = async (item) => {
    if (!item.is_read) {
      try {
        await fetch(`${apiUrl}/client/notifications/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

    if (item.link) {
      setIsOpen(false)
      if (item.link.startsWith("http")) {
        window.open(item.link, "_blank")
      } else {
        navigate(item.link)
      }
    }
  }

  // Clear all notifications
  const handleClearAll = async () => {
    try {
      const res = await fetch(`${apiUrl}/client/notifications/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setNotifications([])
        setUnreadCount(0)
        toast.success("Notifications cleared")
      } else {
        const delRes = await fetch(`${apiUrl}/client/notifications`, {
          method: "DELETE",
          credentials: "include",
        })
        if (delRes.ok) {
          setNotifications([])
          setUnreadCount(0)
          toast.success("Notifications cleared")
        }
      }
    } catch {
      toast.error("Failed to clear notifications")
    }
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
        className="w-80 sm:w-96 p-0 shadow-xl rounded-xl border border-border/70 overflow-hidden"
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
          <ScrollArea className="max-h-[380px]">
            <ul className="divide-y divide-border/40">
              {notifications.map((item) => {
                const isUnread = !item.is_read
                return (
                  <li
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 transition-all cursor-pointer hover:bg-muted/60 relative flex gap-3 items-start group ${
                      isUnread ? "bg-primary/[0.04]" : ""
                    }`}
                  >
                    {/* Icon */}
                    <div className="h-8 w-8 rounded-lg bg-muted/80 flex items-center justify-center shrink-0 mt-0.5 border border-border/40">
                      {getNotificationIcon(item.type)}
                    </div>

                    {/* Notification content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs font-medium truncate ${isUnread ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                          {item.title || "Notification"}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 shrink-0 font-normal">
                          {formatRelativeTime(item.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {item.message || item.description || ""}
                      </p>

                      {item.link && (
                        <div className="mt-1.5 flex items-center text-[11px] font-medium text-primary hover:underline gap-0.5">
                          <span>View details</span>
                          <IconArrowRight className="h-3 w-3 inline transition-transform group-hover:translate-x-0.5" />
                        </div>
                      )}
                    </div>

                    {/* Unread dot indicator */}
                    {isUnread && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0 self-center" />
                    )}
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
