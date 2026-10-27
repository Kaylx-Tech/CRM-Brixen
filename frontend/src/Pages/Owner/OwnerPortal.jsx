import { useEffect, useState } from "react"
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom"
import { cn } from "cn"
import {
  IconActivity,
  IconBuildingSkyscraper,
  IconLayoutDashboard,
  IconLogout,
  IconTags,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { getOwnerToken, ownerApi, setOwnerToken } from "@/lib/owner"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapLogoLight from "@/assets/finstap-logo-light.svg"
import { OwnerForgot, OwnerLogin, OwnerSetPassword } from "./OwnerAuth"
import OwnerOverview from "./OwnerOverview"
import OwnerWorkspaces from "./OwnerWorkspaces"
import OwnerWorkspace from "./OwnerWorkspace"
import OwnerPlans from "./OwnerPlans"
import OwnerActivity from "./OwnerActivity"

const NAV = [
  ["Overview", "/owner", IconLayoutDashboard, true],
  ["Workspaces", "/owner/workspaces", IconBuildingSkyscraper, false],
  ["Plans", "/owner/plans", IconTags, false],
  ["Activity", "/owner/activity", IconActivity, false],
]

function OwnerShell({ admin, onSignOut, children }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/owner" className="flex shrink-0 items-center gap-2">
            <img src={finstapLogo} alt="Finstap" className="h-7 w-auto dark:hidden" />
            <img src={finstapLogoLight} alt="Finstap" className="hidden h-7 w-auto dark:block" />
            <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary sm:inline">
              Owner
            </span>
          </NavLink>
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {NAV.map(([label, to, Icon, end]) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline">{admin?.full_name || admin?.email}</span>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <IconLogout className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}

/**
 * The Finstap owner portal. Signed out: /owner/login, /owner/forgot and /owner/set-password (the
 * emailed link). Signed in: overview, workspaces and their subscriptions, plans and activity.
 */
export default function OwnerPortal() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)
  const [checking, setChecking] = useState(Boolean(getOwnerToken()))

  useEffect(() => {
    document.title = "Owner portal · Finstap"
    let alive = true
    if (getOwnerToken()) {
      ownerApi("/me").then((res) => {
        if (!alive) return
        if (res.ok) setAdmin(res.data.admin)
        setChecking(false)
      })
    }
    const signedOut = () => setAdmin(null)
    window.addEventListener("owner-signed-out", signedOut)
    return () => {
      alive = false
      window.removeEventListener("owner-signed-out", signedOut)
    }
  }, [])

  if (checking) return <div className="min-h-screen bg-background" />

  if (!admin) {
    return (
      <Routes>
        <Route
          path="login"
          element={
            <OwnerLogin
              onSignedIn={(data) => {
                setOwnerToken(data.token)
                setAdmin(data.admin)
                navigate("/owner", { replace: true })
              }}
            />
          }
        />
        <Route path="forgot" element={<OwnerForgot />} />
        <Route path="set-password" element={<OwnerSetPassword />} />
        <Route path="*" element={<Navigate to="/owner/login" replace />} />
      </Routes>
    )
  }

  const signOut = async () => {
    await ownerApi("/logout", { method: "POST" })
    setOwnerToken("")
    setAdmin(null)
    navigate("/owner/login", { replace: true })
  }

  return (
    <OwnerShell admin={admin} onSignOut={signOut}>
      <Routes>
        <Route index element={<OwnerOverview />} />
        <Route path="workspaces" element={<OwnerWorkspaces />} />
        <Route path="workspaces/:slug" element={<OwnerWorkspace />} />
        <Route path="plans" element={<OwnerPlans />} />
        <Route path="activity" element={<OwnerActivity />} />
        <Route path="*" element={<Navigate to="/owner" replace />} />
      </Routes>
    </OwnerShell>
  )
}
