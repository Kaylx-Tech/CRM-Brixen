import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { IconBell } from "@tabler/icons-react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { authHeaders, getApiBase } from "@/lib/api"

/** Unread notifications for the bell, refreshed on each page and every minute while the tab is open. */
function useUnreadCount() {
  const { pathname } = useLocation()
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch(`${getApiBase()}/client/notifications`, { credentials: "include", headers: { ...authHeaders() } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (alive && data && typeof data.unread_count === "number") setCount(data.unread_count)
        })
        .catch(() => {})
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load()
    }, 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [pathname])
  return count
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}') || {}
  } catch {
    return {}
  }
}

/**
 * The signed-in person at the bottom of the menu: avatar, name and email (no menu: the account menu is the
 * one in the header, top right) and a bell that opens the notifications, with a dot while some are unread.
 */
export function NavUser({
  user: defaultUser,
  profileHref = '/admin/settings?tab=profile',
  notificationsHref = '/admin/notifications',
}) {
  const unread = useUnreadCount()

  const storedUser = readStoredUser()

  const user = {
    name: storedUser.full_name || storedUser.name || defaultUser?.name || 'Administrator',
    email: storedUser.email || defaultUser?.email || '',
    avatar: storedUser.avatar_url || defaultUser?.avatar || '',
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-1">
        <Link
          to={profileHref}
          title="Profile & password"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-sidebar-foreground transition-colors hover:bg-white/[0.07]"
        >
          <Avatar className="size-8 rounded-lg">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="rounded-lg border border-white/10 bg-white/10 text-sm font-medium text-white">
              {(user.name || 'AD').substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-[0.8125rem] font-medium text-sidebar-foreground">{user.name}</span>
            <span className="truncate text-xs text-sidebar-foreground/65">{user.email}</span>
          </div>
        </Link>
        <Link
          to={notificationsHref}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          title="Notifications"
          className="relative flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
        >
          <IconBell className="size-[1.125rem] stroke-[1.75]" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-sidebar-primary ring-2 ring-sidebar" />
          )}
        </Link>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
