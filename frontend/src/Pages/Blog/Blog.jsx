import { useEffect, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { IconArrowLeft, IconArrowRight, IconCircleCheck, IconLoader2 } from "@tabler/icons-react"
import { cn } from "cn"
import { getApiBase } from "@/lib/api"
import { PlainText } from "@/lib/plainText"
import { LegalLinks } from "@/Pages/Legal/LegalLayout"
import finstapLogo from "@/assets/finstap-logo.svg"

const GRADIENT = "bg-linear-to-r from-[#297bff] to-[#834aff]"

function date(value) {
  if (!value) return ""
  const d = new Date(String(value).replace(" ", "T") + "Z")
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

async function getJson(path, options) {
  const res = await fetch(`${getApiBase()}${path}`, options)
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok && json.success !== false, data: json.data, message: json.message, error: json.error }
}

/** Email box for the Finstap newsletter (finstap.com footer and blog). */
export function NewsletterSignup({ source = "website", dark = false, className }) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState({ busy: false, done: "", error: "" })

  const submit = async (e) => {
    e.preventDefault()
    setState({ busy: true, done: "", error: "" })
    const res = await getJson("/platform/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source }),
    })
    setState({ busy: false, done: res.ok ? res.message : "", error: res.ok ? "" : res.error || "Please try again." })
  }

  if (state.done) {
    return (
      <p className={cn("flex items-center gap-2 text-sm font-medium", dark ? "text-white" : "text-emerald-700", className)}>
        <IconCircleCheck className="size-5" /> {state.done}
      </p>
    )
  }
  return (
    <form onSubmit={submit} className={cn("w-full max-w-md", className)}>
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="you@company.com"
          aria-label="Email for the newsletter"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-full border px-4 text-sm outline-none focus:ring-2 focus:ring-[#6559ff]/30",
            dark ? "border-white/30 bg-white/10 text-white placeholder:text-white/60" : "border-slate-200 bg-white text-slate-900",
          )}
        />
        <button
          type="submit"
          disabled={state.busy}
          className={cn("inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-sm font-semibold text-white", GRADIENT)}
        >
          {state.busy ? <IconLoader2 className="size-4 animate-spin" /> : "Subscribe"}
        </button>
      </div>
      {state.error && <p className={cn("mt-2 text-sm", dark ? "text-white" : "text-destructive")}>{state.error}</p>}
      <p className={cn("mt-2 text-xs", dark ? "text-white/70" : "text-slate-500")}>
        News and tips for UK practices, about once a month. Unsubscribe any time. See our{" "}
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  )
}

/** finstap.com pages outside the landing page: header, content, and a footer with the newsletter. */
function PublicShell({ children }) {
  return (
    <div className="min-h-screen bg-white text-slate-700 [color-scheme:light]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center">
            <img src={finstapLogo} alt="Finstap" className="h-8 w-auto" />
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link to="/blog" className="text-slate-600 hover:text-[#5f5cff]">
              Blog
            </Link>
            <Link to="/signup" className={cn("rounded-full px-4 py-2 font-semibold text-white", GRADIENT)}>
              Start free trial
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <section className="border-t border-slate-200 bg-[#f6f5ff]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Get the Finstap newsletter</h2>
            <p className="mt-1 text-sm text-slate-600">Product news and practical tips, straight to your inbox.</p>
          </div>
          <NewsletterSignup source="blog" />
        </div>
      </section>
      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <p>© 2026 Finstap. All rights reserved.</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  )
}

/** finstap.com/blog: every published post, newest first. */
export default function BlogList() {
  const [posts, setPosts] = useState(null)

  useEffect(() => {
    document.title = "Blog · Finstap"
    getJson("/platform/blog").then((res) => setPosts(res.ok ? res.data.posts : []))
  }, [])

  return (
    <PublicShell>
      <div className="bg-linear-to-b from-[#f4f3ff] to-white">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#5f5cff]">Blog</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">News and guides from Finstap</h1>
          <p className="mt-3 max-w-2xl text-slate-600">For accountants and company formation agents in the UK.</p>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        {posts === null ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : posts.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <Link
                key={p.id}
                to={`/blog/${p.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(101,89,255,0.35)]"
              >
                {p.cover_url ? (
                  <img src={p.cover_url} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                ) : (
                  <div className={cn("aspect-[16/9] w-full opacity-90", "bg-linear-to-br from-[#297bff] via-[#5f5cff] to-[#834aff]")} />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-xs font-medium text-slate-500">{date(p.published_at)}</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900 group-hover:text-[#5f5cff]">{p.title}</h2>
                  {p.excerpt && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{p.excerpt}</p>}
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-[#5f5cff]">
                    Read <IconArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-500">
            No posts yet. Subscribe below to hear when the first one is out.
          </p>
        )}
      </main>
    </PublicShell>
  )
}

/** finstap.com/blog/<slug>: one post. */
export function BlogPost() {
  const { slug } = useParams()
  const [post, setPost] = useState(undefined)

  useEffect(() => {
    getJson(`/platform/blog/${encodeURIComponent(slug)}`).then((res) => {
      setPost(res.ok ? res.data : null)
      document.title = res.ok ? `${res.data.title} · Finstap` : "Post not found · Finstap"
    })
  }, [slug])

  return (
    <PublicShell>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-[#5f5cff]">
          <IconArrowLeft className="size-4" /> All posts
        </Link>
        {post === undefined ? (
          <div className="mt-8 h-96 animate-pulse rounded-2xl bg-slate-100" />
        ) : post === null ? (
          <p className="mt-10 text-slate-600">This post does not exist or is no longer published.</p>
        ) : (
          <article className="mt-6">
            <p className="text-sm font-medium text-[#5f5cff]">
              {date(post.published_at)}
              {post.author ? ` · ${post.author}` : ""}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{post.title}</h1>
            {post.excerpt && <p className="mt-4 text-lg leading-8 text-slate-600">{post.excerpt}</p>}
            {post.cover_url && <img src={post.cover_url} alt="" className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover" />}
            <PlainText text={post.body} className="mt-8 text-[17px] leading-8" />
          </article>
        )}
      </main>
    </PublicShell>
  )
}

/** The unsubscribe link in every newsletter email. */
export function Unsubscribe() {
  const [params] = useSearchParams()
  const [state, setState] = useState({ busy: false, done: "", error: "" })
  const token = params.get("token") || ""

  const go = async () => {
    setState({ busy: true, done: "", error: "" })
    const res = await getJson("/platform/newsletter/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
    setState({ busy: false, done: res.ok ? `${res.data.email} will not get the Finstap newsletter any more.` : "", error: res.ok ? "" : res.error })
  }

  return (
    <PublicShell>
      <main className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">Unsubscribe from the Finstap newsletter</h1>
        {state.done ? (
          <p className="mt-6 inline-flex items-center gap-2 text-emerald-700">
            <IconCircleCheck className="size-5" /> {state.done}
          </p>
        ) : (
          <>
            <p className="mt-3 text-slate-600">You will stop getting the newsletter straight away.</p>
            {state.error && <p className="mt-4 text-sm text-destructive">{state.error}</p>}
            <button
              type="button"
              onClick={go}
              disabled={state.busy || !token}
              className={cn("mt-6 inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold text-white disabled:opacity-60", GRADIENT)}
            >
              {state.busy ? "Working…" : "Unsubscribe"}
            </button>
          </>
        )}
      </main>
    </PublicShell>
  )
}
