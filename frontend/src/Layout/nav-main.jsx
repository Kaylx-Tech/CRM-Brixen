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
import { FINSTAP_MENU } from "@/lib/finstap-menu"

const FINSTAP = FINSTAP_MENU

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
