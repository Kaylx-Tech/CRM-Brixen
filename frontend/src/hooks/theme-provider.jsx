import { createContext, useContext, useEffect, useState } from "react"

const initialState = {
  theme: "system",
  setTheme: () => null,
  setLightOnly: () => null,
}

const ThemeProviderContext = createContext(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(storageKey) || defaultTheme
  )
  // Pages that are always light whatever the theme (the sign-in pages), see useLightOnly()
  const [lightOnly, setLightOnly] = useState(0)

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")

    if (lightOnly > 0) {
      root.classList.add("light")
      return
    }

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light"

      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme, lightOnly])

  const value = {
    theme,
    setTheme: (newTheme) => {
      localStorage.setItem(storageKey, newTheme)
      setTheme(newTheme)
    },
    setLightOnly,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}

/** Show this page in the light theme while it is open (the user's own theme comes back after). */
export function useLightOnly() {
  const { setLightOnly } = useContext(ThemeProviderContext)
  useEffect(() => {
    setLightOnly((n) => n + 1)
    return () => setLightOnly((n) => Math.max(0, n - 1))
  }, [setLightOnly])
}