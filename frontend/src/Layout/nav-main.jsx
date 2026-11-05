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
  label: "h-7 px-3 text-[0.6875rem] font-medium uppercase tracking-wider text-sidebar-foreground/45",
  menu: "gap-0.5",
  // fs-menu-btn: the pill's settle-in animation (index.css); hover nudges the icon to the right,
  // and a short accent bar grows at the left of the active page
  button:
    "fs-menu-btn relative h-9 gap-3 rounded-lg px-3 text-[0.84375rem] text-sidebar-foreground/75 transition-[background-color,color,box-shadow] duration-200 hover:bg-white/[0.07] hover:text-sidebar-foreground " +
    "data-active:bg-sidebar-primary/15 data-active:text-[color-mix(in_oklab,var(--sidebar-primary),white_30%)] data-active:font-medium data-active:ring-1 data-active:ring-inset data-active:ring-sidebar-primary/45 " +
    "before:absolute before:left-1 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:scale-y-0 before:rounded-full before:bg-sidebar-primary before:transition-transform before:duration-300 data-active:before:scale-y-100 " +
    "[&_svg]:size-[1.125rem]! [&_svg]:text-sidebar-foreground/55 [&_svg]:transition-[transform,color] [&_svg]:duration-200 hover:[&_svg]:translate-x-0.5 hover:[&_svg]:text-sidebar-foreground data-active:[&_svg]:text-sidebar-primary",
  badge:
    "fs-menu-badge top-2! right-2 h-5 min-w-5 rounded-full bg-sidebar-primary px-1.5 text-[0.65625rem] font-semibold text-sidebar-primary-foreground! shadow-sm",
  // A tiny word raised just above the end of the title (`tag` in finstap-nav.js, e.g. "Soon"), like a
  // superscript: an accent gradient pill with a fine light edge and a shine that passes now and then
  tag:
    "fs-menu-tag -ml-1 shrink-0 self-start -translate-y-1 text-[0.625rem] leading-none font-medium lowercase text-sidebar-primary group-data-[collapsible=icon]:hidden",
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

  // Row number across all groups, so the Finstap menu slides in one row after another
  let row = 0

  return (
    <>
      {resolvedGroups.map((group) => (
        <SidebarGroup key={group.label || "main"} className={finstap ? FINSTAP.group : undefined}>
          {group.label ? (
            <SidebarGroupLabel
              className={finstap ? cn(FINSTAP.label, "fs-menu-row") : undefined}
              style={finstap ? { "--i": row++ } : undefined}
            >
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu className={finstap ? FINSTAP.menu : undefined}>
              {group.items.map((item) => {
                const pathOnly = item.url.split("?")[0]
                const isActive =
                  location.pathname === pathOnly ||
                  location.pathname.startsWith(`${pathOnly}/`)
                const count = item.badge ? Number(badges[item.badge] || 0) : 0
                const motion = finstap ? { className: "fs-menu-row", style: { "--i": row++ } } : {}
                return (
                  <SidebarMenuItem key={item.title} {...motion}>
                    <SidebarMenuButton
                      render={<Link to={item.url} />}
                      tooltip={item.title}
                      isActive={isActive}
                      className={finstap ? cn(FINSTAP.button, count > 0 && "pr-10") : undefined}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                      {finstap && item.tag ? (
                        <span className={FINSTAP.tag} style={motion.style}>
                          {item.tag}
                        </span>
                      ) : null}
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
