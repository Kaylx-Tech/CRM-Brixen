import { useEffect, useState } from "react"
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import {
  IconActivity,
  IconArticle,
  IconBuildingSkyscraper,
  IconId,
  IconLayoutDashboard,
  IconLogout,
  IconMail,
  IconMapPin,
  IconReceipt2,
  IconSettings,
  IconTags,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { ModeToggle } from "@/components/ThemeTogge"
import { NavMain } from "@/Layout/nav-main"
import { PageTransition } from "@/lib/motion"
import { getOwnerToken, ownerApi, setOwnerToken } from "@/lib/owner"
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

// The owner menu, in groups like the CRM's own sidebar. Activity holds the services Finstap sells.
const NAV_GROUPS = [
  {
    label: "Platform",
    items: [
      { title: "Overview", url: "/owner/overview", icon: IconLayoutDashboard },
      { title: "Workspaces", url: "/owner/workspaces", icon: IconBuildingSkyscraper },
      { title: "Plans", url: "/owner/plans", icon: IconTags },
    ],
  },
  {
    label: "Activity",
    items: [
      { title: "Activity log", url: "/owner/activity", icon: IconActivity },
      { title: "KYC", url: "/owner/kyc", icon: IconId },
      { title: "Registered office", url: "/owner/registered-office", icon: IconMapPin },
    ],
  },
  {
    label: "Content",
    items: [
      { title: "Blogs", url: "/owner/content/blog", icon: IconArticle },
      { title: "Newsletter", url: "/owner/content/newsletter", icon: IconMail },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Billing", url: "/owner/billing", icon: IconReceipt2 },
      { title: "Settings", url: "/owner/settings", icon: IconSettings },
    ],
  },
]

function initials(admin) {
  const name = String(admin?.full_name || admin?.email || "F").trim()
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
}

/** The page's name for the top bar, from the menu (or the deeper pages under it). */
function usePageTitle() {
  const { pathname } = useLocation()
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.url || pathname.startsWith(`${item.url}/`)) return [group.label, item.title]
    }
  }
  return ["Platform", "Overview"]
}

function OwnerSidebar({ admin, onSignOut }) {
  const groups = NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map(({ icon: Icon, ...item }) => ({ ...item, icon: <Icon /> })),
  }))
  return (
    <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <div className="flex flex-col items-center gap-2 px-2 pt-5 pb-3">
          <img src={finstapLogoLight} alt="Finstap" className="h-10 w-auto drop-shadow-[0_3px_10px_rgba(0,0,0,0.35)]" />
          <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/80">
            Owner portal
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} variant="finstap" />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-[#297bff] to-[#834aff] text-sm font-semibold text-white">
            {initials(admin)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-sidebar-foreground">{admin?.full_name || "Owner"}</div>
            <div className="truncate text-xs text-sidebar-foreground/55">{admin?.email}</div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground"
          >
            <IconLogout className="size-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function OwnerTopBar({ admin, onSignOut }) {
  const [section, page] = usePageTitle()
  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b bg-background/80 py-3.5 backdrop-blur-xl">
      <div className="flex w-full items-center justify-between gap-2 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4 data-vertical:self-auto" />
          <div className="min-w-0 text-sm">
            <span className="text-muted-foreground">{section}</span>
            <span className="mx-1.5 text-muted-foreground/50">/</span>
            <span className="font-medium text-foreground">{page}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Separator orientation="vertical" className="mx-1 h-6 data-vertical:self-auto" />
          <span className="hidden text-sm text-muted-foreground md:inline">{admin?.full_name || admin?.email}</span>
          <Button variant="outline" size="lg" onClick={onSignOut}>
            <IconLogout className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

/** On a phone the menu slides over the page: close it once a page is chosen. */
function CloseMenuOnNavigate() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])
  return null
}

function OwnerShell({ admin, onSignOut, children }) {
  return (
    <SidebarProvider>
      <CloseMenuOnNavigate />
      <OwnerSidebar admin={admin} onSignOut={onSignOut} />
      <SidebarInset className="relative h-svh overflow-hidden bg-sidebar p-2">
        <ScrollArea className="h-full w-full rounded-xl border bg-background shadow-sm">
          <OwnerTopBar admin={admin} onSignOut={onSignOut} />
          <PageTransition>
            <main className="mx-auto w-full max-w-7xl p-4 pb-16 lg:p-8">{children}</main>
          </PageTransition>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * The Finstap owner portal. Signed out: /owner/login, /owner/forgot and /owner/set-password (the
 * emailed link). Signed in: the sidebar with the platform, its services, content and billing.
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
        <Route path="registered-office" element={<OwnerRegisteredOffice />} />
        <Route path="plans" element={<OwnerPlans />} />
        <Route path="activity" element={<OwnerActivity />} />
        <Route path="billing" element={<OwnerBilling />} />
        <Route path="content/blog" element={<OwnerBlog />} />
        <Route path="content/blog/:id" element={<OwnerBlogEditor />} />
        <Route path="content/newsletter" element={<OwnerNewsletter />} />
        <Route path="settings" element={<OwnerSettings admin={admin} />} />
        <Route path="*" element={<Navigate to="/owner/overview" replace />} />
      </Routes>
    </OwnerShell>
  )
}
