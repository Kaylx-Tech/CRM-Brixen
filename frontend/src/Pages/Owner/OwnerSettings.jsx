import { useState } from "react"
import { IconLoader2 } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { ownerApi, shortDate } from "@/lib/owner"
import { Button, PageTitle, Panel } from "./ownerUi"

const MIN_PASSWORD = 12

/** The signed-in owner's own account: details and password. */
export default function OwnerSettings({ admin }) {
  const [form, setForm] = useState({ current: "", next: "", repeat: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setError("")
    if (form.next.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (form.next !== form.repeat) return setError("The two new passwords are not the same.")
    setBusy(true)
    const id = toastProcessing("Changing password…")
    const res = await ownerApi("/account/password", {
      method: "POST",
      body: { current_password: form.current, new_password: form.next },
    })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      setForm({ current: "", next: "", repeat: "" })
    } else {
      toastFail(id, res.error)
      setError(res.error)
    }
  }

  return (
    <>
      <PageTitle title="Settings" description="Your owner account." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Account">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{admin?.full_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{admin?.email}</dd>
            </div>
            {admin?.last_login_at && (
              <div>
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd className="font-medium">{shortDate(admin.last_login_at)}</dd>
              </div>
            )}
          </dl>
        </Panel>
        <Panel
          title="Change password"
          description="After the change, other devices are signed out. You will still get an email code when you sign in."
          className="lg:col-span-2"
        >
          <form onSubmit={save} className="max-w-md space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {[
              ["current", "Current password", "current-password"],
              ["next", `New password (at least ${MIN_PASSWORD} characters)`, "new-password"],
              ["repeat", "Repeat new password", "new-password"],
            ].map(([key, label, auto]) => (
              <div key={key}>
                <label htmlFor={`pw-${key}`} className="mb-1.5 block text-sm font-medium">
                  {label}
                </label>
                <Input
                  id={`pw-${key}`}
                  type="password"
                  autoComplete={auto}
                  required
                  value={form[key]}
                  onChange={set(key)}
                  disabled={busy}
                />
              </div>
            ))}
            <Button type="submit" disabled={busy}>
              {busy && <IconLoader2 className="size-4 animate-spin" />}
              Change password
            </Button>
          </form>
        </Panel>
      </div>
    </>
  )
}
