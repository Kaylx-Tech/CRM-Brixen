import { useEffect, useState } from "react"
import { IconCircleCheck, IconCopy, IconLoader2, IconPlugConnected } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { ownerApi } from "@/lib/owner"
import { Button, LoadError, PageTitle, Panel } from "./ownerUi"

const PILL = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"

// Where a field's value comes from today
function SourceTag({ field }) {
  if (field.source === "portal") return <span className="text-xs text-emerald-700 dark:text-emerald-300">Saved here</span>
  if (field.source === "server") return <span className="text-xs text-muted-foreground">From the server (Coolify)</span>
  return <span className="text-xs text-amber-700 dark:text-amber-300">Not set</span>
}

/** One integration: its fields and a Save button (secrets are typed fresh, never shown). */
function IntegrationCard({ group, extra, onSaved }) {
  const initial = () => Object.fromEntries(group.fields.map((f) => [f.name, f.secret ? "" : f.value]))
  const [values, setValues] = useState(initial)
  const [busy, setBusy] = useState(false)

  const save = async (body) => {
    setBusy(true)
    const id = toastProcessing("Saving…")
    const res = await ownerApi("/integrations", { method: "POST", body })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      onSaved(res.data.groups)
    } else {
      toastFail(id, res.error)
    }
  }

  const dirty = group.fields.some((f) => (f.secret ? values[f.name] : values[f.name] !== f.value))

  return (
    <Panel
      title={group.title}
      description={group.description}
      action={
        <span
          className={cn(
            PILL,
            group.connected
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
          )}
        >
          {group.connected && <IconCircleCheck className="size-3.5" />}
          {group.connected ? "Connected" : "Not set up"}
        </span>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save({ values })
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {group.fields.map((f) => (
            <div key={f.name}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label htmlFor={`int-${f.name}`} className="text-sm font-medium">
                  {f.label}
                </label>
                <SourceTag field={f} />
              </div>
              <Input
                id={`int-${f.name}`}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={
                  f.secret
                    ? f.source
                      ? "•••••••• (type to replace)"
                      : "Paste the key"
                    : f.server_value
                      ? `Server: ${f.server_value}`
                      : ""
                }
                disabled={busy}
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{f.help}</p>
                {f.source === "portal" && (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Remove the ${f.label.toLowerCase()} saved here? The server's value (if any) is used again.`))
                        save({ clear: [f.name] })
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {extra}
        <Button type="submit" disabled={busy || !dirty}>
          {busy && <IconLoader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </form>
    </Panel>
  )
}

function WebhookUrl({ url, title, hint }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs">{url}</code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(url).then(
              () => toastDone(undefined, "Copied"),
              () => toastFail(undefined, "Could not copy"),
            )
          }
        >
          <IconCopy className="size-4" /> Copy
        </Button>
      </div>
    </div>
  )
}

/** Integrations: the API keys Finstap runs for every workspace. Workspaces cannot see or change them. */
export default function OwnerIntegrations() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [version, setVersion] = useState(0)

  useEffect(() => {
    ownerApi("/integrations").then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [])

  const onSaved = (groups) => {
    setData((d) => ({ ...d, groups }))
    setVersion((v) => v + 1)
  }

  return (
    <>
      <PageTitle
        title="Integrations"
        description="API keys Finstap uses for every workspace. A key saved here comes first; an empty field uses the server's (Coolify) value. Keys are never shown again after saving."
      />
      <LoadError error={error} />
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.groups.map((g) => (
            <IntegrationCard
              key={`${g.id}-${version}`}
              group={g}
              onSaved={onSaved}
              extra={
                g.id === "didit" ? (
                  <WebhookUrl
                    url={data.didit_webhook_url}
                    title="Webhook URL for Didit"
                    hint="Paste this in the Didit console › Webhooks, so results come back by themselves."
                  />
                ) : g.id === "stripe" ? (
                  <WebhookUrl
                    url={data.stripe_webhook_url}
                    title="Webhook URL for Stripe"
                    hint="Stripe › Developers › Webhooks › Add endpoint. Events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed."
                  />
                ) : null
              }
            />
          ))}
          <Panel title="Coming later" className="xl:col-span-2">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <IconPlugConnected className="mt-0.5 size-5 shrink-0" />
              <p>WordPress: orders from a company's website will come through a Finstap WordPress plugin.</p>
            </div>
          </Panel>
        </div>
      )}
    </>
  )
}
