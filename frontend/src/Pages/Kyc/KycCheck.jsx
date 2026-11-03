import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconClockHour4,
  IconCopy,
  IconExternalLink,
  IconFileText,
  IconPhotoOff,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"
import { cn } from "cn"
import { Textarea } from "@/components/ui/textarea"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { getApiBase } from "@/lib/api"
import { getKycToken, kycApi, shortDate } from "@/lib/owner"
import { Button, Empty, LoadError, Panel } from "../Owner/ownerUi"
import { GREEN, GREY, PILL, RED, REJECTED, kycLabel } from "./kycStatus"

// The decisions the desk can make (the backend accepts exactly these)
const DECISIONS = [
  ["Approved", "Approve", IconCheck],
  ["In Review", "Under review", IconClockHour4],
  ["Declined", "Reject", IconX],
]

function stepTone(status) {
  if (status === "Approved") return GREEN
  if (status === "Declined") return RED
  return GREY
}

/** Label and value rows; empty values are left out. */
function Facts({ rows }) {
  const shown = rows.filter(([, value]) => value !== undefined && value !== null && value !== "")
  if (!shown.length) return <p className="text-sm text-muted-foreground">Nothing yet.</p>
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 break-words font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One file the person sent, loaded with the panel's sign-in (the files are private). */
function FormFile({ file, check, getToken }) {
  const [url, setUrl] = useState("")
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl = ""
    let live = true
    fetch(`${getApiBase()}/platform/owner/desk/checks/${check.workspace}/${check.id}/files/${file.id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (live) setUrl(objectUrl)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.id, check.workspace, check.id, getToken])

  return (
    <figure className="overflow-hidden rounded-xl border bg-muted/30">
      {!url ? (
        <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted-foreground">
          {failed ? "Could not load this file" : "Loading…"}
        </div>
      ) : file.kind === "pdf" ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-sm font-medium text-primary"
        >
          <IconFileText className="size-10" /> Open the PDF
        </a>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
          <img src={url} alt={`${file.section}: ${file.label}`} className="aspect-[4/3] w-full bg-white object-contain" />
        </a>
      )}
      <figcaption className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs">
        <span>
          <span className="font-semibold">{file.section}</span> · {file.label}
        </span>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" aria-label="Open">
            <IconExternalLink className="size-4" />
          </a>
        )}
      </figcaption>
    </figure>
  )
}

/** What the person uploaded on the form: the latest time first, earlier tries folded away. */
function FormFiles({ check, getToken }) {
  const [latest, ...earlier] = check.submissions
  const grid = (files) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {files.map((f) => (
        <FormFile key={f.id} file={f} check={check} getToken={getToken} />
      ))}
    </div>
  )
  return (
    <>
      {grid(latest.files)}
      {earlier.map((s) => (
        <details key={s.round} className="mt-4 rounded-xl border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Earlier try ({s.files.length} file{s.files.length === 1 ? "" : "s"}, {shortDate(s.files[0]?.created_at)})
          </summary>
          <div className="mt-3">{grid(s.files)}</div>
        </details>
      ))}
    </>
  )
}

/** Didit's photos and files on older checks: ID front/back, selfie, proof of address … */
function Media({ check }) {
  const media = check.media || []
  if (!media.length) {
    return (
      <Empty icon={IconPhotoOff} title="No documents to show">
        {check.media_error || "The client has not sent their documents yet."}
      </Empty>
    )
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {media.map((m) => (
          <figure key={m.url} className="overflow-hidden rounded-xl border bg-muted/30">
            {m.kind === "video" ? (
              <video src={m.url} controls className="aspect-[4/3] w-full bg-black object-contain" />
            ) : m.kind === "pdf" ? (
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-sm font-medium text-primary"
              >
                <IconFileText className="size-10" /> Open the PDF
              </a>
            ) : (
              <a href={m.url} target="_blank" rel="noreferrer" title="Open full size">
                <img src={m.url} alt={`${m.section}: ${m.label}`} className="aspect-[4/3] w-full bg-white object-contain" />
              </a>
            )}
            <figcaption className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs">
              <span>
                <span className="font-semibold">{m.section}</span> · {m.label}
              </span>
              <a href={m.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" aria-label="Open">
                <IconExternalLink className="size-4" />
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Didit's links work for a short time. If a photo stops loading, reload this page.
      </p>
    </>
  )
}

/** Approve, mark under review, or reject with the reason. */
function Decision({ check, onSaved, api }) {
  const [status, setStatus] = useState(["Approved", "In Review", "Declined"].includes(check.status) ? check.status : "")
  const [note, setNote] = useState(check.review_note || "")
  const [busy, setBusy] = useState(false)
  const needsNote = status === "Declined" && !note.trim()

  const save = async () => {
    setBusy(true)
    const id = toastProcessing("Saving…")
    const res = await api(`/desk/checks/${check.workspace}/${check.id}/status`, {
      method: "POST",
      body: { status, note },
    })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      onSaved()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <Panel
      title="Your decision"
      description="Saved straight into the workspace. The client is emailed when you approve or reject; a rejected client gets a new link."
    >
      <div className="grid grid-cols-3 gap-2">
        {DECISIONS.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold transition",
              status === value
                ? value === "Declined"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : value === "Approved"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </div>
      <label htmlFor="kyc-note" className="mt-4 block text-sm font-medium">
        {status === "Declined" ? "Reason (required)" : "Note (optional)"}
      </label>
      <Textarea
        id="kyc-note"
        rows={3}
        className="mt-1.5"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="For example: the name on the bank statement is different from the passport"
      />
      <Button className="mt-4 w-full" onClick={save} disabled={busy || !status || needsNote}>
        Save decision
      </Button>
      {check.reviewed_by && (
        <p className="mt-3 text-xs text-muted-foreground">
          Last set by {check.reviewed_by} on {shortDate(check.reviewed_at)}.
        </p>
      )}
    </Panel>
  )
}

/** A new form link for the client, with what to fix. */
function Resubmit({ check, onSaved, api }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    const id = toastProcessing("Making a new link…")
    const res = await api(`/desk/checks/${check.workspace}/${check.id}/resubmit`, {
      method: "POST",
      body: { reason },
    })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      setReason("")
      onSaved()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <Panel
      title="Ask the client again"
      description="Makes a new form link and emails it to the client. The old link stops working; what they sent before stays here."
    >
      <Textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="What the client should fix (goes in the email)"
        aria-label="What the client should fix"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={send} disabled={busy}>
          <IconRefresh className="size-4" /> Send new link
        </Button>
        {check.session_url && (
          <Button
            variant="ghost"
            onClick={() =>
              navigator.clipboard.writeText(check.session_url).then(
                () => toastDone(undefined, "Link copied"),
                () => toastFail(undefined, "Could not copy"),
              )
            }
          >
            <IconCopy className="size-4" /> Copy current link
          </Button>
        )}
      </div>
    </Panel>
  )
}

/**
 * One ID check: the documents and answers the client sent, the order, and the decision. The KYC panel
 * uses it with its own sign-in; the owner portal (/owner/kyc/<workspace>/<id>) passes ownerApi.
 */
export default function KycCheck({ api = kycApi, getToken = getKycToken, backTo = "/kyc" }) {
  const { slug, id } = useParams()
  const [check, setCheck] = useState(null)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    api(`/desk/checks/${slug}/${id}`).then((res) => (res.ok ? setCheck(res.data) : setError(res.error)))
  }, [api, slug, id])

  useEffect(() => {
    load()
  }, [load])

  const back = (
    <Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <IconArrowLeft className="size-4" /> All checks
    </Link>
  )

  if (!check) {
    return (
      <>
        {back}
        {error ? <LoadError error={error} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </>
    )
  }

  const r = check.result || {}
  const poa = r.poa || {}
  const aml = r.aml || {}
  const fromForm = r.source === "form" || (check.submissions || []).length > 0
  const [label, tone] = kycLabel(check.status)

  return (
    <>
      {back}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold uppercase leading-tight tracking-tight">{check.full_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[check.person_role, check.workspace_name, check.order_number].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={cn(PILL, tone, "self-start px-3 py-1 text-sm sm:self-auto")}>{label}</span>
      </div>
      {check.reason && check.status !== "Approved" && (
        <div
          className={cn(
            "mb-4 flex gap-2 rounded-xl border px-4 py-3 text-sm",
            REJECTED.includes(check.status)
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300",
          )}
        >
          <IconAlertTriangle className="size-5 shrink-0" />
          {check.reason}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {fromForm ? (
            <>
              <Panel title="Documents" description="The photos and files the client sent on the form.">
                {(check.submissions || []).length ? (
                  <FormFiles check={check} getToken={getToken} />
                ) : (
                  <Empty icon={IconPhotoOff} title="No documents yet">
                    The client has not uploaded anything on their new link yet.
                  </Empty>
                )}
              </Panel>
              <Panel
                title="What the client entered"
                description={check.submitted_at ? `Sent on ${shortDate(check.submitted_at)}.` : "Not sent yet."}
              >
                <Facts
                  rows={[
                    ["First name", r.first_name || String(r.full_name || "").split(" ")[0]],
                    ["Last name", r.last_name || String(r.full_name || "").split(" ").slice(1).join(" ")],
                    ["Email", r.email || check.email || check.client_email],
                    ["Date of birth", r.date_of_birth],
                    ["Document", r.document_type],
                    ["Document number", r.document_number],
                    ["Address", r.address],
                    ["Proof of address", poa.document],
                  ]}
                />
              </Panel>
            </>
          ) : (
            <Panel title="Documents" description="The photos and files Didit took during the check.">
              <Media check={check} />
            </Panel>
          )}

          {!fromForm && <Panel title="What Didit read">
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                ["ID document", r.id_status],
                ["Liveness", r.liveness_status],
                ["Face match", r.face_match_status],
                ["Proof of address", poa.status],
                ["AML", aml.status],
              ]
                .filter(([, s]) => s)
                .map(([name, s]) => (
                  <span key={name} className={cn(PILL, stepTone(s))}>
                    {name}: {s}
                  </span>
                ))}
            </div>
            <Facts
              rows={[
                ["Full name", r.full_name],
                ["Date of birth", r.date_of_birth],
                ["Nationality", r.nationality],
                ["Document", r.document_type],
                ["Document number", r.document_number],
                ["Issued by", r.issuing_country],
                ["Expires", r.document_expiry],
                ["Address on ID", r.address],
                ["Didit session", r.session_number],
              ]}
            />
          </Panel>}

          {!fromForm && Object.keys(poa).length > 0 && (
            <Panel title="Proof of address">
              <Facts
                rows={[
                  ["Document", poa.document],
                  ["Issuer", poa.issuer],
                  ["Issue date", poa.issue_date],
                  ["Name on document", poa.name_on_document],
                  ["Address", poa.address],
                ]}
              />
              {(poa.warnings || []).length > 0 && (
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300">
                  {poa.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {(aml.hits || []).length > 0 && (
            <Panel title="AML screening" description={`${aml.open_hits} possible match(es) on watch lists.`}>
              <ul className="space-y-3 text-sm">
                {aml.hits.map((h, i) => (
                  <li key={`${h.name}-${i}`} className="rounded-xl border p-3">
                    <div className="font-semibold">{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(h.lists || []).join(", ")}
                      {h.match_score != null ? ` · match ${h.match_score}` : ""}
                      {h.risk_score != null ? ` · risk ${h.risk_score}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Decision key={`${check.status}-${check.reviewed_at}`} check={check} onSaved={load} api={api} />
          <Resubmit check={check} onSaved={load} api={api} />
          <Panel title="Order and client">
            <Facts
              rows={[
                ["Workspace", check.workspace_name],
                ["Order", check.order_number],
                ["Product", check.service_name],
                ["Order status", check.order_status],
                ["Company", check.company_name && `${check.company_name}${check.company_number ? ` (${check.company_number})` : ""}`],
                ["Client", check.client_name],
                ["Email", check.email || check.client_email],
                ["Phone", check.phone],
                ["Address", check.address],
                ["Check started", shortDate(check.created_at)],
                ["Link emailed", shortDate(check.link_sent_at)],
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  )
}
