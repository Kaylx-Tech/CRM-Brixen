import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  IconPlus,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconForms,
  IconUpload,
  IconCircleDot,
  IconSquareCheck,
  IconX,
  IconCornerDownRight,
  IconBuilding,
  IconSignature,
  IconCalendar,
} from "@tabler/icons-react"

export const FIELD_TYPES = [
  { value: "text", label: "Text input", icon: IconForms },
  { value: "date", label: "Date (calendar)", icon: IconCalendar },
  { value: "file", label: "Document upload", icon: IconUpload },
  { value: "radio", label: "Question (radio)", icon: IconCircleDot },
  { value: "checkbox", label: "Checkbox + sub-form", icon: IconSquareCheck },
  { value: "company", label: "Company (Companies House check)", icon: IconBuilding },
  { value: "company_name", label: "Company name availability", icon: IconSignature },
]

const MAX_FIELDS = 30
const MAX_OPTIONS = 20

// A new field starts with this label (editable); repeated ones are numbered so they stay separate questions
const DEFAULT_LABELS = {
  text: "Text field",
  date: "Date of birth",
  file: "Document upload",
  radio: "Question",
  checkbox: "Checkbox option",
  company: "Company name or number",
  company_name: "Proposed company name",
}

function isDefaultLabel(label) {
  const text = String(label || "").trim()
  return !text || Object.values(DEFAULT_LABELS).some((d) => text === d || new RegExp(`^${d} \\d+$`).test(text))
}

function defaultLabel(type, fields, skipIndex = -1) {
  const base = DEFAULT_LABELS[type] || "Field"
  const taken = new Set(
    fields.filter((_, i) => i !== skipIndex).map((f) => String(f.label || "").trim().toLowerCase())
  )
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1
  return `${base} ${n}`
}

function newField(type, fields = []) {
  const field = { label: defaultLabel(type, fields), type, required: type === "file", placeholder: "" }
  if (type === "radio") field.options = ["Yes", "No"]
  if (type === "checkbox") field.fields = []
  return field
}

/**
 * Option list for a radio question. On a top-level question each option can open its own fields when chosen
 * (`optionFields[i]` belongs to `options[i]`); inside a sub-form (`nested`) options are plain.
 */
function OptionsEditor({ options = [], optionFields = [], onChange, disabled, nested }) {
  const [openBranches, setOpenBranches] = React.useState({})
  const branchAt = (i) => (Array.isArray(optionFields[i]) ? optionFields[i] : [])
  const aligned = () => options.map((_, i) => branchAt(i))
  const setText = (i, text) => onChange(options.map((o, idx) => (idx === i ? text : o)), aligned())
  const setBranch = (i, fields) => onChange(options, aligned().map((b, idx) => (idx === i ? fields : b)))
  const removeOption = (i) => {
    onChange(options.filter((_, idx) => idx !== i), aligned().filter((_, idx) => idx !== i))
    setOpenBranches({})
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-background p-2">
      <p className="text-xs text-muted-foreground">
        Options (one is picked){nested ? "" : ". Each answer can open its own fields."}
      </p>
      {options.map((opt, i) => {
        const branch = branchAt(i)
        const showBranch = !nested && (branch.length > 0 || openBranches[i])
        return (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <IconCircleDot className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={opt}
                onChange={(e) => setText(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={80}
                disabled={disabled}
                aria-label={`Option ${i + 1}`}
              />
              {!nested && !showBranch ? (
                <Button type="button" variant="ghost" size="sm" className="shrink-0"
                  onClick={() => setOpenBranches((s) => ({ ...s, [i]: true }))} disabled={disabled}>
                  <IconCornerDownRight /> Ask more
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeOption(i)}
                disabled={disabled || options.length <= 2} aria-label="Remove option">
                <IconX />
              </Button>
            </div>
            {showBranch ? (
              <div className="ml-6 rounded-lg border border-dashed p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <IconCornerDownRight className="size-4" />
                  When "{opt || `Option ${i + 1}`}" is chosen, also ask:
                </p>
                <FormFieldsBuilder nested value={branch} onChange={(fields) => setBranch(i, fields)} disabled={disabled} />
              </div>
            ) : null}
          </div>
        )
      })}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...options, ""], [...aligned(), []])}
        disabled={disabled || options.length >= MAX_OPTIONS}>
        <IconPlus /> Add option
      </Button>
    </div>
  )
}

/**
 * Builder for a service's order form. Field types: text input, document upload, radio question, and a checkbox
 * that opens its own sub-form when ticked. `value` is an array of fields; ids are generated by the backend.
 * `nested` builds a checkbox's sub-form (no checkbox inside a checkbox).
 */
