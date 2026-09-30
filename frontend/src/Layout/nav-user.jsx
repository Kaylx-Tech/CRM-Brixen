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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { IconDotsVertical, IconUserCircle, IconCreditCard, IconNotification, IconLogout } from "@tabler/icons-react"
import { Link, useNavigate } from "react-router-dom"

export function NavUser({
  user: defaultUser
}) {
  const navigate = useNavigate()
  const { isMobile } = useSidebar()

  let storedUser = {}
  try {
    storedUser = JSON.parse(localStorage.getItem('user') || '{}')
  } catch (e) {}

  const user = {
    name: storedUser.full_name || storedUser.name || defaultUser?.name || 'Administrator',
    email: storedUser.email || defaultUser?.email || 'admin@brixenconsultants.com',
    avatar: storedUser.avatar_url || defaultUser?.avatar || '',
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
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
              <AvatarFallback className="rounded-lg bg-white/10 text-white font-medium text-xs border border-white/10">
                {(user.name || 'AD').substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium text-sidebar-foreground">{user.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">
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
                onClick={() => navigate('/admin/profile')}
                className="text-slate-200 hover:text-white hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium flex items-center gap-2 transition-colors"
              >
                <IconUserCircle className="size-4 text-slate-400" />
                <span>Account</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => navigate('/admin/payments')}
                className="text-slate-200 hover:text-white hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium flex items-center gap-2 transition-colors"
              >
                <IconCreditCard className="size-4 text-slate-400" />
                <span>Billing</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => navigate('/admin/tasks')}
                className="text-slate-200 hover:text-white hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium flex items-center gap-2 transition-colors"
              >
                <IconNotification className="size-4 text-slate-400" />
                <span>Notifications</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-white/10 my-1" />
            <DropdownMenuItem 
              onClick={handleLogout} 
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-300 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium flex items-center gap-2 transition-colors"
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
