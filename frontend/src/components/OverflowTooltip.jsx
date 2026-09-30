import React, { useCallback, useLayoutEffect, useRef, useState } from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "cn"

/**
 * Truncated text that only shows a tooltip when content actually overflows.
 */
export function OverflowTooltip({ text, className, contentClassName, side = "top" }) {
  const ref = useRef(null)
  const [overflowing, setOverflowing] = useState(false)
  const value = String(text ?? "").trim() || "—"

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setOverflowing(el.scrollWidth > el.clientWidth + 1)
  }, [])

  useLayoutEffect(() => {
    measure()
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return undefined
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, className, measure])

  const textNode = (
    <span
      ref={ref}
      className={cn("block truncate", className)}
      onMouseEnter={measure}
    >
      {value}
    </span>
  )

  if (!overflowing) return textNode

  return (
    <Tooltip>
      <TooltipTrigger className="block min-w-0 max-w-full text-left cursor-default">
        {textNode}
      </TooltipTrigger>
      <TooltipContent side={side} className={cn("max-w-xs break-words", contentClassName)}>
        {value}
      </TooltipContent>
    </Tooltip>
  )
}
