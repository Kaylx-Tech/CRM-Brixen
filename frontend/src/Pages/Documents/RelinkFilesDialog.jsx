import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { IconFolderOpen, IconFiles, IconLoader2 } from "@tabler/icons-react"
import { apiRequest } from "@/lib/api"

const MAX_BYTES = 25 * 1024 * 1024

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result)
    }
    reader.onerror = () => reject(new Error("Could not read the file"))
    reader.readAsDataURL(file)
  })
}

const LABELS = {
  LINKED: { text: "Linked to Drive", variant: "default" },
  NOT_FOUND: { text: "No matching document", variant: "secondary" },
  AMBIGUOUS: { text: "Several documents match", variant: "outline" },
  SIZE_MISMATCH: { text: "Name matches, size differs", variant: "outline" },
  ERROR: { text: "Error", variant: "destructive" },
}

/**
 * Re-attach original files to documents whose file was lost: each file is matched to an existing
 * document by name (+ size), uploaded to Google Drive and linked. No duplicate rows are created.
 */
export default function RelinkFilesDialog({ open, onOpenChange, onDone }) {
  const filesRef = useRef(null)
  const folderRef = useRef(null)
  const stopRef = useRef(false)
  const [queue, setQueue] = useState([])
  const [results, setResults] = useState([])
  const [running, setRunning] = useState(false)

  const counts = results.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] || 0) + 1 }), {})
  const done = results.length
  const pct = queue.length ? Math.round((done / queue.length) * 100) : 0

  const pick = (list) => {
    const files = Array.from(list || []).filter((f) => f.size > 0)
    setQueue(files)
    setResults([])
  }

  const sendOne = async (file, force = false) => {
    if (file.size > MAX_BYTES) return { filename: file.name, result: "ERROR", note: "larger than 25 MB" }
    try {
      const file_base64 = await fileToBase64(file)
      const res = await apiRequest("/admin/documents/relink", {
        method: "POST",
        silent: true,
        label: "Re-attach file",
        body: JSON.stringify({ filename: file.name, file_base64, force }),
      })
      if (!res.ok) return { filename: file.name, result: "ERROR", note: res.reason }
      const d = res.data?.data || res.data || {}
      return { filename: file.name, result: d.result || "ERROR", detail: d, note: d.linked ? `${d.linked.length} document(s)` : "" }
    } catch (e) {
      return { filename: file.name, result: "ERROR", note: e.message }
    }
  }

  const start = async () => {
    stopRef.current = false
    setRunning(true)
    setResults([])
    for (const file of queue) {
      if (stopRef.current) break
      const r = await sendOne(file)
      r.file = file
      setResults((prev) => [...prev, r])
    }
    setRunning(false)
    onDone?.()
  }

  const attachAnyway = async (idx) => {
    const r = results[idx]
    if (!r?.file) return
    const next = await sendOne(r.file, true)
    next.file = r.file
    setResults((prev) => prev.map((x, i) => (i === idx ? next : x)))
    onDone?.()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Re-attach original files</DialogTitle>
          <DialogDescription>
            Pick the original files (or a whole folder). Each file is matched to an existing document by name and size,
            uploaded to Google Drive and linked. Nothing is duplicated or deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={filesRef} type="file" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
          <input
            ref={folderRef}
            type="file"
            className="hidden"
            // eslint-disable-next-line react/no-unknown-property
            webkitdirectory=""
            directory=""
            multiple
            onChange={(e) => pick(e.target.files)}
          />
          <Button type="button" variant="outline" disabled={running} onClick={() => filesRef.current?.click()}>
            <IconFiles className="mr-2 h-4 w-4" /> Choose files
          </Button>
          <Button type="button" variant="outline" disabled={running} onClick={() => folderRef.current?.click()}>
            <IconFolderOpen className="mr-2 h-4 w-4" /> Choose folder
          </Button>
          <span className="text-sm text-muted-foreground">{queue.length ? `${queue.length} file(s) selected` : "No files selected"}</span>
        </div>

        {queue.length > 0 && (
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span>{done}/{queue.length} done ({pct}%)</span>
              {Object.entries(counts).map(([k, v]) => (
                <Badge key={k} variant={LABELS[k]?.variant || "outline"}>{LABELS[k]?.text || k}: {v}</Badge>
              ))}
            </div>
            {running && (
              <p className="text-xs text-muted-foreground truncate">Uploading: {queue[done]?.name}</p>
            )}
          </div>
        )}

        {results.length > 0 && (
          <ScrollArea className="h-[260px] rounded-md border">
            <div className="divide-y text-sm">
              {results.map((r, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.filename}</p>
                    {(r.note || r.detail?.customer) && (
                      <p className="text-xs text-muted-foreground truncate">{r.note || r.detail.customer}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={LABELS[r.result]?.variant || "outline"}>{LABELS[r.result]?.text || r.result}</Badge>
                    {r.result === "SIZE_MISMATCH" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={running} onClick={() => attachAnyway(idx)}>
                        Attach anyway
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {running ? (
            <Button variant="outline" onClick={() => { stopRef.current = true }}>Stop</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button disabled={!queue.length || done === queue.length} onClick={start}>
                {running && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start upload
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
