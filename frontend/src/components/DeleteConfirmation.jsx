import React from "react"
import { IconAlertTriangle, IconLoader2, IconTrash } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/**
 * Apple-style alert: a small centred card with an icon, a short question, one line on what happens, and
 * two equal buttons with the action named on it (never Yes / No). Cancel is the safe way out.
 * tone "destructive" (default) for delete / remove, "default" for other confirmations (send, change plan).
 */
export function DeleteConfirmation({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete this item?",
  description = "This can't be undone.",
  confirmText = "Delete",
  cancelText = "Cancel",
  loadingText,
  isLoading = false,
  tone = "destructive",
}) {
  const destructive = tone === "destructive"
  const Icon = destructive ? IconTrash : IconAlertTriangle
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent showCloseButton={false} className="gap-5 p-6 text-center sm:max-w-[20rem]">
        <DialogHeader className="items-center gap-2 text-center sm:text-center">
          <span
            className={`mb-1 grid size-11 place-items-center rounded-full ${
              destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            }`}
          >
            <Icon className="size-5 stroke-[1.75]" />
          </span>
          <DialogTitle className="text-[1.0625rem] font-semibold leading-snug">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{description}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="ghost" size="lg" className="bg-muted text-foreground hover:bg-muted/70" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onConfirm}
            disabled={isLoading}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          >
            {isLoading ? <IconLoader2 className="animate-spin" /> : null}
            {isLoading ? loadingText || (destructive ? "Deleting…" : "Working…") : confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteConfirmation
