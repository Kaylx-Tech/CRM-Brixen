import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { IconLoader2 } from "@tabler/icons-react"
import { apiRequest } from "@/lib/api"
import { homePath } from "@/lib/permissions"

/**
 * Sign-in handed over from the Brixen website (B2B accounts): the API redirects here with the session token in
 * the URL fragment. It is stored like a normal login, removed from the address bar, and the portal opens.
 */
export default function Sso() {
  const navigate = useNavigate()
  const [error, setError] = useState("")

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token")
    window.history.replaceState(null, "", window.location.pathname)
    if (!token) {
      setError("This sign-in link is not valid. Please sign in again.")
      return
    }
    localStorage.setItem("token", token)
    apiRequest("/auth/me", { silent: true, label: "Sign in" }).then((res) => {
      const user = res.data?.data?.user
      if (!res.ok || !user) {
        localStorage.removeItem("token")
        setError("This sign-in link has expired. Please sign in again.")
        return
      }
      localStorage.setItem("user", JSON.stringify(user))
      navigate(homePath(user), { replace: true })
    })
  }, [navigate])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
      {error ? (
        <>
          <p className="text-destructive">{error}</p>
          <a className="text-primary underline" href="/login">Go to sign in</a>
        </>
      ) : (
        <>
          <IconLoader2 className="size-5 animate-spin" />
          Signing you in…
        </>
      )}
    </div>
  )
}
