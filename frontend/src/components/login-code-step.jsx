import { useEffect, useRef, useState } from "react"
import { IconAlertCircle, IconArrowLeft, IconMailCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getDeviceId } from "@/lib/device"

/**
 * Second sign-in step: the 6-digit code we emailed. `challenge` comes from /auth/login; a right code
 * returns the same session as a normal login (passed to onSuccess). `headers` are extra request
 * headers (the Finstap workspace). `heading={false}` leaves the title to the page around it.
 */
export function LoginCodeStep({ apiUrl, challenge, emailHint, resendAfter = 60, headers = {}, heading = true, onSuccess, onBack }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(resendAfter)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Countdown until a new code may be sent
  useEffect(() => {
    if (wait <= 0) return undefined
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const post = async (path, body) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      credentials: "include",
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.success !== false, data }
  }

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return
    setBusy(true)
    setError("")
    setInfo("")
    try {
      const { ok, data } = await post("/auth/login/verify", { challenge, code: value, device_id: getDeviceId() })
      if (ok) {
        onSuccess(data)
        return
      }
      setError(data.error || data.message || "That code is not right.")
      setCode("")
      inputRef.current?.focus()
    } catch {
      setError("Failed to connect to server. Please check your connection.")
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (wait > 0 || busy) return
    setBusy(true)
    setError("")
    setInfo("")
    try {
      const { ok, data } = await post("/auth/login/resend", { challenge })
      if (ok) {
        setInfo("A new code is on its way. The old one no longer works.")
        setWait(data.data?.resend_after || 60)
      } else {
        setError(data.error || "Could not send a new code.")
        if (data.details?.resend_after) setWait(data.details.resend_after)
      }
    } catch {
      setError("Failed to connect to server. Please check your connection.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex w-full flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        verify()
      }}
    >
      {heading ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconMailCheck className="size-6" />
          </span>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-balance text-sm text-muted-foreground">
            We sent a 6-digit login code to <span className="font-medium text-foreground">{emailHint}</span>.
            This browser will not ask again for 24 hours.
          </p>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <IconAlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {info ? <p className="m-0 text-center text-sm text-emerald-600">{info}</p> : null}

      <Input
        ref={inputRef}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Login code"
        placeholder="••••••"
        maxLength={6}
        value={code}
        disabled={busy}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 6)
          setCode(digits)
          // A full code signs in straight away (typed or pasted)
          if (digits.length === 6) verify(digits)
        }}
        className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
      />

      <Button type="submit" disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Verify and sign in"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-3.5" />
          Back
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={wait > 0 || busy}
          className="font-medium text-primary disabled:cursor-default disabled:text-muted-foreground"
        >
          {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </button>
      </div>
    </form>
  )
}
