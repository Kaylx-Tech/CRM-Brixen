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

// Grouped menu look (admin menu): small group headings, roomy rounded rows, the active page as a
// raised pill with its icon in the accent, and count badges
const GROUPED = {
  group: "px-3 py-1.5",
  label: "h-7 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/45",
  menu: "gap-0.5",
  // fs-menu-btn: the pill's settle-in animation (index.css); hover nudges the icon to the right,
  // and a short accent bar grows at the left of the active page
  button:
    "fs-menu-btn relative h-9 gap-3 rounded-lg px-3 text-[13.5px] text-sidebar-foreground/75 transition-[background-color,color,box-shadow] duration-200 hover:bg-white/[0.07] hover:text-sidebar-foreground " +
    "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:font-medium " +
    "data-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_3px_rgba(0,0,0,0.3)] " +
    "before:absolute before:left-1 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:scale-y-0 before:rounded-full before:bg-sidebar-primary before:transition-transform before:duration-300 data-active:before:scale-y-100 " +
    "[&_svg]:size-[18px]! [&_svg]:text-sidebar-foreground/55 [&_svg]:transition-[transform,color] [&_svg]:duration-200 hover:[&_svg]:translate-x-0.5 hover:[&_svg]:text-sidebar-foreground data-active:[&_svg]:text-sidebar-primary",
  badge:
    "fs-menu-badge top-2! right-2 h-5 min-w-5 rounded-full bg-sidebar-primary px-1.5 text-[10.5px] font-semibold text-white! shadow-sm",
}

// Client portal menu in Brixen navy: group titles trailed by a thin line, rows that slide a little on
// hover, and the open page as a white pill with navy text and a blue dot
const PORTAL = {
  group: "px-2 py-1",
  label:
    "h-6 gap-2 px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#8FB3DC] " +
    "after:h-px after:flex-1 after:bg-gradient-to-r after:from-white/15 after:to-transparent after:content-['']",
  menu: "gap-0.5",
  button:
    "relative h-10 gap-3 rounded-xl px-3.5 text-[14px] font-medium text-[#C9D8EC] transition-[background-color,color,transform,box-shadow] duration-200 " +
    "hover:translate-x-0.5 hover:bg-white/[0.08] hover:text-white " +
    "data-active:translate-x-0 data-active:bg-white data-active:font-semibold data-active:text-[#003971] data-active:shadow-[0_6px_18px_rgba(0,0,0,0.25)] " +
    "after:absolute after:right-3 after:top-1/2 after:size-1.5 after:-translate-y-1/2 after:scale-0 after:rounded-full after:bg-[#006CFF] after:transition-transform after:duration-300 after:content-[''] data-active:after:scale-100 " +
    "[&_svg]:size-[18px]! [&_svg]:text-[#8FB3DC] [&_svg]:transition-colors hover:[&_svg]:text-white data-active:[&_svg]:text-[#006CFF]",
  badge: GROUPED.badge,
}

export function NavMain({
  groups = [],
  items,
  badges = {},
  variant,
}) {
  const location = useLocation()
  const styled = variant === "grouped" ? GROUPED : variant === "portal" ? PORTAL : null
  const grouped = variant === "grouped"

  // Support legacy flat `items` prop as a single unlabeled group
  const resolvedGroups =
    groups.length > 0
      ? groups
      : items?.length
        ? [{ label: null, items }]
        : []

  // Row number across all groups, so the grouped menu slides in one row after another
  let row = 0

  return (
    <>
      {resolvedGroups.map((group) => (
        <SidebarGroup key={group.label || "main"} className={styled ? styled.group : undefined}>
          {group.label ? (
            <SidebarGroupLabel
              className={grouped ? cn(GROUPED.label, "fs-menu-row") : styled ? styled.label : undefined}
              style={grouped ? { "--i": row++ } : undefined}
            >
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu className={styled ? styled.menu : undefined}>
              {group.items.map((item) => {
                const pathOnly = item.url.split("?")[0]
                const isActive =
                  location.pathname === pathOnly ||
                  location.pathname.startsWith(`${pathOnly}/`)
                const count = item.badge ? Number(badges[item.badge] || 0) : 0
                const motion = grouped ? { className: "fs-menu-row", style: { "--i": row++ } } : {}
                return (
                  <SidebarMenuItem key={item.title} {...motion}>
                    <SidebarMenuButton
                      render={<Link to={item.url} />}
                      tooltip={item.title}
                      isActive={isActive}
                      className={styled ? cn(styled.button, count > 0 && "pr-10") : undefined}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {count > 0 ? (
                      <SidebarMenuBadge className={styled ? styled.badge : undefined} aria-label={`${count} open`}>
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
