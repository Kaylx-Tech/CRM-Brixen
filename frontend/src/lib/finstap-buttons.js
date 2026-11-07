/**
 * Buttons for Finstap's public pages (landing, pricing, blog, newsletter): 14px corners and a 3D feel from inset
 * shadows - a light inner top edge, a darker inner bottom edge and a thin lighter border - on the logo gradient.
 */
export const BRAND_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-[14px] border border-white/25 bg-linear-to-r from-[#297bff] to-[#834aff] " +
  "px-6 py-3 text-[15px] font-medium tracking-[-0.01em] text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.16),0_8px_20px_-8px_rgba(95,92,255,0.65)] " +
  "transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] disabled:opacity-60"

/** The quiet partner of BRAND_BUTTON: a white 3D key. */
export const LIGHT_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-[14px] border border-slate-200/80 bg-white " +
  "px-6 py-3 text-[15px] font-medium tracking-[-0.01em] text-slate-800 " +
  "shadow-[inset_0_1px_0_#fff,inset_0_-2px_0_rgba(15,23,42,0.05),0_6px_16px_-10px_rgba(15,23,42,0.25)] " +
  "transition hover:-translate-y-0.5 hover:text-[#5f5cff] active:translate-y-0"
