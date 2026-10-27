import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { IconArrowLeft, IconArticle, IconExternalLink, IconPencil, IconPlus } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PlainText } from "@/lib/plainText"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { ownerApi, shortDate } from "@/lib/owner"
import { TENANT_DOMAIN } from "@/lib/workspace"
import { Button, Empty, LoadError, PageTitle, Panel } from "./ownerUi"

/** Where a post is read: finstap.com/blog/<slug> (or this site when subdomains are off). */
function publicUrl(slug) {
  return TENANT_DOMAIN ? `https://${TENANT_DOMAIN}/blog/${slug}` : `/blog/${slug}`
}

function StatusPill({ status }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
        status === "Published" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  )
}

/** Content > Blogs: every post, drafts first in date order, with a way to write a new one. */
export default function OwnerBlog() {
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    ownerApi("/content/posts").then((res) => (res.ok ? setPosts(res.data.posts) : setError(res.error)))
  }, [])

  return (
    <>
      <PageTitle title="Blogs" description="Articles on finstap.com/blog. Drafts are only visible here.">
        <Button render={<Link to="/owner/content/blog/new" />} nativeButton={false}>
          <IconPlus className="size-4" /> New post
        </Button>
      </PageTitle>
      <LoadError error={error} />
      <Panel>
        {posts === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : posts.length ? (
          <ul className="divide-y">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link to={`/owner/content/blog/${p.id}`} className="font-medium hover:text-primary">
                    {p.title}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">
                    /blog/{p.slug}
                    {p.published_at ? ` · published ${shortDate(p.published_at)}` : ` · updated ${shortDate(p.updated_at)}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusPill status={p.status} />
                  {p.status === "Published" && (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Open on the website"
                      title="Open on the website"
                      nativeButton={false}
                      render={<a href={publicUrl(p.slug)} target="_blank" rel="noreferrer" />}
                    >
                      <IconExternalLink className="size-4" />
                    </Button>
                  )}
                  <Button variant="outline" size="lg" nativeButton={false} render={<Link to={`/owner/content/blog/${p.id}`} />}>
                    <IconPencil className="size-4" /> Edit
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={IconArticle} title="No posts yet">
            Write the first post. It shows on finstap.com/blog once you publish it.
          </Empty>
        )}
      </Panel>
    </>
  )
}

const EMPTY = { title: "", slug: "", excerpt: "", cover_url: "", body: "", status: "Draft" }

/** Write or edit one post, with a live preview. */
export function OwnerBlogEditor() {
  const { id } = useParams()
  const isNew = id === "new"
  const navigate = useNavigate()
  const [post, setPost] = useState(isNew ? EMPTY : null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isNew) return
    ownerApi(`/content/posts/${id}`).then((res) => (res.ok ? setPost(res.data) : setError(res.error)))
  }, [id, isNew])

  const set = (key) => (e) => setPost((p) => ({ ...p, [key]: e.target.value }))

  const save = async (status) => {
    setBusy(true)
    const toast = toastProcessing("Saving…")
    const res = await ownerApi(isNew ? "/content/posts" : `/content/posts/${id}`, {
      method: "POST",
      body: { ...post, status },
    })
    setBusy(false)
    if (res.ok) {
      toastDone(toast, status === "Published" ? "Published" : "Draft saved")
      setPost(res.data)
      if (isNew) navigate(`/owner/content/blog/${res.data.id}`, { replace: true })
    } else {
      toastFail(toast, res.error)
    }
  }

  if (error) return <LoadError error={error} />
  if (!post) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <>
      <Button variant="ghost" size="lg" className="-ml-2 mb-4 text-muted-foreground" nativeButton={false} render={<Link to="/owner/content/blog" />}>
        <IconArrowLeft className="size-4" /> Blogs
      </Button>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{isNew ? "New post" : "Edit post"}</h1>
          {!isNew && <StatusPill status={post.status} />}
        </div>
        <div className="flex gap-2">
          {post.status === "Published" && !isNew && (
            <Button variant="outline" disabled={busy} onClick={() => save("Draft")}>
              Unpublish
            </Button>
          )}
          {post.status !== "Published" && (
            <Button variant="outline" disabled={busy} onClick={() => save("Draft")}>
              Save draft
            </Button>
          )}
          <Button disabled={busy} onClick={() => save("Published")}>
            {post.status === "Published" ? "Save" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Post">
          <div className="space-y-4">
            <div>
              <label htmlFor="post-title" className="mb-1.5 block text-sm font-medium">Title</label>
              <Input id="post-title" value={post.title} onChange={set("title")} />
            </div>
            <div>
              <label htmlFor="post-slug" className="mb-1.5 block text-sm font-medium">Web address</label>
              <Input id="post-slug" placeholder="made from the title when empty" value={post.slug} onChange={set("slug")} />
              <p className="mt-1 text-xs text-muted-foreground">finstap.com/blog/{post.slug || "your-title"}</p>
            </div>
            <div>
              <label htmlFor="post-excerpt" className="mb-1.5 block text-sm font-medium">Short summary</label>
              <Textarea id="post-excerpt" rows={2} value={post.excerpt || ""} onChange={set("excerpt")} />
            </div>
            <div>
              <label htmlFor="post-cover" className="mb-1.5 block text-sm font-medium">Cover picture link (optional)</label>
              <Input id="post-cover" placeholder="https://…" value={post.cover_url || ""} onChange={set("cover_url")} />
            </div>
            <div>
              <label htmlFor="post-body" className="mb-1.5 block text-sm font-medium">Text</label>
              <Textarea id="post-body" rows={16} value={post.body} onChange={set("body")} className="font-mono text-sm" />
              <p className="mt-1 text-xs text-muted-foreground">
                Empty line = new paragraph · "## " at the start = heading · "- " = bullet point
              </p>
            </div>
          </div>
        </Panel>
        <Panel title="Preview">
          <article className="rounded-xl bg-white p-6 text-[15px] leading-7 text-slate-700 [color-scheme:light]">
            {post.cover_url?.startsWith("https://") && (
              <img src={post.cover_url} alt="" className="mb-6 aspect-[16/9] w-full rounded-xl object-cover" />
            )}
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{post.title || "Your title"}</h1>
            {post.excerpt && <p className="mt-3 text-lg text-slate-600">{post.excerpt}</p>}
            <PlainText text={post.body} className="mt-6" />
          </article>
        </Panel>
      </div>
    </>
  )
}
