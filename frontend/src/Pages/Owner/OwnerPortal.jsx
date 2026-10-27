import { useEffect, useState } from "react"
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { cn } from "cn"
import {
  IconActivity,
  IconArticle,
  IconBuildingSkyscraper,
  IconChevronDown,
  IconId,
  IconLayoutDashboard,
  IconMail,
  IconMapPin,
  IconLogout,
  IconNews,
  IconReceipt2,
  IconSettings,
  IconTags,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getOwnerToken, ownerApi, setOwnerToken } from "@/lib/owner"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapLogoLight from "@/assets/finstap-logo-light.svg"
import { OwnerForgot, OwnerLogin, OwnerSetPassword } from "./OwnerAuth"
import OwnerOverview from "./OwnerOverview"
import OwnerWorkspaces from "./OwnerWorkspaces"
import OwnerWorkspace from "./OwnerWorkspace"
import OwnerPlans from "./OwnerPlans"
import OwnerActivity from "./OwnerActivity"
import OwnerSettings from "./OwnerSettings"
import OwnerKyc from "./OwnerKyc"
import OwnerRegisteredOffice from "./OwnerRegisteredOffice"
import OwnerBilling from "./OwnerBilling"
import OwnerBlog, { OwnerBlogEditor } from "./OwnerBlog"
import OwnerNewsletter from "./OwnerNewsletter"

// A plain entry is [label, path, icon, exact]; a group has items and opens a small menu
const NAV = [
  ["Overview", "/owner", IconLayoutDashboard, true],
  ["Workspaces", "/owner/workspaces", IconBuildingSkyscraper, false],
  ["Plans", "/owner/plans", IconTags, false],
  {
    label: "Activity",
    icon: IconActivity,
    items: [
      ["Activity log", "/owner/activity", IconActivity],
      ["KYC", "/owner/kyc", IconId],
      ["Registered office", "/owner/registered-office", IconMapPin],
    ],
  },
  {
    label: "Content",
    icon: IconNews,
    items: [
      ["Blogs", "/owner/content/blog", IconArticle],
      ["Newsletter", "/owner/content/newsletter", IconMail],
    ],
  },
  ["Billing", "/owner/billing", IconReceipt2, false],
  ["Settings", "/owner/settings", IconSettings, false],
]

const NAV_ITEM = "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition"

function NavGroup({ group }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = group.items.some(([, to]) => pathname === to || pathname.startsWith(`${to}/`))
  const Icon = group.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(NAV_ITEM, "outline-none", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
      >
        <Icon className="size-4" />
        <span className="hidden sm:inline">{group.label}</span>
        <IconChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {group.items.map(([label, to, ItemIcon]) => (
          <DropdownMenuItem key={to} onClick={() => navigate(to)} className={cn(pathname.startsWith(to) && "text-primary")}>
            <ItemIcon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
            {NAV.map((entry) => {
              if (!Array.isArray(entry)) return <NavGroup key={entry.label} group={entry} />
              const [label, to, Icon, end] = entry
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(NAV_ITEM, isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{label}</span>
                </NavLink>
              )
            })}
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
        <Route path="kyc" element={<OwnerKyc />} />
        <Route path="registered-office" element={<OwnerRegisteredOffice />} />
        <Route path="plans" element={<OwnerPlans />} />
        <Route path="activity" element={<OwnerActivity />} />
        <Route path="billing" element={<OwnerBilling />} />
        <Route path="content/blog" element={<OwnerBlog />} />
        <Route path="content/blog/:id" element={<OwnerBlogEditor />} />
        <Route path="content/newsletter" element={<OwnerNewsletter />} />
        <Route path="settings" element={<OwnerSettings admin={admin} />} />
        <Route path="*" element={<Navigate to="/owner" replace />} />
      </Routes>
    </OwnerShell>
  )
}
