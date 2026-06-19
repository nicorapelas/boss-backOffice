import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { configureApiAuth, loginRequest, logoutRequest, refreshRequest } from '../api/client'
import { loadStoredSession, persistSession } from './session'
import type { SessionBundle } from './types'

/** Optional background refresh for permission updates (tokens no longer expire on a short clock). */
const SESSION_KEEPALIVE_MS = 30 * 60 * 1000

type AuthContextValue = {
  session: SessionBundle | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const sessionRef = useRef<SessionBundle | null>(null)
  sessionRef.current = session
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null)

  const runRefresh = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current

    const task = (async () => {
      const s = sessionRef.current
      if (!s?.refreshToken) return false
      try {
        const data = await refreshRequest(s.refreshToken)
        const next: SessionBundle = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken ?? s.refreshToken,
          user: data.user,
        }
        setSession(next)
        await persistSession(next)
        return true
      } catch {
        // Transient network/server errors must not sign the user out while they are working.
        return false
      }
    })()

    refreshInFlightRef.current = task
    try {
      return await task
    } finally {
      if (refreshInFlightRef.current === task) refreshInFlightRef.current = null
    }
  }, [])

  useEffect(() => {
    configureApiAuth({
      getAccessToken: () => sessionRef.current?.accessToken ?? null,
      runRefresh,
    })
  }, [runRefresh])

  useEffect(() => {
    if (!session) return
    const onFocus = () => {
      void runRefresh()
    }
    window.addEventListener('focus', onFocus)
    const id = window.setInterval(() => {
      void runRefresh()
    }, SESSION_KEEPALIVE_MS)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(id)
    }
  }, [session, runRefresh])

  useEffect(() => {
    void (async () => {
      const stored = await loadStoredSession()
      setSession(stored)
      setLoading(false)
    })()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginRequest(email, password)
    const bundle: SessionBundle = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    }
    setSession(bundle)
    await persistSession(bundle)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // clear locally even if server unreachable
    }
    setSession(null)
    await persistSession(null)
  }, [])

  const value = useMemo(
    () => ({ session, loading, login, logout }),
    [session, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
