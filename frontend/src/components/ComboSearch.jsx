"use client"

import * as React from "react"
import { useNavigate } from "react-router-dom"
import { canOpenPath, isAdminRole } from "@/lib/permissions"
import {
  IconDashboard,
  IconUsers,
  IconBuilding,
  IconCalculator,
  IconShoppingCart,
  IconListCheck,
  IconApps,
  IconFileInvoice,
  IconFileCheck,
  IconBrain,
  IconHistory,
  IconMail,
  IconSettings,
  IconUserCircle,
  IconBell,
  IconSearchOff,
} from "@tabler/icons-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

const commandGroups = [
  {
    heading: "Navigation",
    items: [
      { title: "Overview", url: "/admin/dashboard", icon: IconDashboard },
      { title: "Customers / Signups", url: "/admin/customers", icon: IconUsers },
      { title: "Company Registered", url: "/admin/companies", icon: IconBuilding },
      { title: "Orders Manager", url: "/admin/orders", icon: IconShoppingCart },
    ],
  },
  {
    heading: "Services & Operations",
    items: [
      { title: "Tasks & Team", url: "/admin/tasks", icon: IconListCheck },
      { title: "Services Catalog", url: "/admin/services", icon: IconApps },
      { title: "Smart Intake", url: "/admin/intake", icon: IconBrain },
    ],
  },
  {
    heading: "Finance & Documents",
    items: [
      { title: "Accountancy", url: "/admin/accountancy", icon: IconCalculator },
      { title: "Payment/Invoices", url: "/admin/payments", icon: IconFileInvoice },
      { title: "Documents Review", url: "/admin/documents", icon: IconFileCheck },
    ],
  },
  {
    heading: "System & Account",
    items: [
      { title: "Notifications", url: "/admin/notifications", icon: IconBell },
      { title: "Audit Logs", url: "/admin/logs", icon: IconHistory },
      { title: "Email Log", url: "/admin/email-log", icon: IconMail },
      { title: "System Settings", url: "/admin/settings", icon: IconSettings },
      { title: "Profile & Password", url: "/admin/settings?tab=profile", icon: IconUserCircle },
    ],
  },
]

export function CommandManyItems({ open: controlledOpen, onOpenChange: setControlledOpen }) {
  const navigate = useNavigate()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  // Only offer pages this role can open ("System Settings" itself is admin-only; profile is for everyone)
  const visibleGroups = React.useMemo(() => {
    const admin = isAdminRole()
    return commandGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          canOpenPath(item.url) && (admin || item.url !== "/admin/settings")),
      }))
      .filter((group) => group.items.length > 0)
  }, [])

  const setOpen = React.useCallback((value) => {
    if (setControlledOpen) {
      setControlledOpen(value)
    }
    if (!isControlled) {
      setInternalOpen(value)
    }
  }, [setControlledOpen, isControlled])

  React.useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [setOpen])

  const handleSelect = (url) => {
    setOpen(false)
    navigate(url)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="Type a command or search page..." />
        <CommandList>
          <CommandEmpty>
            <div className="flex flex-col items-center justify-center gap-2 py-4 text-muted-foreground">
              <IconSearchOff className="size-8 opacity-40 stroke-1" />
              <span>No results found.</span>
            </div>
          </CommandEmpty>

          {visibleGroups.map((group, idx) => (
            <React.Fragment key={group.heading}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.url}
                      value={`${group.heading} ${item.title}`}
                      onSelect={() => handleSelect(item.url)}
                      className="cursor-pointer"
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{item.title}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
