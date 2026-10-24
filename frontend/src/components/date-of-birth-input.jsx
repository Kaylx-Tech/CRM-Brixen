import { useState } from "react"
import { format } from "date-fns"
import { IconCalendar } from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DOB_FORMAT as FORMAT, maskDob, parseDob } from "@/lib/date-of-birth"

/**
 * Date of birth: type it as DD/MM/YYYY (the slashes go in by themselves) or pick it from a calendar
 * with month and year lists. The value stays a "DD/MM/YYYY" string; future dates cannot be picked.
 */
export function DateOfBirthInput({ id, value, onChange, placeholder = "DD/MM/YYYY", disabled, className }) {
  const [open, setOpen] = useState(false)
  const text = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? format(parseDob(value) || new Date(), FORMAT) : String(value || "")
  const selected = parseDob(text)
  const today = new Date()
  const complete = text.length === 10
  const invalid = complete && (!selected || selected > today)

  return (
    <div className={cn("space-y-1", className)}>
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="bday"
          placeholder={placeholder}
          value={text}
          maxLength={10}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(maskDob(e.target.value))}
          className="w-full pr-10 text-sm tabular-nums"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label="Pick date of birth from a calendar"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              />
            }
          >
            <IconCalendar className="size-4" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={selected || undefined}
              defaultMonth={selected || new Date(today.getFullYear() - 30, 0)}
              startMonth={new Date(1900, 0)}
              endMonth={today}
              disabled={{ after: today }}
              onSelect={(date) => {
                if (date) onChange(format(date, FORMAT))
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {invalid ? <p className="m-0 text-[11px] text-destructive">Enter a real date of birth as DD/MM/YYYY.</p> : null}
    </div>
  )
}
