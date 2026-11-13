import { useEffect, useState } from "react"
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { cn } from "cn"
import {
  IconActivity,
  IconGift,
  IconBuildingSkyscraper,
  IconId,
  IconLayoutDashboard,
  IconLogout,
  IconMapPin,
  IconMenu2,
  IconPlugConnected,
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
import { ModeToggle } from "@/components/ThemeTogge"
import { PageTransition } from "@/lib/motion"
import { getOwnerToken, ownerApi, setOwnerToken } from "@/lib/owner"
import KycCheck from "../Kyc/KycCheck"
import OwnerPartnerPerks from "./OwnerPartnerPerks"
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
import OwnerIntegrations from "./OwnerIntegrations"
import { OwnerNotificationBell, useOwnerNotifications } from "./OwnerNotifications"

// The owner menu in the sidebar. A plain entry is [label, path, icon]; a group is a small heading with its pages.
const NAV = [
  ["Overview", "/owner/overview", IconLayoutDashboard],
  ["Workspaces", "/owner/workspaces", IconBuildingSkyscraper],
  ["Plans", "/owner/plans", IconTags],
  {
    label: "Activity",
    items: [
      ["Activity log", "/owner/activity", IconActivity],
      ["KYC", "/owner/kyc", IconId],
      ["Registered office", "/owner/registered-office", IconMapPin],
      ["Partner Perks", "/owner/perks", IconGift],
    ],
  },
  // Content (Blogs, Newsletter) is off the menu for now (user, 2026-10-28); its pages stay at /owner/content/…
  {
    label: "Platform",
    items: [
      ["Integrations", "/owner/integrations", IconPlugConnected],
      ["Billing", "/owner/billing", IconReceipt2],
      ["Settings", "/owner/settings", IconSettings],
    ],
  },
]

const NAV_ITEM = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"

// Phones: an Instagram-style tab bar at the bottom (icons only); the rest of the menu opens from "More"
const TAB_BAR = [
  ["Overview", "/owner/overview", IconLayoutDashboard],
  ["Workspaces", "/owner/workspaces", IconBuildingSkyscraper],
  ["Registered office", "/owner/registered-office", IconMapPin],
  ["Billing", "/owner/billing", IconReceipt2],
]
const MORE = [
  ["Plans", "/owner/plans", IconTags],
  ["Activity log", "/owner/activity", IconActivity],
  ["KYC", "/owner/kyc", IconId],
  ["Partner Perks", "/owner/perks", IconGift],
  ["Integrations", "/owner/integrations", IconPlugConnected],
  ["Settings", "/owner/settings", IconSettings],
]
const TAB = "relative flex h-14 flex-1 items-center justify-center transition-colors"

function MobileTabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const moreActive = MORE.some(([, to]) => pathname === to || pathname.startsWith(`${to}/`))
  return (
    <nav
      aria-label="Owner menu"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex max-w-md">
        {TAB_BAR.map(([label, to, Icon]) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className={({ isActive }) => cn(TAB, isActive ? "text-foreground" : "text-muted-foreground")}
          >
            {({ isActive }) => (
              <>
                <Icon className="size-6" stroke={isActive ? 2.4 : 1.6} />
                {isActive && <span className="absolute bottom-2 size-1 rounded-full bg-primary" />}
              </>
            )}
          </NavLink>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="More" className={cn(TAB, "outline-none", moreActive ? "text-foreground" : "text-muted-foreground")}>
            <IconMenu2 className="size-6" stroke={moreActive ? 2.4 : 1.6} />
            {moreActive && <span className="absolute bottom-2 size-1 rounded-full bg-primary" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="mb-2 min-w-52">
            {MORE.map(([label, to, Icon]) => (
              <DropdownMenuItem key={to} onClick={() => navigate(to)} className={cn("py-2.5", pathname.startsWith(to) && "text-primary")}>
                <Icon className="size-4" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}

function SidebarLink({ label, to, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(NAV_ITEM, isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function Logo({ className }) {
  return (
    <NavLink to="/owner/overview" className={cn("flex shrink-0 items-center", className)}>
      <img src={finstapLogo} alt="Finstap" className="h-7 w-auto dark:hidden" />
      <img src={finstapLogoLight} alt="Finstap" className="hidden h-7 w-auto dark:block" />
    </NavLink>
  )
}

/** Tablets and computers: a fixed sidebar on the left with the whole menu, the owner's name and Sign out. */
function OwnerSidebar({ admin, onSignOut, notifications }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background md:flex">
      <div className="flex h-16 items-center justify-between gap-2 pr-3 pl-5">
        <Logo />
        <OwnerNotificationBell state={notifications} align="start" />
      </div>
      <nav aria-label="Owner menu" className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {NAV.map((entry) =>
            Array.isArray(entry) ? (
              <SidebarLink key={entry[1]} label={entry[0]} to={entry[1]} icon={entry[2]} />
            ) : (
              <div key={entry.label} className="mt-4 flex flex-col gap-0.5">
                <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{entry.label}</p>
                {entry.items.map(([label, to, Icon]) => (
                  <SidebarLink key={to} label={label} to={to} icon={Icon} />
                ))}
              </div>
            ),
          )}
        </div>
      </nav>
      <div className="flex flex-col gap-2 border-t p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="truncate text-sm text-muted-foreground" title={admin?.email}>
            {admin?.full_name || admin?.email}
          </span>
          <ModeToggle />
        </div>
        <Button variant="outline" onClick={onSignOut} className="w-full justify-start">
          <IconLogout className="size-4" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}

function OwnerShell({ admin, onSignOut, children }) {
  // One list for both bells (sidebar on computers, header on phones), so it is loaded once
  const notifications = useOwnerNotifications()
  return (
    <div className="min-h-screen bg-muted/30">
      <OwnerSidebar admin={admin} onSignOut={onSignOut} notifications={notifications} />
      {/* Phones: a slim header with the logo; the menu is the tab bar at the bottom */}
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl md:hidden">
        <div className="flex h-14 items-center justify-between gap-4 px-4">
          <Logo />
          <div className="flex shrink-0 items-center gap-2">
            <OwnerNotificationBell state={notifications} />
            <ModeToggle />
            <Button variant="outline" size="lg" onClick={onSignOut} aria-label="Sign out">
              <IconLogout className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <div className="md:pl-60">
        <PageTransition>
          <main className="mx-auto max-w-7xl px-4 pt-5 pb-28 sm:px-6 md:py-8">{children}</main>
        </PageTransition>
      </div>
      <MobileTabBar />
    </div>
  )
}

/**
 * The Finstap owner portal. Signed out: /owner/login, /owner/forgot and /owner/set-password (the
 * emailed link). Signed in: a sidebar menu for the platform, its services, content and billing.
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
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OwnerOverview />} />
        <Route path="workspaces" element={<OwnerWorkspaces />} />
        <Route path="workspaces/:slug" element={<OwnerWorkspace />} />
        <Route path="kyc" element={<OwnerKyc />} />
        <Route
          path="kyc/:slug/:id"
          element={<KycCheck api={ownerApi} getToken={getOwnerToken} backTo="/owner/kyc" canDelete />}
        />
        <Route path="registered-office" element={<OwnerRegisteredOffice />} />
        <Route path="plans" element={<OwnerPlans />} />
        <Route path="activity" element={<OwnerActivity />} />
        <Route path="billing" element={<OwnerBilling />} />
        <Route path="perks" element={<OwnerPartnerPerks />} />
        <Route path="content/blog" element={<OwnerBlog />} />
        <Route path="content/blog/:id" element={<OwnerBlogEditor />} />
        <Route path="content/newsletter" element={<OwnerNewsletter />} />
        <Route path="integrations" element={<OwnerIntegrations />} />
        <Route path="settings" element={<OwnerSettings admin={admin} />} />
        <Route path="*" element={<Navigate to="/owner/overview" replace />} />
      </Routes>
    </OwnerShell>
  )
}
