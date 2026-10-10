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
const dismissTimers = new Map()

function emitChange(toasts) {
  listeners.forEach((listener) => listener(toasts))
}

function clearDismissTimer(id) {
  const timer = dismissTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    dismissTimers.delete(id)
  }
}

let activeToasts = []

export const toast = (message, options = {}) => {
  const id = options.id || `toast_${++toastCounter}`
  // Replacing an existing toast must not fire its commit/onDismiss side-effects
  clearDismissTimer(id)

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

  // Same id → update in place (shell stays; content morphs)
  const existingIndex = activeToasts.findIndex((t) => t.id === id)
  if (existingIndex >= 0) {
    const next = [...activeToasts]
    next[existingIndex] = newToast
    activeToasts = next
  } else {
    activeToasts = [newToast, ...activeToasts].slice(0, 5)
  }
  emitChange(activeToasts)

  if (newToast.duration > 0) {
    const timer = setTimeout(() => {
      dismissTimers.delete(id)
      toast.dismiss(id)
    }, newToast.duration)
    dismissTimers.set(id, timer)
  }

  return id
}

toast.success = (message, options = {}) => toast(message, { ...options, type: "success" })
toast.error = (message, options = {}) => toast(message, { ...options, type: "error" })
toast.warning = (message, options = {}) => toast(message, { ...options, type: "warning" })
toast.info = (message, options = {}) => toast(message, { ...options, type: "info" })
toast.message = (message, options = {}) => toast(message, { ...options, type: "info" })
toast.loading = (message, options = {}) =>
  toast(message, { ...options, type: "loading", duration: options.duration ?? 0 })

toast.promise = (promiseOrFn, options = {}) => {
  const {
    loading = "Processing…",
    success = "Done",
    error = "Something went wrong",
    id: providedId,
    duration: successDuration,
    ...rest
  } = options
  const id = providedId || `promise_${++toastCounter}`
  toast.loading(typeof loading === "function" ? loading() : loading, {
    ...rest,
    id,
    duration: 0,
  })
  const run = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn
  return Promise.resolve(run).then(
    (data) => {
      const msg = typeof success === "function" ? success(data) : success
      toast.success(msg || "Done", {
        ...rest,
        id,
        action: undefined,
        onDismiss: undefined,
        duration: successDuration ?? 3500,
      })
      return data
    },
    (err) => {
      const msg = typeof error === "function" ? error(err) : error
      toast.error(msg || err?.message || "Something went wrong", {
        ...rest,
        id,
        action: undefined,
        onDismiss: undefined,
        duration: successDuration ?? 4500,
      })
      throw err
    },
  )
}

toast.dismiss = (id) => {
  const targets = id
    ? activeToasts.filter((t) => t.id === id)
    : [...activeToasts]
  targets.forEach((t) => {
    clearDismissTimer(t.id)
    try {
      t.onDismiss?.(t)
    } catch {
      /* ignore dismiss handler errors */
    }
  })
  if (id) {
    activeToasts = activeToasts.filter((t) => t.id !== id)
  } else {
    dismissTimers.forEach((_, key) => clearDismissTimer(key))
    activeToasts = []
  }
  emitChange(activeToasts)
}

// Soft charcoal pill — matte gradient + top edge highlight (matches design ref)
const toastShell = cn(
  "text-zinc-100",
  "rounded-full",
  "border border-white/[0.06]",
  "shadow-[0_8px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.10)]",
  "bg-[linear-gradient(180deg,#2c2c2c_0%,#222222_45%,#1a1a1a_100%)]",
)

function ToastTypeIcon({ type }) {
  if (type === "success") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-400 ring-1 ring-emerald-400/20">
        <IconCheck className="w-3.5 h-3.5" />
      </div>
    )
  }
  if (type === "error") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-400/15 text-red-400 ring-1 ring-red-400/20">
        <IconAlertOctagon className="w-3.5 h-3.5" />
      </div>
    )
  }
  if (type === "warning") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/20">
        <IconAlertTriangle className="w-3.5 h-3.5" />
      </div>
    )
  }
  if (type === "loading") {
    return <IconLoader2 className="w-4 h-4 text-sky-300 animate-spin shrink-0" />
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/20">
      <IconInfoCircle className="w-3.5 h-3.5" />
    </div>
  )
}

