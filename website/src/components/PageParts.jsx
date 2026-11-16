import Image from "next/image"
import Link from "next/link"
import { Marquee } from "@/components/sections"

/** The dark banner at the top of an inner page (as on WordPress): photo, eyebrow, title with a blue word. */
export function PageHero({ eyebrow, title, highlight, text, image = "/home/pckg-banner.jpg", children }) {
  return (
    <>
      <Marquee />
      <section className="relative isolate overflow-hidden">
        <Image src={image} alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/85" />
        <div className="mx-auto max-w-5xl px-4 py-16 text-center text-white sm:px-6 sm:py-24">
          {eyebrow && <p className="text-lg font-semibold text-brand-blue">{eyebrow}</p>}
          <h1 className="mt-2 text-4xl font-bold leading-tight sm:text-6xl">
            {title} {highlight && <span className="text-brand-blue">{highlight}</span>}
          </h1>
          {text && <p className="mx-auto mt-5 max-w-2xl text-lg text-white/85">{text}</p>}
          {children}
        </div>
      </section>
    </>
  )
}

/** **bold** and [text](url) inside a line of copied WordPress text. */
export function Inline({ text }) {
  const parts = []
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1])
      parts.push(
        <strong key={m.index} className="font-semibold text-slate-900">
          <Inline text={m[1]} />
        </strong>
      )
    else {
      const href = m[3]
      const label = m[2].trim()
      parts.push(
        href.startsWith("/") ? (
          <Link key={m.index} href={href} className="font-medium text-brand-blue underline-offset-2 hover:underline">
            {label}
          </Link>
        ) : (
          <a key={m.index} href={href} target="_blank" rel="noreferrer" className="font-medium text-brand-blue underline-offset-2 hover:underline">
            {label}
          </a>
        )
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** Copied WordPress text: [["h2" | "h3" | "p" | "li", text], ...]. A paragraph that is all bold is a small heading. */
export function RichBlocks({ blocks }) {
  const out = []
  for (let i = 0; i < blocks.length; i++) {
    const [rawTag, text] = blocks[i]
    const boldOnly = rawTag === "p" && /^\*\*[^*]+\*\*$/.test(text)
    const tag = boldOnly ? "h3" : rawTag
    if (tag === "li") {
      const items = []
      while (i < blocks.length && blocks[i][0] === "li") items.push(blocks[i++][1])
      i--
      out.push(
        <ul key={`l${i}`} className="my-5 space-y-3 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex gap-3">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand-blue" aria-hidden />
              <span>
                <Inline text={item} />
              </span>
            </li>
          ))}
        </ul>
      )
    } else if (tag === "h2") {
      out.push(
        <h2 key={i} className="mt-10 text-2xl font-bold text-brand-navy">
          <Inline text={text} />
        </h2>
      )
    } else if (tag === "h3") {
      out.push(
        <h3 key={i} className="mt-8 text-lg font-bold text-brand-navy">
          <Inline text={boldOnly ? text.slice(2, -2).replace(/\s*:\s*$/, "") : text} />
        </h3>
      )
    } else {
      out.push(
        <p key={i} className="mt-4">
          <Inline text={text} />
        </p>
      )
    }
  }
  return out
}

/** A legal document from src/content/legal/*.json. */
export function LegalDocument({ blocks, updated }) {
  return (
    <section className="bg-brand-mist py-12 sm:py-16">
      <article className="mx-auto max-w-4xl break-words rounded-3xl bg-white px-6 py-10 leading-relaxed text-slate-700 shadow-[0_30px_60px_-45px_rgba(0,57,113,0.5)] ring-1 ring-slate-100 sm:px-12 sm:py-14">
        <RichBlocks blocks={blocks} />
        {updated && <p className="mt-10 border-t border-slate-100 pt-6 text-sm text-brand-slate">{updated}</p>}
      </article>
    </section>
  )
}
