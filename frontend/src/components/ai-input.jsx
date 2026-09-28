"use client"

import React from "react"
import { cx } from "class-variance-authority"
import { AnimatePresence, motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { cn } from "cn"
import { IconTrash, IconSparkles } from "@tabler/icons-react"

const ColorOrb = ({
  dimension = "192px",
  className,
  tones,
  spinDuration = 20,
}) => {
  const fallbackTones = {
    base: "#002b4d",
    accent1: "oklch(75% 0.15 350)",
    accent2: "oklch(80% 0.12 200)",
    accent3: "oklch(78% 0.14 280)",
  }

  const palette = { ...fallbackTones, ...tones }

  const dimValue = parseInt(dimension.replace("px", ""), 10)

  const blurStrength =
    dimValue < 50 ? Math.max(dimValue * 0.008, 1) : Math.max(dimValue * 0.015, 4)

  const contrastStrength =
    dimValue < 50 ? Math.max(dimValue * 0.004, 1.2) : Math.max(dimValue * 0.008, 1.5)

  const pixelDot = dimValue < 50 ? Math.max(dimValue * 0.004, 0.05) : Math.max(dimValue * 0.008, 0.1)

  const shadowRange = dimValue < 50 ? Math.max(dimValue * 0.004, 0.5) : Math.max(dimValue * 0.008, 2)

  const maskRadius =
    dimValue < 30 ? "0%" : dimValue < 50 ? "5%" : dimValue < 100 ? "15%" : "25%"

  const adjustedContrast =
    dimValue < 30 ? 1.1 : dimValue < 50 ? Math.max(contrastStrength * 1.2, 1.3) : contrastStrength

  return (
    <div
      className={cn("color-orb", className)}
      style={{
        width: dimension,
        height: dimension,
        "--base": palette.base,
        "--accent1": palette.accent1,
        "--accent2": palette.accent2,
        "--accent3": palette.accent3,
        "--spin-duration": `${spinDuration}s`,
        "--blur": `${blurStrength}px`,
        "--contrast": adjustedContrast,
        "--dot": `${pixelDot}px`,
        "--shadow": `${shadowRange}px`,
        "--mask": maskRadius,
      }}
    >
      <style>{`
        @property --angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }

        .color-orb {
          display: grid;
          grid-template-areas: "stack";
          overflow: hidden;
          border-radius: 50%;
          position: relative;
          transform: scale(1.1);
        }

        .color-orb::before,
        .color-orb::after {
          content: "";
          display: block;
          grid-area: stack;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          transform: translateZ(0);
        }

        .color-orb::before {
          background:
            conic-gradient(
              from calc(var(--angle) * 2) at 25% 70%,
              var(--accent3),
              transparent 20% 80%,
              var(--accent3)
            ),
            conic-gradient(
              from calc(var(--angle) * 2) at 45% 75%,
              var(--accent2),
              transparent 30% 60%,
              var(--accent2)
            ),
            conic-gradient(
              from calc(var(--angle) * -3) at 80% 20%,
              var(--accent1),
              transparent 40% 60%,
              var(--accent1)
            ),
            conic-gradient(
              from calc(var(--angle) * 2) at 15% 5%,
              var(--accent2),
              transparent 10% 90%,
              var(--accent2)
            ),
            conic-gradient(
              from calc(var(--angle) * 1) at 20% 80%,
              var(--accent1),
              transparent 10% 90%,
              var(--accent1)
            ),
            conic-gradient(
              from calc(var(--angle) * -2) at 85% 10%,
              var(--accent3),
              transparent 20% 80%,
              var(--accent3)
            );
          box-shadow: inset var(--base) 0 0 var(--shadow) calc(var(--shadow) * 0.2);
          filter: blur(var(--blur)) contrast(var(--contrast));
          animation: spin var(--spin-duration) linear infinite;
        }

        .color-orb::after {
          background-image: radial-gradient(
            circle at center,
            var(--base) var(--dot),
            transparent var(--dot)
          );
          background-size: calc(var(--dot) * 2) calc(var(--dot) * 2);
          backdrop-filter: blur(calc(var(--blur) * 2)) contrast(calc(var(--contrast) * 2));
          mix-blend-mode: overlay;
        }

        .color-orb[style*="--mask: 0%"]::after {
          mask-image: none;
        }

        .color-orb:not([style*="--mask: 0%"])::after {
          mask-image: radial-gradient(black var(--mask), transparent 75%);
        }

        @keyframes spin {
          to {
            --angle: 360deg;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .color-orb::before {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}

const SPEED_FACTOR = 1

const FormContext = React.createContext({})
const useFormContext = () => React.useContext(FormContext)

export function MorphPanel({ onSend, onClear, loading = false, messages = [], schoolName = "School" }) {
  const wrapperRef = React.useRef(null)
  const textareaRef = React.useRef(null)
  const messagesEndRef = React.useRef(null)

  const [showForm, setShowForm] = React.useState(false)
  const [successFlag, setSuccessFlag] = React.useState(false)

  const triggerClose = React.useCallback(() => {
    setShowForm(false)
    textareaRef.current?.blur()
  }, [])

  const triggerOpen = React.useCallback(() => {
    setShowForm(true)
    setTimeout(() => {
      textareaRef.current?.focus()
    })
  }, [])

  const handleSuccess = React.useCallback((value) => {
    if (onSend) {
      onSend(value)
    }
    setSuccessFlag(true)
    setTimeout(() => setSuccessFlag(false), 1500)
  }, [onSend])

  React.useEffect(() => {
    if (showForm && messagesEndRef.current) {
        const timer = setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }, 100);
        return () => clearTimeout(timer);
    }
  }, [messages, showForm])

  React.useEffect(() => {
    function clickOutsideHandler(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target) && showForm) {
        triggerClose()
      }
    }
    document.addEventListener("mousedown", clickOutsideHandler)
    return () => document.removeEventListener("mousedown", clickOutsideHandler)
  }, [showForm, triggerClose])

  const ctx = React.useMemo(
    () => ({ showForm, successFlag, triggerOpen, triggerClose, loading, messages, messagesEndRef, schoolName, onClear }),
    [showForm, successFlag, triggerOpen, triggerClose, loading, messages, schoolName, onClear]
  )

  return (
    <div className={cx("flex items-end justify-end transition-all duration-300")} style={{ width: showForm ? FORM_WIDTH : 'auto', height: showForm ? FORM_HEIGHT : 'auto' }}>
      <motion.div
        ref={wrapperRef}
        data-panel
        className={cx(
          "bg-background relative z-3 flex flex-col items-center overflow-hidden border",
          showForm ? "shadow-2xl" : ""
        )}
        initial={false}
        animate={{
          width: showForm ? FORM_WIDTH : "auto",
          height: showForm ? FORM_HEIGHT : 44,
          borderRadius: showForm ? 28 : 22,
        }}
        transition={{
          type: "spring",
          stiffness: 550 / SPEED_FACTOR,
          damping: 45,
          mass: 0.7,
          delay: showForm ? 0 : 0.08,
        }}
      >
        <FormContext.Provider value={ctx}>
          <DockBar />
          <InputForm ref={textareaRef} onSuccess={handleSuccess} />
        </FormContext.Provider>
      </motion.div>
    </div>
  )
}

function DockBar() {
  const { showForm, triggerOpen, loading } = useFormContext()
  return (
    <footer 
        className={cx(
            "mt-auto flex h-[44px] items-center justify-center whitespace-nowrap select-none transition-colors",
            !showForm && "cursor-pointer hover:bg-zinc-50/50 active:bg-zinc-100/50"
        )}
        onClick={!showForm ? triggerOpen : undefined}
    >
      <div className="flex items-center justify-center gap-2 px-4 max-sm:px-3">
        <div className="flex w-fit items-center gap-2">
          <AnimatePresence mode="wait">
            {!showForm && (
              <motion.div
                key="orb"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ColorOrb dimension="24px" tones={{ base: "#002b4d" }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!showForm && (
            <div className="flex h-fit flex-1 justify-end px-2 py-0.5 text-sm font-medium text-foreground">
                <span className="truncate">{loading ? "Thinking..." : "Ask Brixen AI"}</span>
            </div>
        )}
      </div>
    </footer>
  )
}

const FORM_WIDTH = 380
const FORM_HEIGHT = 550

const InputForm = React.forwardRef(({ onSuccess }, ref) => {
  const { triggerClose, showForm, loading, messages, messagesEndRef, schoolName, onClear } = useFormContext()
  const btnRef = React.useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const value = formData.get("message")
    if (value && value.trim()) {
      onSuccess(value)
      e.currentTarget.reset()
    }
  }

  function handleKeys(e) {
    if (e.key === "Escape") triggerClose()
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute top-0 flex flex-col"
      style={{ width: "100%", height: "100%", pointerEvents: showForm ? "all" : "none" }}
    >
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full flex-col p-3"
          >
            {/* Header */}
            <div className="flex justify-between items-center py-2 px-1 mb-2">
              <div className="flex items-center gap-2">
                <ColorOrb dimension="24px" tones={{ base: "#002b4d" }} />
                <div>
                  <h4 className="text-foreground text-[15px] font-bold tracking-tight select-none">
                    Brixen AI
                  </h4>
                  <p className="text-muted-foreground text-[10px] tracking-widest select-none font-medium">
                    {loading ? "Brixen AI is thinking..." : "Corporate Assistant Online"}
                  </p>
                </div>
              </div>
              
              {showForm && messages.length > 0 && (
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onClear) {
                      onClear();
                    }
                  }}
                  className="p-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all duration-200 group"
                  title="Clear Chat History"
                >
                  <IconTrash className="h-4 w-4 transition-transform group-hover:scale-110" />
                </button>
              )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto mb-3 scroll-smooth scrollbar-hide">
                <style>{`
                    .scrollbar-hide::-webkit-scrollbar {
                        display: none;
                    }
                    .scrollbar-hide {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}</style>
                <div className="flex flex-col gap-6 min-h-full px-2">
                    {messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-700 py-6">
                            <div className="mb-5 relative transition-transform hover:scale-105 duration-500">
                                <ColorOrb dimension="72px" tones={{ base: "#002b4d" }} />
                            </div>
                            <h2 className="text-foreground text-lg font-bold tracking-tight mb-2">
                                Brixen AI Assistant
                            </h2>
                            <p className="text-muted-foreground text-xs max-w-[280px] font-medium leading-relaxed">
                                Hello! How can I assist you with your companies, accounts filings, or CRM clients today?
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {messages.map((m, i) => (
                                <div 
                                    key={i} 
                                    className={cx(
                                        "flex flex-col gap-1 max-w-[88%]",
                                        m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                                    )}
                                >
                                    <div 
                                        className={cn(
                                            "py-2 px-3.5 text-xs leading-relaxed shadow-sm whitespace-pre-wrap",
                                            m.role === 'user' 
                                                ? "bg-primary text-primary-foreground font-medium rounded-2xl" 
                                                : "bg-muted/70 text-foreground rounded-2xl border"
                                        )}
                                    >
                                        {m.content}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {loading && (
                        <div className="mr-auto flex items-start gap-2 max-w-[85%]">
                            <div className="bg-muted border p-3 rounded-2xl shadow-sm">
                                <div className="flex gap-1.5 items-center">
                                    <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce"></span>
                                    <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="h-[90px] shrink-0 border-t pt-3 relative">
                <textarea
                  ref={ref}
                  placeholder="Ask Brixen AI anything..."
                  name="message"
                  className="h-full w-full resize-none scroll-py-2 rounded-xl p-3 pb-8 text-xs outline-none focus:outline-none bg-muted/40 border text-foreground placeholder:text-muted-foreground focus:bg-background transition-all font-medium"
                  required
                  onKeyDown={handleKeys}
                  spellCheck={false}
                  disabled={loading}
                />
                <div className="absolute bottom-2 right-2 pointer-events-none">
                    <KeyHint className="bg-muted border text-muted-foreground text-[10px] scale-90 px-1.5 py-0.5">Enter</KeyHint>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
})
InputForm.displayName = "InputForm"

function KeyHint({ children, className }) {
  return (
    <kbd
      className={cx(
        "text-foreground flex h-6 w-fit items-center justify-center rounded-sm border px-[6px] font-sans",
        className
      )}
    >
      {children}
    </kbd>
  )
}

export default MorphPanel
