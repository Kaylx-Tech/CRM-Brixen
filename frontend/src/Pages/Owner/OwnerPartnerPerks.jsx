import { useEffect, useState } from "react"
import { IconExternalLink, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { ownerApi } from "@/lib/owner"
import { Button, LoadError, PageTitle, Panel } from "./ownerUi"

const EMPTY = { category: "", title: "", url: "", note: "" }

/** Partner Perks: partner links every workspace sees in Smart Operations › Partner Perks (they cannot change them). */
export default function OwnerPartnerPerks() {
  const [perks, setPerks] = useState(null)
  const [error, setError] = useState("")
  const [form, setForm] = useState(null) // {id?, category, title, url, note}
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ownerApi("/perks").then((res) => (res.ok ? setPerks(res.data.perks) : setError(res.error)))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const id = toastProcessing("Saving…")
    const res = await ownerApi(form.id ? `/perks/${form.id}` : "/perks", { method: form.id ? "PUT" : "POST", body: form })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      setPerks(res.data.perks)
      setForm(null)
    } else {
      toastFail(id, res.error)
    }
  }

  const remove = async (perk) => {
    if (!window.confirm(`Remove "${perk.title}" from every workspace?`)) return
    const id = toastProcessing("Removing…")
    const res = await ownerApi(`/perks/${perk.id}`, { method: "DELETE" })
    if (res.ok) {
      toastDone(id, res.message)
      setPerks(res.data.perks)
    } else {
      toastFail(id, res.error)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const categories = [...new Set((perks || []).map((p) => p.category))]

  return (
    <>
      <PageTitle
        title="Partner Perks"
        description="Partner links (Tide, Wise, TapTap …) every workspace sees in Smart Operations › Partner Perks. A change here shows in all workspaces at once; workspaces cannot edit or remove them."
      >
        <Button onClick={() => setForm({ ...EMPTY })}>
          <IconPlus className="size-4" /> Add perk
        </Button>
      </PageTitle>
      <LoadError error={error} />

      {form && (
        <Panel title={form.id ? "Edit perk" : "New perk"} className="mb-4">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="perk-category">Company</label>
              <Input id="perk-category" list="perk-categories" placeholder="e.g. Tide" value={form.category} onChange={set("category")} required />
              <datalist id="perk-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="perk-title">Title</label>
              <Input id="perk-title" placeholder="e.g. Open a Tide business account" value={form.title} onChange={set("title")} required />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium" htmlFor="perk-url">Link</label>
              <Input id="perk-url" placeholder="https://…" value={form.url} onChange={set("url")} required />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium" htmlFor="perk-note">Offer (optional)</label>
              <Textarea id="perk-note" rows={2} placeholder="e.g. £75 cashback when the account is opened" value={form.note || ""} onChange={set("note")} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>{form.id ? "Save" : "Add to every workspace"}</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            </div>
          </form>
        </Panel>
      )}

      {!perks && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {perks && (
        <Panel>
          {perks.length ? (
            <ul className="divide-y text-sm">
              {perks.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      <span className="text-muted-foreground">{p.category} · </span>
                      {p.title}
                    </div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">
                      {p.url}
                    </a>
                    {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" render={<a href={p.url} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                      <IconExternalLink className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setForm({ ...p })} aria-label="Edit">
                      <IconPencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(p)} aria-label="Remove">
                      <IconTrash className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No perks yet. Add one and every workspace sees it.</p>
          )}
        </Panel>
      )}
    </>
  )
}
