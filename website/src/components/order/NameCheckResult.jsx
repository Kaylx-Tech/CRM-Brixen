/** The answer of the company name search (after Search), on a dark background (hero and the package name search step). */
export default function NameCheckResult({ state }) {
  return (
    <div className="mt-4 min-h-7 text-lg font-semibold text-white" aria-live="polite">
      {state.status === "short" && <p className="text-base font-normal text-white/70">Keep Typing: at Least 3 Characters.</p>}
      {state.status === "checking" && (
        <p className="flex items-center gap-2 text-base font-normal text-white/80">
          <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
          Checking &ldquo;{state.name}&rdquo; at Companies House…
        </p>
      )}
      {state.status === "error" && <p className="text-red-400">⚠️ {state.message}</p>}
      {(state.status === "available" || state.status === "taken") && (
        <div>
          <p className="break-words">{state.name}</p>
          {state.status === "available" ? (
            <p className="text-green-400">✅ This Company Name Is Available!</p>
          ) : (
            <p className="text-red-400">❌ This Company Name Is Not Available. Please Try a Different Name.</p>
          )}
          {state.status === "available" &&
            state.warnings.map((w) => (
              <p key={w} className="mt-1 text-sm font-normal text-amber-300">
                Note: {w}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}
