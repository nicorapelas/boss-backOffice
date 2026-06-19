import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { registerRequest } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { WindowChromeActions } from '../components/WindowChromeActions'
import { resolveBoLogoSrc } from '../theme/boLogo'
import { useBoTheme } from '../theme/BoThemeContext'

export function Login() {
  const { theme } = useBoTheme()
  const logoMark = resolveBoLogoSrc(theme, 'light')
  const { session, loading, login } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'register') {
        await registerRequest(email.trim(), password)
        setMode('login')
        setNotice('Account created. Sign in with the same email and password.')
      } else {
        await login(email.trim(), password)
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen auth-screen">
      <WindowChromeActions className="auth-window-actions" />
      <div className="panel">
        <div className="auth-brand-logo-wrap">
          <img src={logoMark} alt="CogniPOS" className="auth-brand-logo" decoding="async" />
        </div>
        <h1>{mode === 'register' ? 'Create account' : 'Back office'}</h1>
        <p className="muted">
          {mode === 'register' ? (
            <>
              First user becomes <strong>admin</strong>. Later signups are cashiers only.
            </>
          ) : (
            <>Sign in to manage products and stock.</>
          )}
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="form">
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {notice && <p className="success">{notice}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy
              ? mode === 'register'
                ? 'Creating…'
                : 'Signing in…'
              : mode === 'register'
                ? 'Create account'
                : 'Sign in'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError(null)
              setNotice(null)
            }}
          >
            {mode === 'login' ? 'Create first account…' : 'Back to sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
