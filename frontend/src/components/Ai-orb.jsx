"use client"

import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

const BLINK_KEYFRAMES = `
@keyframes av-blink {
  0%, 88%, 100% { transform: scaleY(1); }
  93%            { transform: scaleY(0.07); }
  97%            { transform: scaleY(0.07); }
}
`

// Soft light multi palette — cycles dynamically
const MULTI_GRADIENTS = [
  "radial-gradient(circle at 32% 28%, #fdba74 0%, #f9a8d4 32%, #c4b5fd 62%, #7dd3fc 100%)",
  "radial-gradient(circle at 40% 30%, #f9a8d4 0%, #c4b5fd 32%, #7dd3fc 62%, #fdba74 100%)",
  "radial-gradient(circle at 28% 40%, #c4b5fd 0%, #7dd3fc 32%, #fdba74 62%, #f9a8d4 100%)",
  "radial-gradient(circle at 36% 32%, #7dd3fc 0%, #fdba74 32%, #f9a8d4 62%, #c4b5fd 100%)",
]

const PURE_WHITE_IRIS = "#ffffff"

const PRESETS = {
  // Soft multi — light peach / pink / lavender / sky + soft glow
  multi: {
    gradient: MULTI_GRADIENTS[0],
    boxShadow:
      "0 0 6px 1px rgba(253,186,116,.28), 0 0 12px 3px rgba(196,181,253,.2), 0 0 16px 4px rgba(125,211,252,.16)",
    iris: PURE_WHITE_IRIS,
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.28) 0%, rgba(255,255,255,.06) 45%, transparent 70%)",
  },
  blue: {
    gradient:
      "radial-gradient(circle at 50% 45%, #0d4d9a 0%, #3d7dd8 40%, #6fb3ff 68%, #e0eeff 100%)",
    boxShadow:
      "0 0 4px 0px rgba(20,102,216,.35), 0 0 16px 6px rgba(20,102,216,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #d4ecff 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  orange: {
    gradient:
      "radial-gradient(circle at 50% 45%, #a63e10 0%, #e27a2a 40%, #ffb46a 68%, #ffe8cc 100%)",
    boxShadow:
      "0 0 4px 0px rgba(232,100,0,.35), 0 0 16px 6px rgba(232,100,0,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #ffd9b8 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  red: {
    gradient:
      "radial-gradient(circle at 50% 45%, #a60033 0%, #e74668 40%, #ff8aaa 68%, #ffd6e8 100%)",
    boxShadow:
      "0 0 4px 0px rgba(223,24,92,.35), 0 0 16px 6px rgba(223,24,92,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #ffcde4 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  green: {
    gradient:
      "radial-gradient(circle at 50% 45%, #0d6632 0%, #2a9d5f 40%, #6dd187 68%, #d1fadd 100%)",
    boxShadow:
      "0 0 4px 0px rgba(12,168,82,.35), 0 0 16px 6px rgba(12,168,82,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #c5f5d8 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  purple: {
    gradient:
      "radial-gradient(circle at 50% 45%, #4a0080 0%, #8b3fd1 40%, #c896ff 68%, #e8d4ff 100%)",
    boxShadow:
      "0 0 4px 0px rgba(110,46,224,.35), 0 0 16px 6px rgba(110,46,224,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #e0c9ff 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  yellow: {
    gradient:
      "radial-gradient(circle at 50% 45%, #8a5500 0%, #d4a000 40%, #ffc93a 68%, #fff5cc 100%)",
    boxShadow:
      "0 0 4px 0px rgba(214,142,0,.35), 0 0 16px 6px rgba(214,142,0,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #fff0a8 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  cyan: {
    gradient:
      "radial-gradient(circle at 50% 45%, #003d66 0%, #0a8fb5 40%, #5dd4ff 68%, #cdf5ff 100%)",
    boxShadow:
      "0 0 4px 0px rgba(10,143,181,.35), 0 0 16px 6px rgba(10,143,181,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #d0f0ff 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  pink: {
    gradient:
      "radial-gradient(circle at 50% 45%, #7a0055 0%, #d63384 40%, #ff6bb3 68%, #ffe5f5 100%)",
    boxShadow:
      "0 0 4px 0px rgba(214,51,132,.35), 0 0 16px 6px rgba(214,51,132,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #ffd6ed 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  indigo: {
    gradient:
      "radial-gradient(circle at 50% 45%, #2d157a 0%, #4f46e5 40%, #8b7eff 68%, #ddd6ff 100%)",
    boxShadow:
      "0 0 4px 0px rgba(79,70,229,.35), 0 0 16px 6px rgba(79,70,229,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #e0d9ff 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  lime: {
    gradient:
      "radial-gradient(circle at 50% 45%, #4a5910 0%, #84cc16 40%, #bef264 68%, #ecfccf 100%)",
    boxShadow:
      "0 0 4px 0px rgba(132,204,22,.35), 0 0 16px 6px rgba(132,204,22,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #f7fee8 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  turquoise: {
    gradient:
      "radial-gradient(circle at 50% 45%, #1a5555 0%, #0d9488 40%, #2dd4bf 68%, #ccfbf1 100%)",
    boxShadow:
      "0 0 4px 0px rgba(13,148,136,.35), 0 0 16px 6px rgba(13,148,136,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #c0fdf5 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
  violet: {
    gradient:
      "radial-gradient(circle at 50% 45%, #4a2a7a 0%, #a855f7 40%, #d8b4fe 68%, #f3e8ff 100%)",
    boxShadow:
      "0 0 4px 0px rgba(168,85,247,.35), 0 0 16px 6px rgba(168,85,247,.18), inset 0 0 0 1px rgba(255,255,255,.05)",
    iris: "linear-gradient(135deg, #ffffff 0%, #ede9fe 100%)",
    shine:
      "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 50%, transparent 70%)",
  },
}

