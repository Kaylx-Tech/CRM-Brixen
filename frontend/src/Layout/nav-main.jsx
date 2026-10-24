import { Link, useLocation } from "react-router-dom"
import { cn } from "cn"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Finstap menu look: small group headings, roomy rounded rows, the active page as a raised pill
// in the menu's own (accent-derived) colours with its icon in the accent, and count badges
const FINSTAP = {
  group: "px-3 py-1.5",
  label: "h-7 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/45",
  menu: "gap-0.5",
  button:
    "h-9 gap-3 rounded-lg px-3 text-[13.5px] text-sidebar-foreground/75 transition-colors hover:bg-white/[0.06] hover:text-sidebar-foreground " +
    "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:font-medium " +
    "data-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_3px_rgba(0,0,0,0.3)] " +
    "[&_svg]:size-[18px]! [&_svg]:text-sidebar-foreground/55 hover:[&_svg]:text-sidebar-foreground data-active:[&_svg]:text-sidebar-primary",
  badge:
    "top-2! right-2 h-5 min-w-5 rounded-full bg-sidebar-primary px-1.5 text-[10.5px] font-semibold text-sidebar-primary-foreground! shadow-sm",
}

export function NavMain({
  groups = [],
  items,
  badges = {},
  variant,
}) {
  const location = useLocation()
  const finstap = variant === "finstap"

  // Support legacy flat `items` prop as a single unlabeled group
  const resolvedGroups =
    groups.length > 0
      ? groups
      : items?.length
        ? [{ label: null, items }]
        : []

  return (
    <>
      {resolvedGroups.map((group) => (
        <SidebarGroup key={group.label || "main"} className={finstap ? FINSTAP.group : undefined}>
          {group.label ? (
            <SidebarGroupLabel className={finstap ? FINSTAP.label : undefined}>{group.label}</SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu className={finstap ? FINSTAP.menu : undefined}>
              {group.items.map((item) => {
                const pathOnly = item.url.split("?")[0]
                const isActive =
                  location.pathname === pathOnly ||
                  location.pathname.startsWith(`${pathOnly}/`)
                const count = item.badge ? Number(badges[item.badge] || 0) : 0
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link to={item.url} />}
                      tooltip={item.title}
                      isActive={isActive}
                      className={finstap ? cn(FINSTAP.button, count > 0 && "pr-10") : undefined}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {count > 0 ? (
                      <SidebarMenuBadge className={finstap ? FINSTAP.badge : undefined} aria-label={`${count} open`}>
                        {count > 99 ? "99+" : count}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
