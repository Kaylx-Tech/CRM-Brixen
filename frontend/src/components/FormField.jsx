import { IconAlertCircle } from "@tabler/icons-react"
import { cn } from "cn"

/** Red star after a label for a required field */
export function RequiredMark({ className }) {
  return (
    <span aria-hidden="true" className={cn("text-destructive -ml-1", className)}>
      *
    </span>
  )
}

/** Inline error under a field; renders nothing when there is no message */
export function FieldMessage({ message, id, className }) {
  if (!message) return null
  return (
    <p
      id={id}
      role="alert"
      className={cn("mt-1 flex items-start gap-1 text-xs leading-snug text-destructive", className)}
    >
      <IconAlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  )
}

/** Props for an Input/Textarea that has an error: red border + screen readers read the message */
export function invalidProps(errors, key, prefix = "") {
  const msg = errors?.[key]
  return msg
    ? { "aria-invalid": true, "aria-describedby": `${prefix}${key}-error` }
    : {}
}
