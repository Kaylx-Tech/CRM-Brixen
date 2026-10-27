/**
 * Finstap blog text as React elements: a blank line starts a new paragraph, "## " a heading and
 * lines starting "- " a bullet list (same rules as the newsletter email, services/platform_content.py).
 * Everything is shown as text, never as HTML.
 */
export function PlainText({ text, className }) {
  const blocks = String(text || "").trim().split(/\n\s*\n/)
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        let lines = block.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim())
        if (!lines.length) return null
        const parts = []
        if (lines[0].startsWith("## ")) {
          parts.push(
            <h2 key="h" className="mt-8 mb-3 text-2xl font-bold tracking-tight text-slate-900">
              {lines[0].slice(3)}
            </h2>,
          )
          lines = lines.slice(1)
        }
        if (lines.length && lines.every((l) => l.trimStart().startsWith("- "))) {
          parts.push(
            <ul key="u" className="mb-5 list-disc space-y-1.5 pl-6 marker:text-[#6559ff]">
              {lines.map((l, j) => (
                <li key={j}>{l.trimStart().slice(2)}</li>
              ))}
            </ul>,
          )
        } else if (lines.length) {
          parts.push(
            <p key="p" className="mb-5">
              {lines.map((l, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {l}
                </span>
              ))}
            </p>,
          )
        }
        return <div key={i}>{parts}</div>
      })}
    </div>
  )
}
