import * as React from "react"
import { useLocation } from "react-router-dom"
import brixenLogo from "@/assets/white-logo.webp"
import { NavMain } from "@/Layout/nav-main"
import { NavUser } from "@/Layout/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { IconSearch } from "@tabler/icons-react"
import { CommandManyItems } from "@/components/ComboSearch"
import { canOpenPath, isStaffRole, isManagerOrAbove } from "@/lib/permissions"
import { NAV_GROUPS } from "@/lib/nav-groups"
import { apiRequest } from "@/lib/api"

const data = {
  user: {
    name: "Admin",
    email: "admin@example.com",
    avatar: "",
  },
}

/** Open work for the menu badges (Orders, Documents, Support), refreshed on each page and every minute. */
function useNavCounts() {
  const location = useLocation()
  const [counts, setCounts] = React.useState({})

  React.useEffect(() => {
    let cancelled = false
    const load = () =>
      apiRequest("/admin/stats/nav-counts", { label: "Menu counts", silent: true }).then((res) => {
        if (!cancelled && res.ok) setCounts(res.data?.data || {})
      })
    load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [location.pathname])

  return counts
}

export function AppSidebar({
  ...props
}) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  // Grouped menu (Workspace / Operations / Business): each role only sees the pages it can open;
  // staff land on their own work instead of the admin overview
  const navGroups = React.useMemo(() => {
    const staff = isStaffRole()
    return NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items
        .filter((item) => canOpenPath(item.url) && (!item.managerOnly || isManagerOrAbove()))
        .map(({ icon: Icon, ...item }) => ({
          ...item,
          icon: <Icon />,
          title: staff && item.url === "/admin/dashboard" ? "My Dashboard" : item.title,
        })),
    })).filter((group) => group.items.length)
  }, [])
  const counts = useNavCounts()
  const searchKey = /Mac|iPhone|iPad/i.test(typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent)
    ? "⌘K"
    : "Ctrl K"

  return (
    <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The logo large, with room around it and a soft shadow so it stands out on the menu */}
            <div className="flex w-full items-center justify-center px-1 pt-4 pb-3">
              <img
                src={brixenLogo}
                alt="Brixen"
                className="h-16 w-auto max-w-[200px] object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.35)]"
              />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 cursor-pointer"
        >
          <IconSearch className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Search anything</span>
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[10px] text-white/50">{searchKey}</kbd>
        </button>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navGroups} badges={counts} variant="grouped" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <CommandManyItems open={searchOpen} onOpenChange={setSearchOpen} />
    </Sidebar>
  )
}
