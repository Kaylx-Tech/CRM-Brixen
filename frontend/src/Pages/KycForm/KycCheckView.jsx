import { useEffect, useState } from 'react'
import { IconExternalLink, IconFileText, IconLoader2, IconPhotoOff } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiRequest, authHeaders, getApiBase } from '@/lib/api'

/** One document the client sent, loaded with the team's sign-in (the files are private). */
function Document({ checkId, file }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl = ''
    let live = true
    const headers = authHeaders()
    delete headers['Content-Type']
    fetch(`${getApiBase()}/admin/kyc/${checkId}/files/${file.id}`, { headers })
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
  }, [checkId, file.id])

  return (
    <figure className="overflow-hidden rounded-xl border bg-muted/30">
      {!url ? (
        <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted-foreground">
          {failed ? 'Could not load this file' : <IconLoader2 className="size-5 animate-spin" />}
        </div>
      ) : file.kind === 'pdf' ? (
        <a href={url} target="_blank" rel="noreferrer" className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-sm font-medium text-primary">
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

function Facts({ rows }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (!shown.length) return <p className="text-sm text-muted-foreground">Nothing entered yet.</p>
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

/**
 * One KYC check, read only: what the client entered and the documents they sent (ID, selfie, proof of
 * address). Finstap's KYC team sets the status at kyc.finstap.com.
 */
export default function KycCheckView({ check, statusLabel, onClose }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!check) return undefined
    let live = true
    apiRequest(`/admin/kyc/${check.id}`, { label: 'KYC check', silent: true }).then((res) => {
      if (!live) return
      if (res.ok) setDetail(res.data?.data || null)
      else setError(res.reason || 'The check could not be loaded')
    })
    return () => {
      live = false
    }
  }, [check])

  const r = detail?.result || {}
  const [latest, ...earlier] = detail?.submissions || []
  const [label, tone] = check ? statusLabel(check.status) : ['', '']

  return (
    <Dialog open={!!check} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {check?.full_name} <Badge className={tone}>{label}</Badge>
          </DialogTitle>
          <DialogDescription>
            {[check?.email, check?.phone].filter(Boolean).join(' · ') || 'Identity check'}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!detail && !error && (
          <div className="flex justify-center py-10 text-muted-foreground">
            <IconLoader2 className="size-6 animate-spin" />
          </div>
        )}

        {detail && (
          <div className="space-y-5">
            {detail.reason && detail.status !== 'Approved' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <span className="font-medium">KYC team's note:</span> {detail.reason}
              </div>
            )}

            <section>
              <h3 className="mb-3 text-sm font-semibold">What the client entered</h3>
              <Facts
                rows={[
                  ['Full name (as on the document)', r.full_name],
                  ['Date of birth', r.date_of_birth],
                  ['Document', r.document_type],
                  ['Document number', r.document_number],
                  ['Address', r.address],
                  ['Proof of address', r.poa?.document],
                ]}
              />
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold">Documents</h3>
              {latest ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {latest.files.map((f) => (
                    <Document key={f.id} checkId={check.id} file={f} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-sm text-muted-foreground">
                  <IconPhotoOff className="size-6" /> The client has not sent documents yet.
                </div>
              )}
              {earlier.map((s) => (
                <details key={s.round} className="mt-3 rounded-xl border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Earlier try ({s.files.length} files)</summary>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {s.files.map((f) => (
                      <Document key={f.id} checkId={check.id} file={f} />
                    ))}
                  </div>
                </details>
              ))}
            </section>

            <p className="text-xs text-muted-foreground">
              Finstap's KYC team checks these documents and sets the status; the client is emailed the result.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
