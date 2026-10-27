import { useCallback, useEffect, useState } from "react"
import { IconDownload, IconMailForward, IconSend, IconUserMinus, IconUsers } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { ownerApi, shortDate } from "@/lib/owner"
import { Button, Empty, LoadError, PageTitle, Panel, Stat } from "./ownerUi"

const EMPTY = { id: null, subject: "", body: "" }

function downloadCsv(rows) {
  const lines = [["email", "status", "source", "subscribed", "unsubscribed"]].concat(
    rows.map((r) => [r.email, r.status, r.source || "", r.created_at || "", r.unsubscribed_at || ""]),
  )
  const csv = lines.map((l) => l.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = "finstap-newsletter-subscribers.csv"
  a.click()
  URL.revokeObjectURL(url)
}

/** Content > Newsletter: write a newsletter, test it on yourself, send it to every subscriber. */
export default function OwnerNewsletter() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    ownerApi("/content/newsletter").then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // While a newsletter is going out, check its counts every few seconds
  useEffect(() => {
    if (!data?.issues?.some((i) => i.status === "Sending")) return undefined
    const t = setTimeout(load, 3000)
    return () => clearTimeout(t)
  }, [data, load])

  const run = async (path, body, working) => {
    setBusy(true)
    const id = toastProcessing(working)
    const res = await ownerApi(path, { method: "POST", body })
    setBusy(false)
    if (res.ok) toastDone(id, res.message)
    else toastFail(id, res.error)
    return res
  }

  const saveDraft = async () => {
    const res = await run(
      draft.id ? `/content/newsletter/issues/${draft.id}` : "/content/newsletter/issues",
      { subject: draft.subject, body: draft.body },
      "Saving draft…",
    )
    if (res.ok) {
      setDraft({ id: res.data.id, subject: res.data.subject, body: res.data.body })
      load()
    }
    return res.ok
  }

  const sendAll = async () => {
    if (!window.confirm(`Send "${draft.subject}" to ${data.subscribed} subscriber(s)? This cannot be undone.`)) return
    if (!(await saveDraft())) return
    const res = await run(`/content/newsletter/issues/${draft.id}/send`, null, "Starting to send…")
    if (res.ok) {
      setDraft(EMPTY)
      load()
    }
  }

  if (error) return <LoadError error={error} />
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <>
      <PageTitle
        title="Newsletter"
        description="People subscribe on finstap.com. Every email has an unsubscribe link and goes from Finstap's no-reply address."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Subscribed" value={data.subscribed} icon={IconUsers} tone="text-emerald-600" />
        <Stat label="Unsubscribed" value={data.unsubscribed} icon={IconUserMinus} tone="text-muted-foreground" />
        <Stat label="Newsletters sent" value={data.issues.filter((i) => i.status !== "Draft").length} icon={IconMailForward} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel title={draft.id ? "Edit newsletter" : "New newsletter"} className="lg:col-span-3">
          <div className="space-y-3">
            <Input placeholder="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            <Textarea
              rows={12}
              placeholder={"Hello,\n\n## What's new\n\n- First point\n- Second point"}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Empty line = new paragraph · "## " = heading · "- " = bullet point</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={saveDraft}>
                Save draft
              </Button>
              <Button
                variant="outline"
                disabled={busy || !draft.subject || !draft.body}
                onClick={async () => (await saveDraft()) && run(`/content/newsletter/issues/${draft.id}/test`, null, "Sending test…")}
              >
                Send test to me
              </Button>
              <Button disabled={busy || !draft.subject || !draft.body || !data.subscribed} onClick={sendAll}>
                <IconSend className="size-4" /> Send to {data.subscribed} subscriber(s)
              </Button>
              {draft.id && (
                <Button variant="ghost" onClick={() => setDraft(EMPTY)}>
                  New
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Newsletters" className="lg:col-span-2">
          {data.issues.length ? (
            <ul className="divide-y text-sm">
              {data.issues.map((i) => (
                <li key={i.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className={cn("min-w-0 text-left font-medium", i.status === "Draft" && "hover:text-primary")}
                      disabled={i.status !== "Draft"}
                      onClick={() => setDraft({ id: i.id, subject: i.subject, body: i.body })}
                    >
                      {i.subject}
                    </button>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                        i.status === "Sent" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {i.status === "Draft"
                      ? `Draft · ${shortDate(i.created_at)}`
                      : `${i.sent_count}/${i.recipients} sent${i.failed_count ? ` · ${i.failed_count} failed` : ""} · ${shortDate(i.sent_at)}`}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No newsletters yet.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Subscribers"
        className="mt-4"
        action={
          <Button variant="outline" disabled={!data.subscribers.length} onClick={() => downloadCsv(data.subscribers)}>
            <IconDownload className="size-4" /> CSV
          </Button>
        }
      >
        {data.subscribers.length ? (
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="sticky top-0 border-b bg-card text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2.5 pr-4 font-semibold">Email</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 pl-3 font-semibold">Since</th>
                </tr>
              </thead>
              <tbody>
                {data.subscribers.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{s.email}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.status}</td>
                    <td className="py-2 pl-3 text-muted-foreground">{shortDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={IconUsers} title="No subscribers yet">
            The sign-up box is in the finstap.com footer and on the blog.
          </Empty>
        )}
      </Panel>
    </>
  )
}
