/**
 * Shared toast helpers for processing states, action buttons, and undoable deletes.
 * Uses the app toast system (@/components/ui/toast — also aliased as "sonner").
 */
import { toast } from '@/components/ui/toast'

/**
 * Show a processing (spinner) toast. Replace it later with the same `id`.
 * @returns {string} toast id
 */
export function toastProcessing(message = 'Processing…', options = {}) {
  return toast.loading(message, options)
}

/**
 * Finish a processing toast as success / error using the same id.
 */
export function toastDone(id, message, options = {}) {
  return toast.success(message, { ...options, id })
}

export function toastFail(id, message, options = {}) {
  return toast.error(message, { ...options, id })
}

/**
 * Toast with a primary action button (e.g. View, Retry, Refresh).
 */
export function toastWithAction(
  message,
  { actionLabel = 'Action', onAction, type = 'success', ...options } = {},
) {
  const fn =
    type === 'error'
      ? toast.error
      : type === 'warning'
        ? toast.warning
        : type === 'info'
          ? toast.info
          : toast.success
  return fn(message, {
    ...options,
    action: {
      label: actionLabel,
      onClick: () => onAction?.(),
    },
  })
}

/**
 * Undoable delete toast.
 *
 * Call after optimistically removing the item from UI.
 * - Undo → restores UI (`onUndo`), does NOT call API
 * - Timeout / dismiss / close → commits delete (`onCommit`)
 * - If commit fails → restores UI and shows error
 */
export function toastUndoableDelete({
  message = 'Deleted',
  duration = 5000,
  undoMessage = 'Delete cancelled',
  onUndo,
  onCommit,
} = {}) {
  let settled = false
  let undone = false
  const id = `undo_delete_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const commit = async () => {
    if (settled) return
    settled = true
    try {
      await onCommit?.()
    } catch (err) {
      onUndo?.()
      toastFail(id, err?.message || 'Delete failed. Item restored.')
    }
  }

  return toast.success(message, {
    id,
    duration,
    action: {
      label: 'Undo',
      onClick: () => {
        if (settled) return false
        settled = true
        undone = true
        onUndo?.()
        toast.info(undoMessage, {
          id,
          action: undefined,
          onDismiss: undefined,
          duration: 2500,
        })
        return false
      },
    },
    onDismiss: () => {
      if (!undone) commit()
    },
  })
}

/**
 * Run an async job with loading → success/error toasts (same id).
 */
export async function withProcessingToast(
  promiseOrFn,
  {
    loading = 'Processing…',
    success = 'Done',
    error = 'Something went wrong',
    ...options
  } = {},
) {
  return toast.promise(promiseOrFn, { loading, success, error, ...options })
}