const SIZE = {
  sm: {
    orb: "size-7",
    eye: "w-1 h-1.5",
    eyeGap: "gap-1.5",
    eyeY: "-translate-y-0.5",
  },
  md: {
    orb: "size-10",
    eye: "w-1.5 h-2.5",
    eyeGap: "gap-2.5",
    eyeY: "-translate-y-0.5",
  },
  lg: {
    orb: "size-14",
    eye: "w-2 h-3",
    eyeGap: "gap-3.5",
    eyeY: "-translate-y-1",
  },
}

const SHAPE_RADIUS = {
  circle: "rounded-full",
  square: "rounded-[0%]",
  squircle: "rounded-[40%]",
}

function Eye({ blinking, delayMs = 0, irisGradient, sizeClass, lookX = 0, lookY = 0 }) {
  return (
    <div
      style={{
        transform: `translate(${lookX}px, ${lookY}px)`,
        transition: "transform 0.12s ease-out",
      }}
    >
      <div
        className={["rounded-full", sizeClass].filter(Boolean).join(" ")}
        style={{
          background: irisGradient,
          ...(blinking
            ? { animation: `av-blink 3.6s ease-in-out ${delayMs}ms infinite` }
            : {}),
        }}
      />
    </div>
  )
}

const EYE_LOOK_RANGE = {
  sm: 2.2,
  md: 3,
  lg: 4,
}

function AiOrb({
  blinking = true,
  color = "multi",
  size = "md",
  shape = "circle",
  className = "",
  trackCursor = true,
}) {
  const uid = useId()
  const orbRef = useRef(null)
  const noiseId = `av-n${uid.replace(/\W/g, "")}`
  const grainId = `grain-${uid.replace(/\W/g, "")}`
  const isMulti = color === "multi"
  const preset = PRESETS[color] ?? PRESETS.multi
  const dims = SIZE[size] ?? SIZE.md
  const [multiIndex, setMultiIndex] = useState(0)
  const [look, setLook] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!isMulti) return
    const id = window.setInterval(() => {
      setMultiIndex((i) => (i + 1) % MULTI_GRADIENTS.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [isMulti])

  useEffect(() => {
    if (!trackCursor) return

    const range = EYE_LOOK_RANGE[size] ?? EYE_LOOK_RANGE.md

    const onMove = (e) => {
      const el = orbRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.hypot(dx, dy) || 1
      // Normalize — farther cursor still caps at range
      const strength = Math.min(1, dist / 120)
      setLook({
        x: (dx / dist) * range * strength,
        y: (dy / dist) * range * strength,
      })
    }

    window.addEventListener("mousemove", onMove, { passive: true })
    return () => window.removeEventListener("mousemove", onMove)
  }, [trackCursor, size])

  const activeGradient = isMulti
    ? MULTI_GRADIENTS[multiIndex]
    : preset.gradient
  const eyeColor = isMulti ? PURE_WHITE_IRIS : preset.iris

  return (
    <>
      <style>{BLINK_KEYFRAMES}</style>
      <motion.div
        ref={orbRef}
        aria-label="AI Avatar"
        role="img"
        whileTap={{ scaleX: 1.15, scaleY: 1.3 }}
        transition={{
          type: "tween",
          duration: 0.8,
          ease: [0.34, 1.56, 0.64, 1],
        }}
        className={[
          "relative flex cursor-pointer items-center justify-center overflow-hidden",
          dims.orb,
          SHAPE_RADIUS[shape],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ boxShadow: preset.boxShadow }}
      >
        {/* Dynamic color layers */}
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={isMulti ? multiIndex : color}
            className="absolute inset-0"
            style={{ background: activeGradient }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        </AnimatePresence>

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] opacity-[0.2] mix-blend-overlay"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id={noiseId} x="0%" y="0%" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.72"
                numOctaves="4"
                stitchTiles="stitch"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
          </defs>
          <rect width="100%" height="100%" filter={`url(#${noiseId})`} />
        </svg>

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] opacity-[0.2] mix-blend-overlay"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id={grainId} x="0%" y="0%" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="3.2"
                numOctaves="1"
                stitchTiles="stitch"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
          </defs>
          <rect width="100%" height="100%" filter={`url(#${grainId})`} />
        </svg>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: preset.shine }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] blur-xs"
          style={{
            background:
              "radial-gradient(circle at 62% 68%, rgba(0,0,0,0.18) 0%, transparent 55%)",
          }}
        />

        <div
          className={[
            "relative z-10 flex items-center",
            dims.eyeGap,
            dims.eyeY,
          ].join(" ")}
        >
          <Eye
            blinking={blinking}
            delayMs={0}
            irisGradient={eyeColor}
            sizeClass={dims.eye}
            lookX={look.x}
            lookY={look.y}
          />
          <Eye
            blinking={blinking}
            delayMs={60}
            irisGradient={eyeColor}
            sizeClass={dims.eye}
            lookX={look.x}
            lookY={look.y}
          />
        </div>
      </motion.div>
    </>
  )
}

export { AiOrb }
export default AiOrb
