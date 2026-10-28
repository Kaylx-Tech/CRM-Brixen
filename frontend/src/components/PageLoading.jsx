import { IconLoader2 } from "@tabler/icons-react"
import { cn } from "cn"

/** Shown while a page's code is still downloading, so a slow connection never shows a blank screen. */
export default function PageLoading({ fullScreen = false }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 text-sm text-muted-foreground",
        fullScreen ? "h-svh" : "py-24"
      )}
    >
      <IconLoader2 className="size-5 animate-spin" />
      Loading…
    </div>
  )
}
