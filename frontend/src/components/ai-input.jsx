"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { IconArrowUp } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import AiOrb from "@/components/Ai-orb"
import AiChatPanel from "@/components/ai-chat-panel"

const BAR_H = 48
const BAR_W_IDLE = 200
const BAR_W_FOCUS = 380
const HOT_ZONE_Y = 88
const HOT_ZONE_X = 220

const PLACEHOLDERS = [
  "Ask anything…",
  "Find a company…",
  "Check filing due dates…",
  "Search customers…",
  "Help with accountancy…",
  "Show recent orders…",
]

const spring = {
  type: "spring",
  stiffness: 460,
  damping: 36,
  mass: 0.8,
}

const placeholderBlur = {
  initial: { opacity: 0, filter: "blur(6px)", y: 4 },
  animate: { opacity: 1, filter: "blur(0px)", y: 0 },
  exit: { opacity: 0, filter: "blur(6px)", y: -4 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
}

function useRotatingPlaceholder(phrases = PLACEHOLDERS, intervalMs = 2800) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % phrases.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [phrases, intervalMs])

  return phrases[index] ?? phrases[0]
}

function useBottomCenterProximity() {
  const [near, setNear] = useState(false)

  useEffect(() => {
    const onMove = (e) => {
      const distBottom = window.innerHeight - e.clientY
      const distCenter = Math.abs(e.clientX - window.innerWidth / 2)
      setNear(distBottom <= HOT_ZONE_Y && distCenter <= HOT_ZONE_X)
    }
    window.addEventListener("mousemove", onMove, { passive: true })
    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  return near
}

function PromptBar({
  value,
  onChange,
  onSubmit,
  expanded,
  onExpand,
  onCollapse,
  className,
}) {
  const inputRef = useRef(null)
  const hasValue = value.trim().length > 0
  const placeholder = useRotatingPlaceholder()

  return (
    <motion.div
      layout
      className={cn("relative", className)}
      animate={{ width: expanded ? BAR_W_FOCUS : BAR_W_IDLE }}
      initial={false}
      transition={spring}
      style={{ height: BAR_H }}
    >
      {/* Soft edge glow — hugs the pill */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[1px] -z-10 rounded-full blur-[6px]"
        style={{
          background:
            "linear-gradient(90deg, #fdba74, #f9a8d4, #c4b5fd, #7dd3fc)",
          backgroundSize: "200% 100%",
        }}
        animate={{
          opacity: expanded ? 0.55 : 0.32,
          backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
        }}
        transition={{
          opacity: { duration: 0.3 },
          backgroundPosition: { duration: 6, ease: "linear", repeat: Infinity },
        }}
      />

      <div
        className="relative z-10 flex h-full w-full items-center gap-2 overflow-hidden rounded-full border border-black/[0.06] bg-background px-3"
        onClick={() => {
          onExpand?.()
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
      >
        <span className="flex shrink-0 items-center justify-center">
          <AiOrb size="sm" />
        </span>

        <div className="relative min-w-0 flex-1">
          {!hasValue ? (
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholder}
                  className="truncate text-sm text-muted-foreground"
                  initial={placeholderBlur.initial}
                  animate={placeholderBlur.animate}
                  exit={placeholderBlur.exit}
                  transition={placeholderBlur.transition}
                >
                  {placeholder}
                </motion.span>
              </AnimatePresence>
            </div>
          ) : null}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => onExpand?.()}
            onBlur={() => {
              if (!hasValue) onCollapse?.()
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                inputRef.current?.blur()
                onCollapse?.()
                return
              }
              if (e.key === "Enter") {
                e.preventDefault()
                onSubmit()
              }
            }}
            placeholder=""
            aria-label={placeholder}
            className="relative w-full bg-transparent text-sm text-foreground outline-none"
          />
        </div>

        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSubmit()
          }}
          disabled={!hasValue}
          whileTap={{ scale: 0.94 }}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition-opacity",
            hasValue
              ? "bg-foreground text-background hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
          aria-label="Send"
        >
          <IconArrowUp className="size-4" strokeWidth={2.25} />
        </motion.button>
      </div>
    </motion.div>
  )
}

export default function AiInput({
  messages = [],
  loading = false,
  onSubmit,
  className,
}) {
  const nearBottom = useBottomCenterProximity()
  const [barExpanded, setBarExpanded] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [pinnedVisible, setPinnedVisible] = useState(false)

  const barVisible = !chatOpen && (nearBottom || pinnedVisible || barExpanded)

  const expandBar = useCallback(() => {
    setBarExpanded(true)
    setPinnedVisible(true)
  }, [])

  const collapseBar = useCallback(() => {
    setBarExpanded(false)
    if (!nearBottom) setPinnedVisible(false)
  }, [nearBottom])

  useEffect(() => {
    if (nearBottom) setPinnedVisible(true)
    else if (!barExpanded) setPinnedVisible(false)
  }, [nearBottom, barExpanded])

  const handleBarSubmit = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    setDraft("")
    setBarExpanded(false)
    setPinnedVisible(false)
    setChatOpen(true)
    onSubmit?.(text)
  }, [draft, onSubmit])

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed bottom-0 left-1/2 z-50 flex w-full -translate-x-1/2 justify-center pb-5",
          className
        )}
      >
        <AnimatePresence>
          {barVisible ? (
            <motion.div
              key="ai-bar"
              className="pointer-events-auto"
              initial={{ y: 72, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 72, opacity: 0 }}
              transition={spring}
              onMouseEnter={() => setPinnedVisible(true)}
              onMouseLeave={() => {
                if (!barExpanded && !nearBottom) setPinnedVisible(false)
              }}
            >
              <PromptBar
                value={draft}
                onChange={setDraft}
                onSubmit={handleBarSubmit}
                expanded={barExpanded}
                onExpand={expandBar}
                onCollapse={collapseBar}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AiChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        loading={loading}
        onSubmit={onSubmit}
      />
    </>
  )
}
