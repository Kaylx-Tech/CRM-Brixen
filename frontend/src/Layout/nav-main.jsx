import { Link, useLocation } from "react-router-dom"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
  groups = [],
  items,
}) {
  const location = useLocation()

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
        <SidebarGroup key={group.label || "main"}>
          {group.label ? (
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => {
                const pathOnly = item.url.split("?")[0]
                const isActive =
                  location.pathname === pathOnly ||
                  location.pathname.startsWith(`${pathOnly}/`)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link to={item.url} />}
                      tooltip={item.title}
                      isActive={isActive}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
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
