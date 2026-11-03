import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { toast } from "sonner"
import {
  IconDotsVertical,
  IconUserCircle,
  IconCreditCard,
  IconNotification,
  IconLogout,
  IconHistory,
  IconMail,
  IconSettings,
} from "@tabler/icons-react"
import { useNavigate } from "react-router-dom"
import { isAdminRole } from "@/lib/permissions"
import { IS_FINSTAP } from "@/lib/workspace"

const itemClass =
  "text-slate-200 hover:text-white hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium flex items-center gap-2 transition-colors"

export function NavUser({
  user: defaultUser,
  profileHref = '/admin/settings?tab=profile',
  notificationsHref = '/admin/notifications',
}) {
  const navigate = useNavigate()

  let storedUser = {}
  try {
    storedUser = JSON.parse(localStorage.getItem('user') || '{}')
  } catch (e) {}

  const user = {
    name: storedUser.full_name || storedUser.name || defaultUser?.name || 'Administrator',
    email: storedUser.email || defaultUser?.email || '',
    avatar: storedUser.avatar_url || defaultUser?.avatar || '',
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent aria-expanded:bg-sidebar-accent transition-colors"
              />
            }
          >
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg bg-white/10 text-white font-medium text-sm border border-white/10">
                {(user.name || 'AD').substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium text-sidebar-foreground">{user.name}</span>
              <span className="truncate text-sm text-sidebar-foreground/70">
                {user.email}
              </span>
            </div>
            <IconDotsVertical className="ml-auto size-4 text-sidebar-foreground/70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 dark bg-sidebar"
            side="top"
            align="start"
            sideOffset={8}
          >
            <DropdownMenuGroup className="space-y-0.5">
              <DropdownMenuItem
                onClick={() => navigate(profileHref)}
                className={itemClass}
              >
                <IconUserCircle className="size-4" />
                <span>Account</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(notificationsHref)}
                className={itemClass}
              >
                <IconNotification className="size-4" />
                <span>Notifications</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            {/* System logs and settings are admin-only */}
            {isAdminRole() && (
              <>
                <DropdownMenuSeparator className="bg-white/10 my-1" />

                <DropdownMenuGroup className="space-y-0.5">
                  <DropdownMenuItem
                    onClick={() => navigate('/admin/logs')}
                    className={itemClass}
                  >
                    <IconHistory className="size-4" />
                    <span>System Logs</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate('/admin/email-log')}
                    className={itemClass}
                  >
                    <IconMail className="size-4" />
                    <span>Email Log</span>
                  </DropdownMenuItem>
                  {/* Finstap: the workspace's own plan and card payments (admins only, like this group) */}
                  {IS_FINSTAP && (
                    <DropdownMenuItem
                      onClick={() => navigate('/admin/billing')}
                      className={itemClass}
                    >
                      <IconCreditCard className="size-4" />
                      <span>Billing</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => navigate('/admin/settings')}
                    className={itemClass}
                  >
                    <IconSettings className="size-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}

            <DropdownMenuSeparator className="bg-white/10 my-1" />

            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-300 cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <IconLogout className="size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
