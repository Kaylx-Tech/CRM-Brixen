import { useEffect, useState } from "react"
import { NavLink, Navigate, Route, Routes } from "react-router-dom"
import { cn } from "cn"
import {
  IconActivity,
  IconAlertCircle,
  IconBuildingSkyscraper,
  IconLayoutDashboard,
  IconLogout,
  IconTags,
} from "@tabler/icons-react"
import { FinstapAuthLayout, FINSTAP_CTA } from "@/components/finstap-auth-layout"
import { LoginCodeStep } from "@/components/login-code-step"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { getApiBase } from "@/lib/api"
import { getOwnerToken, ownerApi, setOwnerToken } from "@/lib/owner"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapLogoLight from "@/assets/finstap-logo-light.svg"
import OwnerOverview from "./OwnerOverview"
import OwnerWorkspaces from "./OwnerWorkspaces"
import OwnerWorkspace from "./OwnerWorkspace"
import OwnerPlans from "./OwnerPlans"
import OwnerActivity from "./OwnerActivity"

/** Email + password, then the 6-digit code emailed to the owner. */
function OwnerLogin({ onSignedIn }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await ownerApi("/login", { method: "POST", body: { email, password } })
    setBusy(false)
    if (res.ok) setCode(res.data)
    else setError(res.error)
  }

  return (
    <FinstapAuthLayout
      title={code ? "Check your email" : "Finstap owner portal"}
      subtitle={code ? undefined : "For the Finstap team only. Company workspaces sign in at their own address."}
    >
      {code ? (
        <LoginCodeStep
          apiUrl={getApiBase()}
          challenge={code.challenge}
          emailHint={code.email_hint}
          resendAfter={code.resend_after}
          verifyPath="/platform/owner/login/verify"
          resendPath="/platform/owner/login/resend"
          onSuccess={(data) => onSignedIn(data.data)}
          onBack={() => {
            setCode(null)
            setPassword("")
          }}
        />
      ) : (
        <form onSubmit={submit}>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <IconAlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="owner-email">Email</FieldLabel>
              <Input
                id="owner-email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="owner-password">Password</FieldLabel>
              <Input
                id="owner-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Button type="submit" disabled={busy} className={FINSTAP_CTA}>
              {busy ? "Checking..." : "Continue"}
            </Button>
          </FieldGroup>
        </form>
      )}
    </FinstapAuthLayout>
  )
}

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

/** The Finstap owner portal: overview, workspaces and their subscriptions, plans, and activity. */
export default function OwnerPortal() {
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
      <OwnerLogin
        onSignedIn={(data) => {
          setOwnerToken(data.token)
          setAdmin(data.admin)
        }}
      />
    )
  }

  const signOut = async () => {
    await ownerApi("/logout", { method: "POST" })
    setOwnerToken("")
    setAdmin(null)
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
