import React, { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * In-app replacement for window.prompt(): asks for one short text value.
 * onSubmit(value) is called with the trimmed text (falls back to defaultValue when empty and not required).
 */
export function PromptDialog({
  isOpen,
  onClose,
  onSubmit,
  title = "Enter a value",
  description = "",
  label = "",
  placeholder = "",
  defaultValue = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  required = false,
  isLoading = false,
}) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    if (isOpen) setValue(defaultValue)
  }, [isOpen, defaultValue])

  const trimmed = value.trim()
  const canSubmit = !isLoading && (!required || trimmed.length > 0)

  const submit = (event) => {
    event?.preventDefault()
    if (!canSubmit) return
    onSubmit(trimmed || defaultValue)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-sm mt-0.5">{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-1.5">
            {label ? <Label htmlFor="prompt-dialog-input">{label}</Label> : null}
            <Input
              id="prompt-dialog-input"
              autoFocus
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="sm:flex-1">
              {cancelText}
            </Button>
            <Button type="submit" disabled={!canSubmit} className="sm:flex-1">
              {confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default PromptDialog
