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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { IconArrowBackUp, IconChevronDown, IconLogout, IconUserCircle } from "@tabler/icons-react"
import { toast } from "sonner"
import { apiRequest } from "@/lib/api"
import { getCurrentUser, getRole, homePath, isAdminRole } from "@/lib/permissions"

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

      <DropdownMenuContent align="end" className="w-72">
        {impersonated ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">
                Signed in as {user.impersonator_name || "admin"}, viewing as {name}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={switchBack} disabled={busyId === "back"}>
                {busyId === "back" ? <Spinner /> : <IconArrowBackUp />}
                Return to my account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {canSwitch ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-semibold tracking-wide uppercase">Switch user</DropdownMenuLabel>
              {users === null ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><Spinner /> Loading team…</div>
              ) : users.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">No other team members to switch to.</p>
              ) : (
                users.map((u) => (
                  <DropdownMenuItem key={u.id} onClick={() => switchTo(u)} disabled={busyId !== null}>
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{initials(u.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{u.full_name}</span>
                      <span className="truncate text-xs text-muted-foreground">{u.role} · {u.email}</span>
                    </span>
                    {busyId === u.id ? <Spinner className="ml-auto" /> : null}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => navigate(isClient ? "/portal/profile" : "/admin/settings?tab=profile")}>
            <IconUserCircle />
            Profile &amp; Password
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={signOut}>
            <IconLogout />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
