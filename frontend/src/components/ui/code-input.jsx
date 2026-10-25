import { forwardRef, useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "cn"

/**
 * A one-time code shown as separate boxes (6 by default). One real input lies over the boxes, so
 * typing, paste, backspace and phone autofill ("one-time-code") all work as in a normal field.
 * Digits pop into their box, the next box shows a blinking caret, and `shake` (change it to a new
 * number, e.g. a counter) shakes the row for a wrong code.
 */
export const CodeInput = forwardRef(function CodeInput(
  { value = "", onChange, length = 6, disabled = false, invalid = false, shake = 0, className, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    if (!shake) return undefined
    setShaking(true)
    const t = setTimeout(() => setShaking(false), 450)
    return () => clearTimeout(t)
  }, [shake])

  const active = Math.min(value.length, length - 1)

  return (
    <motion.div
      className={cn("relative flex w-full justify-center gap-2 sm:gap-2.5", className)}
      animate={shaking ? { x: [0, -10, 10, -7, 7, -3, 3, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      {Array.from({ length }, (_, i) => {
        const char = value[i] || ""
        const isActive = focused && !disabled && i === active
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className={cn(
              "relative flex aspect-square w-full max-w-12 items-center justify-center rounded-xl border bg-background text-2xl font-semibold text-foreground shadow-xs transition-[border-color,box-shadow,background-color] duration-200",
              char && "border-primary/40 bg-primary/5",
              isActive && "border-primary ring-4 ring-primary/15",
              invalid && "border-destructive bg-destructive/5 ring-destructive/15",
              disabled && "opacity-60",
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {char ? (
                <motion.span
                  key={char + i}
                  initial={{ scale: 0.4, opacity: 0, y: 6 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 26 }}
                >
                  {char}
                </motion.span>
              ) : null}
            </AnimatePresence>
            {isActive && !char ? (
              <span className="pointer-events-none absolute h-6 w-0.5 animate-pulse rounded-full bg-primary" />
            ) : null}
          </motion.div>
        )
      })}
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange?.(e.target.value.replace(/\D/g, "").slice(0, length))}
        className="absolute inset-0 h-full w-full cursor-text opacity-0 caret-transparent"
        {...props}
      />
    </motion.div>
  )
})