export default function FormFieldsBuilder({ value = [], onChange, disabled, nested = false }) {
  const types = nested ? FIELD_TYPES.filter((t) => t.value !== "checkbox") : FIELD_TYPES
  const update = (index, patch) => onChange(value.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  const changeType = (index, type) => {
    const field = value[index]
    const next = { ...field, type }
    // A label the user never changed follows the new type; a typed label is kept
    if (isDefaultLabel(field.label)) next.label = defaultLabel(type, value, index)
    if (type === "radio" && !(field.options || []).length) next.options = ["Yes", "No"]
    if (type === "checkbox" && !Array.isArray(field.fields)) next.fields = []
    update(index, next)
  }
  const remove = (index) => onChange(value.filter((_, i) => i !== index))
  const move = (index, delta) => {
    const next = [...value]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const add = (type) => onChange([...value, newField(type, value)])

  return (
    <div className="space-y-3">
      {!nested ? (
        <div>
          <Label>Order form</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Asked when this service is ordered. Text, questions and checkboxes appear on the Details step, document
            uploads on the Documents step. A checkbox opens its own fields when ticked.
          </p>
        </div>
      ) : null}

      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          {nested ? "No fields yet. Add what to ask when this box is ticked." : "No fields yet. The order uses the standard details only."}
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((field, index) => (
            <li key={index} className={`rounded-xl border p-3 ${nested ? "bg-background" : "bg-muted/20"}`}>
              <div className="grid gap-2 sm:grid-cols-[1fr_190px]">
                <Input
                  value={field.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                  // The suggested label is selected on click, so typing replaces it straight away
                  onFocus={(e) => isDefaultLabel(field.label) && e.target.select()}
                  placeholder={{
                    file: "e.g. Passport copy",
                    radio: "e.g. Is the director a UK resident?",
                    checkbox: "e.g. Add a second director",
                    company: "e.g. Company name or number",
                    company_name: "e.g. Proposed company name",
                  }[field.type] || "e.g. Director date of birth"}
                  maxLength={120}
                  disabled={disabled}
                  aria-label="Field label"
                />
                <Select value={field.type} onValueChange={(type) => type && changeType(index, type)} disabled={disabled}>
                  <SelectTrigger className="w-full" aria-label="Field type">
                    <SelectValue>{FIELD_TYPES.find((t) => t.value === field.type)?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {types.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <t.icon className="size-4" />
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {field.type === "text" ? (
                <Input
                  className="mt-2"
                  value={field.placeholder || ""}
                  onChange={(e) => update(index, { placeholder: e.target.value })}
                  placeholder="Hint shown inside the box (optional)"
                  maxLength={160}
                  disabled={disabled}
                  aria-label="Placeholder"
                />
              ) : null}

              {field.type === "date" ? (
                <p className="mt-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                  Typed as DD/MM/YYYY or picked from a calendar. A date of birth cannot be in the future.
                </p>
              ) : null}
              {field.type === "company" ? (
                <p className="mt-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                  Checked live at Companies House while the order is filled in. When a registered company is selected,
                  its official name, number, incorporation date, registered office and directors (with month/year of
                  birth) are filled in automatically, and the company is linked to the order. If not registered, the
                  typed name is kept as the proposed company name.
                </p>
              ) : null}
              {field.type === "company_name" ? (
                <p className="mt-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                  Checks whether the new name can be registered at Companies House. A name already used by a live company
                  blocks the order until another name is typed; missing "Ltd" and sensitive words show a warning.
                </p>
              ) : null}

              {field.type === "radio" ? (
                <OptionsEditor
                  options={field.options || []}
                  optionFields={field.option_fields || []}
                  onChange={(options, option_fields) => update(index, { options, option_fields })}
                  disabled={disabled}
                  nested={nested}
                />
              ) : null}

              {field.type === "checkbox" ? (
                <div className="mt-2 rounded-lg border border-dashed p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <IconCornerDownRight className="size-4" />
                    When ticked, also ask:
                  </p>
                  <FormFieldsBuilder
                    nested
                    value={field.fields || []}
                    onChange={(fields) => update(index, { fields })}
                    disabled={disabled}
                  />
                </div>
              ) : null}

              <div className="mt-2 flex items-center justify-between gap-2">
                <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={!!field.required}
                    onCheckedChange={(on) => update(index, { required: !!on })}
                    disabled={disabled}
                  />
                  {field.type === "checkbox" ? "Must be ticked" : "Required"}
                </Label>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(index, -1)}
                    disabled={disabled || index === 0} aria-label="Move up">
                    <IconArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(index, 1)}
                    disabled={disabled || index === value.length - 1} aria-label="Move down">
                    <IconArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                    onClick={() => remove(index)} disabled={disabled} aria-label="Remove field">
                    <IconTrash />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((t) => (
          <Button key={t.value} type="button" variant="outline" size="sm" className="h-auto min-h-9 w-full justify-start whitespace-normal text-left"
            onClick={() => add(t.value)}
            disabled={disabled || value.length >= MAX_FIELDS}>
            <IconPlus /> {t.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** Client-side check before saving. Returns an error message or "". */
export function formFieldsError(fields, prefix = "") {
  for (const [i, f] of (fields || []).entries()) {
    const name = `${prefix}field ${i + 1}`
    if (!String(f.label || "").trim()) return `Order form: ${name} needs a label.`
    if (f.type === "radio") {
      const opts = (f.options || []).map((o) => String(o || "").trim()).filter(Boolean)
      if (opts.length < 2) return `Order form: question "${f.label}" needs at least 2 options.`
      for (const [oi, branch] of (f.option_fields || []).entries()) {
        const inner = formFieldsError(branch || [], `"${f.label}: ${f.options?.[oi] || ""}" › `)
        if (inner) return inner
      }
    }
    if (f.type === "checkbox") {
      const inner = formFieldsError(f.fields || [], `"${f.label}" › `)
      if (inner) return inner
    }
  }
  return ""
}
