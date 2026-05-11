import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { applyBoThemeToDocument, readStoredBoTheme, writeStoredBoTheme, type BoTheme } from './boTheme'

type BoThemeContextValue = {
  theme: BoTheme
  setTheme: (theme: BoTheme) => void
}

const BoThemeContext = createContext<BoThemeContextValue | null>(null)

export function BoThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<BoTheme>(() => readStoredBoTheme())

  const setTheme = useCallback((next: BoTheme) => {
    writeStoredBoTheme(next)
    applyBoThemeToDocument(next)
    setThemeState(next)
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return <BoThemeContext.Provider value={value}>{children}</BoThemeContext.Provider>
}

export function useBoTheme(): BoThemeContextValue {
  const ctx = useContext(BoThemeContext)
  if (!ctx) {
    throw new Error('useBoTheme must be used within BoThemeProvider')
  }
  return ctx
}
