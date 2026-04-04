import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch } from '../api/client'
import type { BackOfficeUser } from '../api/types'
import { BoShell } from '../layouts/BoShell'
import { useAuth } from '../auth/AuthContext'

export function UsersPage() {
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'
  const [users, setUsers] = useState<BackOfficeUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState<Record<string, string>>({})
  const [badgeDraft, setBadgeDraft] = useState<Record<string, string>>({})
  const [profileDraft, setProfileDraft] = useState<Record<string, { email: string; displayName: string }>>(
    {},
  )
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    displayName: '',
    badgeCode: '',
    role: 'cashier' as 'admin' | 'cashier',
  })

  async function load() {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      const list = await apiFetch<BackOfficeUser[]>('/users')
      setUsers(list)
      const drafts: Record<string, string> = {}
      const badgeCodes: Record<string, string> = {}
      const profile: Record<string, { email: string; displayName: string }> = {}
      for (const u of list) drafts[u._id] = ''
      for (const u of list) badgeCodes[u._id] = u.badgeCode ?? ''
      for (const u of list) profile[u._id] = { email: u.email, displayName: u.displayName ?? '' }
      setPasswordDraft(drafts)
      setBadgeDraft(badgeCodes)
      setProfileDraft(profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function patchUser(id: string, payload: Record<string, unknown>) {
    setError(null)
    try {
      await apiFetch(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user')
    }
  }

  async function setPassword(e: FormEvent, user: BackOfficeUser) {
    e.preventDefault()
    const password = passwordDraft[user._id]?.trim()
    if (!password) {
      setError('Password cannot be empty')
      return
    }
    setError(null)
    try {
      await apiFetch(`/users/${user._id}/set-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      setPasswordDraft((d) => ({ ...d, [user._id]: '' }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password')
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      })
      setNewUser({
        email: '',
        password: '',
        displayName: '',
        badgeCode: '',
        role: 'cashier',
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    }
  }

  async function removeUser(user: BackOfficeUser) {
    const label = user.displayName || user.email
    const ok = window.confirm(`Delete user "${label}" permanently? This cannot be undone.`)
    if (!ok) return
    setError(null)
    try {
      await apiFetch(`/users/${user._id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  return (
    <BoShell>
      <h1>User Management</h1>
      <p className="muted">Enable staff login, set passwords, and manage roles.</p>

      {!isAdmin && <p className="error">Admin role required.</p>}
      {isAdmin && (
        <>
          <div className="panel audit-toolbar">
            <button type="button" className="btn primary" onClick={() => void load()} disabled={busy}>
              {busy ? 'Refreshing…' : 'Refresh users'}
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <section className="panel user-create-panel">
            <h2>Create User</h2>
            <form className="inline-form user-create-form" onSubmit={(e) => void createUser(e)}>
              <label>
                Email
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                  minLength={6}
                  required
                />
              </label>
              <label>
                Name
                <input
                  type="text"
                  value={newUser.displayName}
                  onChange={(e) => setNewUser((p) => ({ ...p, displayName: e.target.value }))}
                />
              </label>
              <label>
                Badge Code
                <input
                  type="text"
                  value={newUser.badgeCode}
                  onChange={(e) => setNewUser((p) => ({ ...p, badgeCode: e.target.value }))}
                  placeholder="e.g. STAFF-1007"
                />
              </label>
              <label>
                Role
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser((p) => ({ ...p, role: e.target.value as 'admin' | 'cashier' }))
                  }
                >
                  <option value="cashier">cashier</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
                Create user
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="users-list">
              {users.map((u) => (
                <article key={u._id} className="user-card">
                  <header className="user-card-header">
                    <div>
                      <h3>{u.displayName || u.email}</h3>
                      <p className="muted">{u.email}</p>
                    </div>
                  </header>

                  <div className="user-card-grid">
                    <section className="user-card-block">
                      <h4>Edit Profile</h4>
                      <form
                        className="inline-password"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const profile = profileDraft[u._id]
                          void patchUser(u._id, {
                            email: profile?.email ?? u.email,
                            displayName: profile?.displayName ?? '',
                          })
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Name"
                          value={profileDraft[u._id]?.displayName ?? ''}
                          onChange={(e) =>
                            setProfileDraft((d) => ({
                              ...d,
                              [u._id]: {
                                ...(d[u._id] ?? { email: u.email, displayName: '' }),
                                displayName: e.target.value,
                              },
                            }))
                          }
                        />
                        <input
                          type="email"
                          placeholder="Email"
                          value={profileDraft[u._id]?.email ?? u.email}
                          onChange={(e) =>
                            setProfileDraft((d) => ({
                              ...d,
                              [u._id]: {
                                ...(d[u._id] ?? { email: u.email, displayName: '' }),
                                email: e.target.value,
                              },
                            }))
                          }
                        />
                        <button type="submit" className="btn small">
                          Save
                        </button>
                      </form>
                    </section>

                    <section className="user-card-block">
                      <h4>Access</h4>
                      <div className="user-card-inline">
                        <label>
                          Role
                          <select
                            value={u.role}
                            onChange={(e) =>
                              void patchUser(u._id, { role: e.target.value as 'admin' | 'cashier' })
                            }
                          >
                            <option value="cashier">cashier</option>
                            <option value="admin">admin</option>
                          </select>
                        </label>
                        <label className="check-inline">
                          <input
                            type="checkbox"
                            checked={u.active !== false}
                            onChange={(e) => void patchUser(u._id, { active: e.target.checked })}
                          />
                          <span>{u.active === false ? 'Disabled' : 'Enabled'}</span>
                        </label>
                        <label className="check-inline">
                          <input
                            type="checkbox"
                            checked={u.legacy?.canLogin !== false}
                            onChange={(e) => void patchUser(u._id, { canLogin: e.target.checked })}
                          />
                          <span>{u.legacy?.canLogin === false ? 'Locked' : 'Unlocked'}</span>
                        </label>
                      </div>
                    </section>

                    <section className="user-card-block">
                      <h4>Badge Code</h4>
                      <form
                        className="inline-password"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void patchUser(u._id, { badgeCode: badgeDraft[u._id] ?? '' })
                        }}
                      >
                        <input
                          type="text"
                          placeholder="e.g. STAFF-1007"
                          value={badgeDraft[u._id] ?? ''}
                          onChange={(e) =>
                            setBadgeDraft((d) => ({ ...d, [u._id]: e.target.value }))
                          }
                        />
                        <button type="submit" className="btn small">
                          Save
                        </button>
                      </form>
                    </section>

                    <section className="user-card-block">
                      <h4>Password / Delete</h4>
                      <div className="user-card-inline">
                        <form className="inline-password" onSubmit={(e) => void setPassword(e, u)}>
                          <input
                            type="password"
                            placeholder="New password"
                            value={passwordDraft[u._id] ?? ''}
                            onChange={(e) =>
                              setPasswordDraft((d) => ({ ...d, [u._id]: e.target.value }))
                            }
                          />
                          <button type="submit" className="btn small">
                            Save
                          </button>
                        </form>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => void removeUser(u)}
                          disabled={session?.user.id === u._id}
                        >
                          Delete
                        </button>
                      </div>
                    </section>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </BoShell>
  )
}

