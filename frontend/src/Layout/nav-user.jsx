import { Link } from "react-router-dom"
import Notifications from "@/components/Notification"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}') || {}
  } catch {
    return {}
  }
}

/**
 * The signed-in person at the bottom of the menu: avatar, name and email (no menu: the account menu is the
 * one in the header, top right) and a bell that opens the notifications list, with the unread count.
 */
export function NavUser({
  user: defaultUser,
  profileHref = '/admin/settings?tab=profile',
  notificationsHref = '/admin/notifications',
}) {
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
        {/* The bell opens the notifications list beside the menu */}
        <Notifications placement="sidebar" allHref={notificationsHref} />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
