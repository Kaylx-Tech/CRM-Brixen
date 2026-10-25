import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  IconBell,
  IconTrash,
  IconChecks,
  IconAlertCircle,
  IconCircleCheck,
  IconFileText,
  IconPackage,
  IconCreditCard,
  IconArrowRight,
  IconLoader2,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest, getApiBase, toastApiEmpty } from '@/lib/api'
import { formatRelativeTime, resolveAdminLink } from '@/lib/notifications'
import {
  toastUndoableDelete,
  toastProcessing,
  toastDone,
  toastFail,
} from '@/lib/toastActions'
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn"

function formatWhen(dateStr) {
  if (!dateStr) return '—'
  try {
    const normalized =
      dateStr.includes(' ') && !dateStr.includes('T')
        ? dateStr.replace(' ', 'T') + 'Z'
        : dateStr
    const date = new Date(normalized)
    if (Number.isNaN(date.getTime())) return String(dateStr)
    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(dateStr)
  }
}

function getNotificationIcon(type = '') {
  const t = String(type || '').toLowerCase()
  if (t.includes('order') || t.includes('package') || t.includes('task')) {
    return <IconPackage className="h-4 w-4 text-sky-600" />
  }
  if (t.includes('payment') || t.includes('invoice')) {
    return <IconCreditCard className="h-4 w-4 text-emerald-600" />
  }
  if (t.includes('doc') || t.includes('kyc')) {
    return <IconFileText className="h-4 w-4 text-amber-600" />
  }
  if (t.includes('alert') || t.includes('warning') || t.includes('overdue')) {
    return <IconAlertCircle className="h-4 w-4 text-destructive" />
  }
  if (t.includes('success') || t.includes('approved')) {
    return <IconCircleCheck className="h-4 w-4 text-emerald-600" />
  }
  return <IconBell className="h-4 w-4 text-primary" />
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [acting, setActing] = useState('')
  const [loadError, setLoadError] = useState(null)

  const loadNotifications = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest('/client/notifications?limit=100', {
        label: 'Notifications',
      })
      if (!res.ok) {
        setNotifications([])
        setUnreadCount(0)
        setLoadError(res.reason)
        return
      }
      const payload = res.data || {}
      const list = Array.isArray(payload.notifications)
        ? payload.notifications
        : Array.isArray(payload.data?.notifications)
          ? payload.data.notifications
          : []
      setNotifications(list)
      const unread =
        typeof payload.unread_count === 'number'
          ? payload.unread_count
          : list.filter((n) => !n.is_read).length
      setUnreadCount(unread)
      if (list.length === 0) toastApiEmpty('Notifications', getApiBase())
    } catch (err) {
      setNotifications([])
      setUnreadCount(0)
      setLoadError(err?.message || 'Unexpected error')
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(loadNotifications)

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const filtered = useMemo(() => {
    if (tab === 'unread') return notifications.filter((n) => !n.is_read)
    return notifications
  }, [notifications, tab])

  const markAllRead = async () => {
    setActing('read')
    const toastId = toastProcessing('Marking all as read…')
    try {
      const res = await apiRequest('/client/notifications/read', {
        method: 'POST',
        body: JSON.stringify({}),
        label: 'Mark read',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Failed to mark as read')
        return
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })))
      setUnreadCount(0)
      toastDone(toastId, 'All notifications marked as read')
    } finally {
      setActing('')
    }
  }

  const clearAll = () => {
    const snapshot = notifications
    const prevUnread = unreadCount
    setActing('')
    setNotifications([])
    setUnreadCount(0)

    toastUndoableDelete({
      message: 'Notifications cleared',
      description: 'Undo available for a few seconds',
      onUndo: () => {
        setNotifications(snapshot)
        setUnreadCount(prevUnread)
      },
      onCommit: async () => {
        const res = await apiRequest('/client/notifications/clear', {
          method: 'POST',
          body: JSON.stringify({}),
          label: 'Clear notifications',
          silent: true,
        })
        if (!res.ok) {
          const del = await apiRequest('/client/notifications', {
            method: 'DELETE',
            label: 'Clear notifications',
            silent: true,
          })
          if (!del.ok) {
            throw new Error(del.reason || res.reason || 'Failed to clear notifications')
          }
        }
      },
    })
  }

  const openItem = async (item) => {
    if (!item.is_read) {
      try {
        await apiRequest('/client/notifications/read', {
          method: 'POST',
          body: JSON.stringify({ id: item.id }),
          silent: true,
          label: 'Mark read',
        })
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: 1 } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } catch (_) {
        /* ignore */
      }
    }
    const href = resolveAdminLink(item.link)
    if (!href) return
    if (href.startsWith('http')) window.open(href, '_blank', 'noopener,noreferrer')
    else navigate(href)
  }

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Alerts for orders, tasks, documents, and account activity
            {unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllRead} disabled={!!acting}>
              {acting === 'read' ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconChecks className="mr-2 h-4 w-4" />
              )}
              Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="outline" onClick={clearAll} disabled={!!acting}>
              {acting === 'clear' ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconTrash className="mr-2 h-4 w-4" />
              )}
              Clear all
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto flex-wrap bg-background gap-1 p-1">
          <TabsTrigger
            value="all"
            className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            All
            <span className="ml-1.5 rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0 text-[10px] font-semibold">
              {notifications.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="unread"
            className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Unread
            <span className="ml-1.5 rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0 text-[10px] font-semibold">
              {unreadCount}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <div className="rounded-md border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <IconLoader2 className="h-4 w-4 animate-spin" />
            Loading notifications…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3 text-muted-foreground">
              <IconBell className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold">
              {tab === 'unread' ? 'No unread notifications' : 'No notifications'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {tab === 'unread'
                ? 'You’re all caught up. Switch to All to see older alerts.'
                : 'New order, task, and document alerts will show up here.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((item) => {
              const unread = !item.is_read
              const href = resolveAdminLink(item.link)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={`w-full text-left px-4 py-3.5 flex gap-3 items-start transition-colors hover:bg-muted/50 ${
                      unread ? 'bg-primary/[0.03]' : ''
                    }`}
                  >
                    <div className="h-9 w-9 rounded-md border bg-muted/40 flex items-center justify-center shrink-0 mt-0.5">
                      {getNotificationIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm truncate ${
                                unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
                              }`}
                            >
                              {item.title || 'Notification'}
                            </span>
                            {item.type ? (
                              <Badge className="bg-muted text-muted-foreground text-[10px]">
                                {String(item.type).replace(/_/g, ' ')}
                              </Badge>
                            ) : null}
                            {unread ? (
                              <Badge className="badge-sky text-[10px]">Unread</Badge>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            {item.message || '—'}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{formatRelativeTime(item.created_at)}</span>
                            <span>·</span>
                            <span>{formatWhen(item.created_at)}</span>
                          </div>
                          {href ? (
                            <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                              View details
                              <IconArrowRight className="h-3 w-3" />
                            </div>
                          ) : null}
                        </div>
                        {unread ? (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
