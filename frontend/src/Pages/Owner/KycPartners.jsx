import { useCallback, useEffect, useState } from "react"
import { IconCopy, IconKey } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { ownerApi } from "@/lib/owner"
import { Button, Panel, SELECT } from "./ownerUi"
import { GREEN, GREY, PILL, RED } from "../Kyc/kycStatus"

/**
 * KYC for another website (first: Brixen's portal). One Finstap workspace holds that site's checks: its KYC
 * links point to the site, the KYC desk works on them as usual, and the site's server reads them with an
 * API key (shown once). Free = no charge and no credit limit.
 */
export default function KycPartners() {
  const [partners, setPartners] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [form, setForm] = useState({ slug: "", base_url: "", free: true })
  const [key, setKey] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    ownerApi("/kyc/partners").then((res) => res.ok && setPartners(res.data.partners || []))
  }, [])

  useEffect(() => {
    load()
    ownerApi("/workspaces").then((res) => res.ok && setWorkspaces(res.data.workspaces || []))
  }, [load])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const id = toastProcessing("Saving…")
    const res = await ownerApi("/kyc/partners", { method: "POST", body: form })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      setPartners(res.data.partners || [])
    } else {
      toastFail(id, res.error)
    }
  }

  const reactivate = async (slug) => {
    const id = toastProcessing("Turning on…")
    const res = await ownerApi("/kyc/partners/reactivate", { method: "POST", body: { slug } })
    if (res.ok) {
      toastDone(id, res.message)
      setPartners(res.data.partners || [])
    } else {
      toastFail(id, res.error)
    }
  }

  const makeKey = async (slug) => {
    if (!window.confirm("Make a new API key? The site's old key stops working.")) return
    const res = await ownerApi("/kyc/partners/key", { method: "POST", body: { slug } })
    if (res.ok) {
      setKey({ slug, value: res.data.key })
      toastDone(undefined, res.message)
      load()
    } else {
      toastFail(undefined, res.error)
    }
  }

  return (
    <Panel
      className="mb-4"
      title="KYC for another website"
      description="A workspace that holds another site's KYC checks (for example Brixen's portal). Its KYC links open on that site, the KYC team checks them here, and the site's server reads them with the API key."
    >
      <form onSubmit={save} className="grid gap-2 md:grid-cols-[1fr_1.4fr_auto_auto] md:items-center">
        <select
          className={cn(SELECT)}
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          aria-label="Workspace"
          required
        >
          <option value="">Choose a workspace…</option>
          {workspaces.map((w) => (
            <option key={w.slug} value={w.slug}>
              {w.name} ({w.slug})
            </option>
          ))}
        </select>
        <Input
          placeholder="https://portal.brixenconsultants.com"
          value={form.base_url}
          onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
          aria-label="The site's address"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.free}
            onChange={(e) => setForm((f) => ({ ...f, free: e.target.checked }))}
          />
          Free checks
        </label>
        <Button type="submit" disabled={busy || !form.slug}>
          Save
        </Button>
      </form>

      {key && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium">API key for {key.slug}: copy it now, it is not shown again.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-xs">{key.value}</code>
            <Button
              variant="outline"
              onClick={() =>
                navigator.clipboard.writeText(key.value).then(
                  () => toastDone(undefined, "Key copied"),
                  () => toastFail(undefined, "Could not copy"),
                )
              }
            >
              <IconCopy className="size-4" /> Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Put it on the site's server as FINSTAP_KYC_KEY, with FINSTAP_KYC_WORKSPACE={key.slug}.
          </p>
        </div>
      )}

      {partners.length > 0 && (
        <ul className="mt-4 divide-y text-sm">
          {partners.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {p.name} <span className="text-muted-foreground">({p.slug})</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{p.kyc_form_base_url}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p.status !== "Active" || p.deleted_at ? (
                  <>
                    <span className={cn(PILL, RED)} title={p.suspended_reason || ""}>
                      {p.deleted_at ? "Deleted · KYC stopped" : "Suspended · KYC stopped"}
                    </span>
                    <Button onClick={() => reactivate(p.slug)}>Turn back on</Button>
                  </>
                ) : (
                  <span className={cn(PILL, GREEN)}>Active</span>
                )}
                <span className={cn(PILL, p.kyc_free ? GREEN : GREY)}>{p.kyc_free ? "Free" : "Charged"}</span>
                <span className={cn(PILL, p.has_key ? GREEN : GREY)}>{p.has_key ? "Key made" : "No key yet"}</span>
                <Button
                  variant="outline"
                  onClick={() => setForm({ slug: p.slug, base_url: p.kyc_form_base_url, free: !!p.kyc_free })}
                >
                  Edit
                </Button>
                <Button variant="outline" onClick={() => makeKey(p.slug)}>
                  <IconKey className="size-4" /> New API key
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
