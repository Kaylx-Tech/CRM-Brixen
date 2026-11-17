"use client"

import { useEffect, useRef, useState } from "react"
import { SITE } from "@/lib/site"

const WAIT_MS = 500 // check once the visitor stops typing for this long
const MIN_LENGTH = 3
const answers = new Map() // name (lower case) -> promise of the answer, for this visit

function ask(name) {
  const key = name.toLowerCase()
  if (!answers.has(key)) {
    const pending = fetchAnswer(name)
    answers.set(key, pending)
    pending.then((a) => a.status === "error" && answers.delete(key)) // errors are asked again next time
  }
  return answers.get(key)
}

async function fetchAnswer(name) {
  let res
  try {
    res = await fetch(`${SITE.apiUrl}/public/name-availability?name=${encodeURIComponent(name)}`)
  } catch {
    return { status: "error", message: "Network error. Please check your connection and try again." }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.status !== "success") {
    return { status: "error", message: data.message || "We could not check this name. Please try again." }
  }
  return { status: data.available ? "available" : "taken", name: data.name, warnings: data.warnings || [], similar: data.similar || [] }
}

/**
 * Live company name search: checks the name at Companies House (CRM: GET /api/public/name-availability) a moment
 * after the visitor stops typing. Returns {state, checkNow}; state.status is idle, short, checking, available,
 * taken or error. checkNow() checks at once (the Search button / Enter).
 */
export function useNameCheck(name) {
  const wanted = name.trim()
  const [state, setState] = useState({ status: "idle" })
  const latest = useRef("")

  async function run(value) {
    latest.current = value
    setState({ status: "checking", name: value })
    const answer = await ask(value)
    if (latest.current === value) setState(answer) // ignore an older answer arriving late
  }

  useEffect(() => {
    if (wanted.length < MIN_LENGTH) {
      latest.current = ""
      const t = setTimeout(() => setState({ status: wanted ? "short" : "idle" }), 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => run(wanted), answers.has(wanted.toLowerCase()) ? 0 : WAIT_MS)
    return () => clearTimeout(t)
  }, [wanted])

  function checkNow() {
    if (wanted.length < MIN_LENGTH) {
      setState({ status: "error", message: "Please enter a company name (at least 3 characters)." })
      return
    }
    if (latest.current !== wanted || state.status === "error") run(wanted)
  }

  return { state, checkNow }
}
