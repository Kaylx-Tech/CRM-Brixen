"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceFloppy,
  IconLoader2,
  IconX,
  IconInfoCircle,
  IconAlertOctagon,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const springConfig = {
  type: "spring",
  stiffness: 500,
  damping: 32,
  mass: 1,
}

// ── Global Toast State & Event Dispatcher ───────────────────────────
let listeners = []
let toastCounter = 0

function emitChange(toasts) {
  listeners.forEach((listener) => listener(toasts))
}

let activeToasts = []

export const toast = (message, options = {}) => {
  const id = options.id || `toast_${++toastCounter}`
  const newToast = {
    id,
    type: options.type || "default",
    message,
    description: options.description,
    duration: options.duration !== undefined ? options.duration : 3500,
    action: options.action,
    cancel: options.cancel,
    onDismiss: options.onDismiss,
    createdAt: Date.now(),
    ...options,
  }

  activeToasts = [newToast, ...activeToasts.filter((t) => t.id !== id)].slice(0, 5)
  emitChange(activeToasts)

  if (newToast.duration > 0) {
    setTimeout(() => {
      toast.dismiss(id)
    }, newToast.duration)
  }

  return id
}

toast.success = (message, options = {}) => toast(message, { ...options, type: "success" })
toast.error = (message, options = {}) => toast(message, { ...options, type: "error" })
toast.warning = (message, options = {}) => toast(message, { ...options, type: "warning" })
toast.info = (message, options = {}) => toast(message, { ...options, type: "info" })
toast.message = (message, options = {}) => toast(message, { ...options, type: "info" })
toast.loading = (message, options = {}) => toast(message, { ...options, type: "loading", duration: 0 })
toast.dismiss = (id) => {
  if (id) {
    activeToasts = activeToasts.filter((t) => t.id !== id)
  } else {
    activeToasts = []
  }
  emitChange(activeToasts)
}

// ── Toast Item Component ───────────────────────────────────────────
function ToastItem({ t, onDismiss }) {
  return (
    <motion.div
      layout
      className={cn(
        "inline-flex min-h-11 items-center justify-center overflow-hidden rounded-2xl",
        "bg-background/95 dark:bg-zinc-900/95 backdrop-blur-md",
        "border border-border/80 shadow-2xl shadow-black/15",
        "px-3.5 py-2 pointer-events-auto max-w-md"
      )}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={springConfig}
    >
      <div className="flex h-full items-center gap-3">
        <div className="flex items-center gap-2 text-foreground">
          {t.type === "success" && (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <IconCheck className="w-3.5 h-3.5" />
            </div>
          )}

          {t.type === "error" && (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <IconAlertOctagon className="w-3.5 h-3.5" />
            </div>
          )}

          {t.type === "warning" && (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <IconAlertTriangle className="w-3.5 h-3.5" />
            </div>
          )}

          {t.type === "info" && (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <IconInfoCircle className="w-3.5 h-3.5" />
            </div>
          )}

          {t.type === "loading" && (
            <IconLoader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
          )}

          <div className="flex flex-col min-w-0 max-w-[340px]">
            <span className="text-xs font-medium text-foreground leading-snug">
              {typeof t.message === "function" ? t.message() : t.message}
            </span>
            {t.description && (
              <span className="text-[11px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                {t.description}
              </span>
            )}
          </div>
        </div>

        {/* Action button if provided */}
        {t.action && (
          <div className="pl-1 border-l border-border/60">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                if (t.action.onClick) t.action.onClick()
                onDismiss(t.id)
              }}
              className="h-7 px-2 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg"
            >
              {t.action.label || "Action"}
            </Button>
          </div>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={() => onDismiss(t.id)}
          className="text-muted-foreground/60 hover:text-foreground transition-colors p-0.5 rounded-full"
          aria-label="Close"
        >
          <IconX className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  )
}

// ── Toaster Container Component ─────────────────────────────────────
export function Toaster({
  position = "bottom-center", // "bottom-center" | "bottom-right" | "top-center" | "top-right"
  className,
}) {
  const [toasts, setToasts] = React.useState([])

  React.useEffect(() => {
    listeners.push(setToasts)
    return () => {
      listeners = listeners.filter((l) => l !== setToasts)
    }
  }, [])

  const positionClasses = {
    "bottom-center": "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col-reverse items-center gap-2",
    "bottom-right": "fixed bottom-6 right-6 z-[100] flex flex-col-reverse items-end gap-2",
    "top-center": "fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2",
    "top-right": "fixed top-6 right-6 z-[100] flex flex-col items-end gap-2",
  }[position] || "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col-reverse items-center gap-2"

  return (
    <div className={cn(positionClasses, "pointer-events-none", className)}>
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={toast.dismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── ToastSave Confirmation Component ────────────────────────────────
export function ToastSave({
  open = true,
  state = "initial",
  onReset,
  onDiscard,
  onSave,
  onCancel,
  loadingText = "Saving changes...",
  successText = "Changes saved",
  initialText = "You have unsaved changes. Discard and close?",
  discardText = "Discard",
  saveText = "Save & Close",
  cancelText = "Keep editing",
  position = "bottom-center",
  className,
  ...props
}) {
  const handleDiscard = onDiscard || onReset

  if (!open) return null

  const positionClasses = {
    "bottom-center": "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]",
    "bottom-right": "fixed bottom-6 right-6 z-[100]",
    "top-center": "fixed top-6 left-1/2 -translate-x-1/2 z-[100]",
    "inline": "relative",
  }[position] || "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]"

  return (
    <AnimatePresence>
      {open && (
        <div className={cn(positionClasses, "pointer-events-auto")}>
          <motion.div
            className={cn(
              "inline-flex min-h-11 items-center justify-center overflow-hidden rounded-2xl",
              "bg-background/95 backdrop-blur-md",
              "border border-border/80 shadow-2xl shadow-black/15",
              "px-3.5 py-2",
              className
            )}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={springConfig}
            {...props}
          >
            <div className="flex h-full items-center gap-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={state}
                  className="flex items-center gap-2 text-foreground"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  {state === "loading" && (
                    <>
                      <IconLoader2 className="w-4 h-4 text-primary animate-spin" />
                      <span className="text-xs font-medium whitespace-nowrap">
                        {loadingText}
                      </span>
                    </>
                  )}

                  {state === "success" && (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <IconCheck className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-300">
                        {successText}
                      </span>
                    </>
                  )}

                  {state === "initial" && (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <IconAlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-medium whitespace-nowrap">
                        {initialText}
                      </span>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              {state === "initial" && (
                <div className="flex items-center gap-1.5 pl-1 border-l border-border/60">
                  {onCancel && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={onCancel}
                      className="h-7 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground rounded-lg"
                    >
                      {cancelText}
                    </Button>
                  )}

                  {handleDiscard && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleDiscard}
                      className="h-7 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 rounded-lg"
                    >
                      <IconX className="w-3 h-3 mr-1" />
                      {discardText}
                    </Button>
                  )}

                  {onSave && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={onSave}
                      className="h-7 px-3 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    >
                      <IconDeviceFloppy className="w-3.5 h-3.5 mr-1" />
                      {saveText}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default ToastSave
