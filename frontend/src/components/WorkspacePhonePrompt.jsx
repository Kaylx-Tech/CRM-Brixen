import { useEffect, useState } from "react"
import { IconDeviceMobile } from "@tabler/icons-react"
import { apiRequest } from "@/lib/api"
import { getRole } from "@/lib/permissions"
import { useFormErrors } from "@/lib/validation"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { PhoneInput } from "@/components/ui/phone-input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { FieldMessage, invalidProps } from "@/components/FormField"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const SCHEMA = { phone: { label: "Mobile number", required: true, type: "phone", maxLength: 30 } }
// "Later" hides it until the browser is opened again (then it asks once more)
const LATER_KEY = "workspace-phone-later"

function askedLater() {
  try {
    return sessionStorage.getItem(LATER_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Finstap: workspaces made before signup asked for a number have no owner number. Their admins get this popup
 * ("Please add your active number") until one is saved (backend/routes/plan_routes.py, /admin/workspace-phone).
 */
export default function WorkspacePhonePrompt() {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const { errors, check, recheck, fromResponse } = useFormErrors(SCHEMA)

  useEffect(() => {
    if (!["SUPER_ADMIN", "ADMIN"].includes(String(getRole() || "").toUpperCase()) || askedLater()) return undefined
    let alive = true
    apiRequest("/admin/workspace-phone", { silent: true }).then((res) => {
      if (alive && res.ok && res.data?.data?.needed) setOpen(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const later = () => {
    try {
      sessionStorage.setItem(LATER_KEY, "1")
    } catch {
      // Private mode: it simply asks again next time
    }
    setOpen(false)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!check({ phone })) return
    setSaving(true)
    const res = await apiRequest("/admin/workspace-phone", {
      method: "POST",
      body: { phone },
      label: "Mobile number",
      silent: true,
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Number saved. Thank you!")
      setOpen(false)
      return
    }
    if (!fromResponse(res)) toast.error(res.reason || "Could not save the number. Please try again.")
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : later())}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <form onSubmit={save} noValidate className="grid gap-6">
          <DialogHeader>
            <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <IconDeviceMobile className="size-5" />
            </span>
            <DialogTitle className="text-base font-semibold">Please add your active number</DialogTitle>
            <DialogDescription>
              Add a mobile number we can reach you on, so the Finstap team can contact you about your workspace.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="workspace-phone">Mobile number</FieldLabel>
              <PhoneInput
                id="workspace-phone"
                {...invalidProps(errors, "phone", "workspace-")}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  recheck("phone", e.target.value)
                }}
                placeholder="7700 900123"
                disabled={saving}
                autoFocus
              />
              <FieldMessage id="workspace-phone-error" message={errors.phone} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={later} disabled={saving}>
              Later
            </Button>
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? "Saving…" : "Save number"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
