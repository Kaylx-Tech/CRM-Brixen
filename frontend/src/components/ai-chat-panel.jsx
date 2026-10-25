"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  IconArrowsMaximize,
  IconArrowUp,
  IconCopy,
  IconPlus,
  IconThumbDown,
  IconThumbUp,
  IconPencil,
  IconX,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import AiOrb from "@/components/Ai-orb"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"

const CHAT_PLACEHOLDERS = [
  "Ask Brixen AI…",
  "Work with Brixen…",
  "Ask about companies…",
  "Check filings…",
  "Search customers…",
]

const messageMotion = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] },
}

const placeholderBlur = {
  initial: { opacity: 0, filter: "blur(6px)", y: 4 },
  animate: { opacity: 1, filter: "blur(0px)", y: 0 },
  exit: { opacity: 0, filter: "blur(6px)", y: -4 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
}

function useRotatingPlaceholder(phrases, intervalMs = 2800) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % phrases.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [phrases, intervalMs])
  return phrases[index] ?? phrases[0]
}

function HeaderIconButton({ children, label, className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function AssistantActions({ content }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1">
      <HeaderIconButton label={copied ? "Copied" : "Copy"} onClick={copy} className="size-7">
        <IconCopy className="size-3.5" />
      </HeaderIconButton>
      <HeaderIconButton label="Helpful" className="size-7">
        <IconThumbUp className="size-3.5" />
      </HeaderIconButton>
      <HeaderIconButton label="Not helpful" className="size-7">
        <IconThumbDown className="size-3.5" />
      </HeaderIconButton>
    </div>
  )
}

function ChatMessage({ role, content }) {
  const isUser = role === "user"

  if (isUser) {
    return (
      <motion.div {...messageMotion} className="flex w-full justify-end">
        <div className="max-w-[85%] rounded-md bg-muted px-2.5 py-1.5 text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
          {content}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div {...messageMotion} className="flex w-full flex-col items-start">
      <p className="max-w-[92%] text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
        {content}
      </p>
      <AssistantActions content={content} />
    </motion.div>
  )
}

function TypingDots() {
  return (
    <motion.div {...messageMotion} className="flex items-center gap-1.5 py-1">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
    </motion.div>
  )
}

function topicFromMessages(messages) {
  const firstUser = messages.find((m) => m.role === "user")
  if (!firstUser?.content?.trim()) return "Greeting with no topic shared"
  const text = firstUser.content.trim()
  return text.length > 36 ? `${text.slice(0, 36)}…` : text
}

export default function AiChatPanel({
  open,
  onClose,
  messages = [],
  loading = false,
  onSubmit,
}) {
  const [value, setValue] = useState("")
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const wasOpenRef = useRef(false)
  const hasValue = value.trim().length > 0
  const placeholder = useRotatingPlaceholder(CHAT_PLACEHOLDERS)
  const topic = useMemo(() => topicFromMessages(messages), [messages])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }

    const justOpened = !wasOpenRef.current
    wasOpenRef.current = true

    // On open: jump to bottom instantly (no scroll-through animation).
    // While already open: smooth scroll only for new messages / typing.
    endRef.current?.scrollIntoView({
      behavior: justOpened ? "auto" : "smooth",
      block: "end",
    })
  }, [messages, loading, open])

  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [open])

  const send = () => {
    const text = value.trim()
    if (!text || loading) return
    onSubmit?.(text)
    setValue("")
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose?.()
      }}
      swipeDirection="right"
      showSwipeHandle={false}
    >
      <DrawerContent>
        <div className="flex h-full min-h-0 w-full flex-col">
          {/* Header — Sidekick style */}
          <header className="flex shrink-0 items-center bg-muted border-b border-border gap-2 px-4 pt-4 pb-2">
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate text-[13px] font-medium text-muted-foreground">
                {topic}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                Brixen AI chat
              </DrawerDescription>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
             
              <DrawerClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 rounded-full text-muted-foreground"
                    aria-label="Close chat"
                  />
                }
              >
                <IconX className="size-4" />
              </DrawerClose>
            </div>
          </header>

          {/* Messages */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-5 px-5 py-4 pb-6">
              {messages.length === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
                  <AiOrb size="lg" />
                  <p className="text-[15px] text-muted-foreground">
                    Hi! What can I help you with today?
                  </p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <ChatMessage key={i} role={m.role} content={m.content} />
                ))
              )}
              {loading ? <TypingDots /> : null}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          {/* Floating pill input */}
          <div className="shrink-0 px-2 pb-3 pt-1">
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background px-2.5 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
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
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder=""
                  disabled={loading}
                  aria-label={placeholder}
                  className="relative w-full bg-transparent py-1 text-sm text-foreground outline-none disabled:opacity-60"
                />
              </div>

              <HeaderIconButton label="Add" className="size-8 shrink-0">
                <IconPlus className="size-4" />
              </HeaderIconButton>

              <motion.button
                type="button"
                onClick={send}
                disabled={!hasValue || loading}
                whileTap={{ scale: 0.94 }}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  hasValue && !loading
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                )}
                aria-label="Send"
              >
                <IconArrowUp className="size-4" strokeWidth={2.25} />
              </motion.button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