// Same content-swap transition as ToastSave (shell stays, inner slides)
const contentSwap = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 },
  transition: { duration: 0.15 },
}

// ── Toast Item Component ───────────────────────────────────────────
function ToastItem({ t, onDismiss }) {
  const message = typeof t.message === "function" ? t.message() : t.message
  // Key by type (+ message) so loading → success / undo morph uses ToastSave transition
  const contentKey = `${t.type}|${message}`

  return (
    <motion.div
      layout
      className={cn(
        "inline-flex min-h-11 items-center justify-center overflow-hidden",
        toastShell,
        "px-3 py-2.5 pointer-events-auto max-w-md"
      )}
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={springConfig}
    >
      <div className="flex h-full items-center gap-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={contentKey}
            className="flex items-center gap-2 text-zinc-50"
            initial={contentSwap.initial}
            animate={contentSwap.animate}
            exit={contentSwap.exit}
            transition={contentSwap.transition}
          >
            <ToastTypeIcon type={t.type} />
            <span className="text-sm font-medium text-zinc-50 leading-snug max-w-[340px] truncate">
              {message}
            </span>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {t.action ? (
            <motion.div
              key="toast-action"
              className="pl-1 border-l border-white/10"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const result = t.action.onClick?.()
                  if (result !== false) onDismiss(t.id)
                }}
                className="h-7 px-2 text-sm font-semibold text-sky-300 hover:text-sky-200 hover:bg-white/10 rounded-lg"
              >
                {t.action.label || "Action"}
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {t.type !== "loading" ? (
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded-full hover:bg-white/10"
            aria-label="Close"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </motion.div>
  )
}

// ── Toaster Container Component ─────────────────────────────────────
export function Toaster({
  position = "top-center", // "bottom-center" | "bottom-right" | "top-center" | "top-right"
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
  }[position] || "fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2"

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
  position = "top-center",
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
  }[position] || "fixed top-6 left-1/2 -translate-x-1/2 z-[100]"

  return (
    <AnimatePresence>
      {open && (
        <div className={cn(positionClasses, "pointer-events-auto")}>
          <motion.div
            className={cn(
              "inline-flex min-h-11 items-center justify-center overflow-hidden",
              toastShell,
              "px-4 py-2.5",
              className
            )}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={springConfig}
            {...props}
          >
            <div className="flex h-full items-center gap-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={state}
                  className="flex items-center gap-2 text-zinc-50"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  {state === "loading" && (
                    <>
                      <IconLoader2 className="w-4 h-4 text-sky-300 animate-spin" />
                      <span className="text-sm font-medium whitespace-nowrap text-zinc-50">
                        {loadingText}
                      </span>
                    </>
                  )}

                  {state === "success" && (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-400 ring-1 ring-emerald-400/20">
                        <IconCheck className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-sm font-medium whitespace-nowrap text-emerald-300">
                        {successText}
                      </span>
                    </>
                  )}

                  {state === "initial" && (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/20">
                        <IconAlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-sm font-medium whitespace-nowrap text-zinc-50">
                        {initialText}
                      </span>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              {state === "initial" && (
                <div className="flex items-center gap-1.5 pl-1 border-l border-white/10">
                  {onCancel && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={onCancel}
                      className="h-7 px-2.5 text-sm font-normal text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-lg"
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
                      className="h-7 px-2.5 text-sm font-medium text-red-300 hover:bg-red-400/10 hover:text-red-200 border-red-400/30 bg-transparent rounded-lg"
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
                      className="h-7 px-3 text-sm font-semibold rounded-lg bg-sky-500 text-white hover:bg-sky-400 shadow-sm shadow-sky-950/40"
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
