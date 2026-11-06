import React, { useCallback, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  IconArrowBackUp,
  IconChevronDown,
  IconCreditCard,
  IconDeviceDesktop,
  IconHistory,
  IconLogout,
  IconMail,
  IconMoon,
  IconSun,
  IconUser,
  IconUsers,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { apiRequest } from "@/lib/api"
import { getCurrentUser, getRole, homePath, isAdminRole } from "@/lib/permissions"
import { useTheme } from "@/hooks/theme-provider"
import { IS_FINSTAP } from "@/lib/workspace"

// Menu rows: compact, like the sidebar's account menu (small text, small outline icons)
const ROW =
  "gap-2.5 rounded-md px-2 py-1.5 text-sm font-normal text-foreground/90 " +
  "[&_svg]:size-4! [&_svg]:stroke-[1.75] [&_svg]:text-muted-foreground"
// Lines between groups run edge to edge
const SEP = "-mx-1 my-1"

const APPEARANCE = [
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
  { value: "system", label: "Same as this device", Icon: IconDeviceDesktop },
]

/** Light / Dark / System as one segmented switch; the chosen one is raised (no ring). */
function AppearanceSwitch() {
  const { theme, setTheme } = useTheme()
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {APPEARANCE.map(({ value, label, Icon }) => {
        const active = (theme || "system") === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`grid size-6 cursor-pointer place-items-center rounded-md transition-[background-color,color,box-shadow] duration-200 ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5 stroke-[1.75]" />
          </button>
        )
      })}
    </div>
  )
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U"
}

function roleLabel(role) {
  return String(role || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Save the session the server handed back and reload, so every role-based screen re-renders for that user. */
function applySession(token, user) {
  localStorage.setItem("token", token)
  localStorage.setItem("user", JSON.stringify(user))
  window.location.assign(homePath(user))
}

/**
 * Header account menu with "Switch user" (old portal feature): admins open the CRM as a lower-ranked team
 * member to see exactly what they see, then return to their own account.
 */
export default function TeamSwitcher() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const role = getRole(user)
  const isClient = role === "CLIENT"
  const impersonated = Boolean(user.impersonated)
  const canSwitch = isAdminRole(user) && !impersonated

  const [users, setUsers] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const loadUsers = useCallback(async () => {
    if (!canSwitch || users) return
    const res = await apiRequest("/auth/switch-users", { silent: true, label: "Switch user" })
    setUsers(res.ok ? (res.data?.data?.users || []) : [])
  }, [canSwitch, users])

  const switchTo = async (target) => {
    setBusyId(target.id)
    const res = await apiRequest("/auth/switch-user", {
      method: "POST",
      body: { user_id: target.id },
      silent: true,
      label: "Switch user",
    })
    if (!res.ok) {
      setBusyId(null)
      toast.error(res.reason || "Could not switch user")
      return
    }
    applySession(res.data.data.token, res.data.data.user)
  }

  const switchBack = async () => {
    setBusyId("back")
    const res = await apiRequest("/auth/switch-back", { method: "POST", silent: true, label: "Switch user" })
    if (!res.ok) {
      setBusyId(null)
      toast.error(res.reason || "Could not return to your account")
      return
    }
    applySession(res.data.data.token, res.data.data.user)
  }

  const signOut = async () => {
    await apiRequest("/auth/logout", { method: "POST", silent: true, label: "Sign out" }).catch(() => null)
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    navigate("/login")
  }

  const name = user.full_name || user.name || user.email || "Account"
  const subtitle = impersonated
    ? `Viewing as ${roleLabel(role)}`
    : isClient ? "Customer portal" : `${roleLabel(role)} CRM view`

  return (
    <DropdownMenu onOpenChange={(open) => open && loadUsers()}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={`h-auto gap-2 px-1.5 py-1 ${impersonated ? "bg-amber-500/10 hover:bg-amber-500/15" : ""}`}
            aria-label="Account menu"
          />
        }
      >
        <Avatar className="size-8">
          <AvatarImage src={user.avatar_url || ""} alt={name} />
          <AvatarFallback className={impersonated ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"}>
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 flex-col items-start text-left leading-tight sm:flex">
          <span className="max-w-40 truncate text-sm font-medium">{name}</span>
          <span className={`max-w-40 truncate text-xs ${impersonated ? "text-amber-600" : "text-muted-foreground"}`}>{subtitle}</span>
        </span>
        <IconChevronDown className="hidden size-4 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 rounded-xl p-1 shadow-lg">
        {/* Who is signed in */}
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="size-7">
            <AvatarImage src={user.avatar_url || ""} alt={name} />
            <AvatarFallback className={impersonated ? "bg-amber-500 text-white" : "bg-primary/15 text-xs font-semibold text-primary"}>
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            {user.email && user.email !== name ? (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            ) : null}
          </div>
        </div>
        <DropdownMenuSeparator className={SEP} />

        {impersonated ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">
                Signed in as {user.impersonator_name || "admin"}, viewing as {name}
              </DropdownMenuLabel>
              <DropdownMenuItem className={ROW} onClick={switchBack} disabled={busyId === "back"}>
                {busyId === "back" ? <Spinner /> : <IconArrowBackUp />}
                Return to my account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className={SEP} />
          </>
        ) : null}

        {canSwitch ? (
          <>
            <DropdownMenuGroup>
              {/* Switch user: one row; the team opens beside it, so the menu stays small */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={ROW}>
                  <IconUsers />
                  Switch user
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-60 rounded-xl p-1">
                  {users === null ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"><Spinner /> Loading team…</div>
                  ) : users.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">No other team members to switch to.</p>
                  ) : (
                    users.map((u) => (
                      <DropdownMenuItem key={u.id} className="gap-2 rounded-md px-2 py-1.5" onClick={() => switchTo(u)} disabled={busyId !== null}>
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[10px]">{initials(u.full_name)}</AvatarFallback>
                        </Avatar>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm">{u.full_name}</span>
                          <span className="truncate text-[11px] text-muted-foreground">{u.role}</span>
                        </span>
                        {busyId === u.id ? <Spinner className="ml-auto" /> : null}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className={SEP} />
          </>
        ) : null}

        <DropdownMenuGroup>
          <DropdownMenuItem className={ROW} onClick={() => navigate(isClient ? "/portal/profile" : "/admin/settings?tab=profile")}>
            <IconUser />
            Profile &amp; password
          </DropdownMenuItem>
          {/* Admins: the logs and the plan (these were in the menu at the bottom of the sidebar) */}
          {!isClient && isAdminRole(user) ? (
            <>
              <DropdownMenuItem className={ROW} onClick={() => navigate("/admin/logs")}>
                <IconHistory />
                System logs
              </DropdownMenuItem>
              <DropdownMenuItem className={ROW} onClick={() => navigate("/admin/email-log")}>
                <IconMail />
                Email log
              </DropdownMenuItem>
              {IS_FINSTAP ? (
                <DropdownMenuItem className={ROW} onClick={() => navigate("/admin/billing")}>
                  <IconCreditCard />
                  Billing
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className={SEP} />

        {/* Appearance stays in the menu while it is changed (not a menu item, so it does not close it) */}
        <div className="flex items-center justify-between gap-2 px-2 py-1 text-sm text-foreground/90">
          <span className="flex items-center gap-2.5">
            <IconSun className="size-4 stroke-[1.75] text-muted-foreground" />
            Appearance
          </span>
          <AppearanceSwitch />
        </div>
        <DropdownMenuSeparator className={SEP} />

        <DropdownMenuGroup>
          <DropdownMenuItem className={`${ROW} text-destructive! [&_svg]:text-destructive!`} onClick={signOut}>
            <IconLogout />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
