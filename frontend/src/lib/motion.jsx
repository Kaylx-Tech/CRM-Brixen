/**
 * App-wide motion (Motion / framer-motion), iOS-style springs.
 *
 * - <MotionRoot> (App root): loads only the DOM animation features (small bundle) and honours the
 *   user's "reduce motion" setting.
 * - <PageTransition>: every page fades and lifts in when you navigate.
 * - <Stagger> + <StaggerItem>: cards / grids come in one after another.
 * - springs + variants for anything custom (tables, charts, panels).
 *
 * Only opacity and transform are animated (GPU-friendly) so long lists and tables stay smooth.
 */
import React from "react"
import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react"
import { useLocation } from "react-router-dom"

// iOS-like springs: quick, no wobble, soft landing
export const spring = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 }
export const softSpring = { type: "spring", stiffness: 260, damping: 30, mass: 1 }
export const snappySpring = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 }

export const fadeUp = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
}

export const staggerContainer = (stagger = 0.045, delay = 0.02) => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
})

export function MotionRoot({ children }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user" transition={spring}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

/** Page enter animation, replayed on every route change (no exit animation, so navigation never waits). */
export function PageTransition({ children, className }) {
  const { pathname } = useLocation()
  return (
    <m.div
      key={pathname}
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={softSpring}
    >
      {children}
    </m.div>
  )
}

/** A container whose <StaggerItem> children animate in one after another. `as` picks the element. */
export function Stagger({ as = "div", stagger = 0.045, delay = 0.02, className, children, ...props }) {
  const Comp = m[as] || m.div
  return (
    <Comp className={className} variants={staggerContainer(stagger, delay)} initial="hidden" animate="show" {...props}>
      {children}
    </Comp>
  )
}

export function StaggerItem({ as = "div", className, children, ...props }) {
  const Comp = m[as] || m.div
  return (
    <Comp className={className} variants={fadeUp} {...props}>
      {children}
    </Comp>
  )
}

export { m }
