import { useEffect, useState } from "react"
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom"
import { IconLogout } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/ThemeTogge"
import { PageTransition } from "@/lib/motion"
import { getKycToken, kycApi, setKycToken } from "@/lib/owner"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapLogoLight from "@/assets/finstap-logo-light.svg"
import { OwnerForgot, OwnerLogin, OwnerSetPassword } from "../Owner/OwnerAuth"
import KycDesk from "./KycDesk"
import KycCheck from "./KycCheck"

function KycShell({ onSignOut, children }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 md:h-16">
          <NavLink to="/kyc" className="flex shrink-0 items-center gap-2">
            <img src={finstapLogo} alt="Finstap" className="h-7 w-auto dark:hidden" />
            <img src={finstapLogoLight} alt="Finstap" className="hidden h-7 w-auto dark:block" />
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              KYC
            </span>
          </NavLink>
          <div className="flex shrink-0 items-center gap-2">
            <ModeToggle />
            <Button variant="outline" size="lg" onClick={onSignOut} aria-label="Sign out">
              <IconLogout className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <PageTransition>
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-8">{children}</main>
      </PageTransition>
    </div>
  )
}

/**
 * The KYC team's panel (kyc.finstap.com, or /kyc when subdomains are off). Signed out: /kyc/login,
 * /kyc/forgot and /kyc/set-password (the emailed link). Signed in: every workspace's ID checks.
 */
export default function KycPanel() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(getKycToken()))

  useEffect(() => {
    document.title = "KYC panel · Finstap"
    let alive = true
    if (getKycToken()) {
      kycApi("/me").then((res) => {
        if (!alive) return
        if (res.ok) setUser(res.data.admin)
        setChecking(false)
      })
    }
    const signedOut = () => setUser(null)
    window.addEventListener("kyc-signed-out", signedOut)
    return () => {
      alive = false
      window.removeEventListener("kyc-signed-out", signedOut)
    }
  }, [])

  if (checking) return <div className="min-h-screen bg-background" />

  if (!user) {
    return (
      <Routes>
        <Route
          path="login"
          element={
            <OwnerLogin
              panel="kyc"
              onSignedIn={(data) => {
                setKycToken(data.token)
                setUser(data.admin)
                navigate("/kyc", { replace: true })
              }}
            />
          }
        />
        <Route path="forgot" element={<OwnerForgot panel="kyc" />} />
        <Route path="set-password" element={<OwnerSetPassword panel="kyc" />} />
        <Route path="*" element={<Navigate to="/kyc/login" replace />} />
      </Routes>
    )
  }

  const signOut = async () => {
    await kycApi("/logout", { method: "POST" })
    setKycToken("")
    setUser(null)
    navigate("/kyc/login", { replace: true })
  }

  return (
    <KycShell onSignOut={signOut}>
      <Routes>
        <Route index element={<KycDesk />} />
        <Route path="checks/:slug/:id" element={<KycCheck />} />
        <Route path="*" element={<Navigate to="/kyc" replace />} />
      </Routes>
    </KycShell>
  )
}
