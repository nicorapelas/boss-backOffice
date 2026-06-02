import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client'
import type { BackOfficeUser, BoRole } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'
import { collectUsedBadgeCodes, generateUniqueBadgeCode, BADGE_CODE_LENGTH } from '../users/badgeCodeGenerator'

function badgeSectionDefaultOpen(hasBadge: boolean): boolean {
  return !hasBadge
}

function BadgeSectionToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className="btn ghost btn small user-section-toggle" onClick={onClick}>
      {open ? 'Hide' : 'Show'}
    </button>
  )
}

export function UsersPage() {
  const { session } = useAuth()
  const canManage = hasPermission(session?.user, 'users.manage')
  const [users, setUsers] = useState<BackOfficeUser[]>([])
  const [roles, setRoles] = useState<BoRole[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState<Record<string, string>>({})
  const [badgeDraft, setBadgeDraft] = useState<Record<string, string>>({})
  const [profileDraft, setProfileDraft] = useState<Record<string, { email: string; displayName: string }>>(
    {},
  )
  const [badgeSectionOpen, setBadgeSectionOpen] = useState<Record<string, boolean>>({})
  const [createBadgeVisible, setCreateBadgeVisible] = useState(false)
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    displayName: '',
    badgeCode: '',
    roleId: '',
    allowOfflineLogin: false,
    allowShopAssistCatalogAdjustment: false,
  })

  function isBadgeSectionOpen(userId: string, hasBadge: boolean): boolean {
    if (userId in badgeSectionOpen) return badgeSectionOpen[userId]
    return badgeSectionDefaultOpen(hasBadge)
  }

  function toggleBadgeSection(userId: string, hasBadge: boolean) {
    setBadgeSectionOpen((prev) => ({
      ...prev,
      [userId]: !isBadgeSectionOpen(userId, hasBadge),
    }))
  }

  function generateCreateBadgeCode() {
    setError(null)
    try {
      const used = collectUsedBadgeCodes(users)
      const draft = newUser.badgeCode.trim()
      if (draft) used.add(draft.toUpperCase())
      const badgeCode = generateUniqueBadgeCode(used)
      setNewUser((p) => ({ ...p, badgeCode }))
      setCreateBadgeVisible(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate badge code')
    }
  }

  async function load() {
    if (!canManage) return
    setBusy(true)
    setError(null)
    try {
      const [list, rlist] = await Promise.all([
        apiFetch<BackOfficeUser[]>('/users'),
        apiFetch<BoRole[]>('/roles'),
      ])
      setUsers(list)
      setRoles(rlist)
      const cashier = rlist.find((r) => r.slug === 'cashier')
      setNewUser((nu) => ({
        ...nu,
        roleId: nu.roleId || (cashier ? cashier._id : ''),
      }))
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
  }, [canManage])

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
    if (!newUser.roleId) {
      setError('Choose a role')
      return
    }
    setError(null)
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          displayName: newUser.displayName || undefined,
          badgeCode: newUser.badgeCode || undefined,
          roleId: newUser.roleId,
          allowOfflineLogin: newUser.allowOfflineLogin,
          allowShopAssistCatalogAdjustment: newUser.allowShopAssistCatalogAdjustment,
        }),
      })
      const cashier = roles.find((r) => r.slug === 'cashier')
      setNewUser({
        email: '',
        password: '',
        displayName: '',
        badgeCode: '',
        roleId: cashier?._id ?? '',
        allowOfflineLogin: false,
        allowShopAssistCatalogAdjustment: false,
      })
      setCreateBadgeVisible(false)
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
      <p className="muted">
        Assign roles defined on the <Link to="/roles">Roles</Link> page. Users receive permissions from their role.
      </p>

      {!canManage && <p className="error">Permission required: manage users.</p>}
      {canManage && (
        <>
          <div className="panel audit-toolbar">
            <button type="button" className="btn primary" onClick={() => void load()} disabled={busy}>
              {busy ? 'Refreshing…' : 'Refresh users'}
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <section className="panel user-create-panel">
            <h2>Create User</h2>
            <p className="muted user-create-lead">
              Back-office login and optional POS badge. Role permissions come from the{' '}
              <Link to="/roles">Roles</Link> page.
            </p>
            <form className="user-create-form" onSubmit={(e) => void createUser(e)}>
              <div className="user-fields-grid">
                <label className="user-field user-field--half">
                  Email
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                    required
                    autoComplete="email"
                  />
                </label>
                <label className="user-field user-field--half">
                  Password
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                    minLength={6}
                    required
                    autoComplete="new-password"
                  />
                </label>
                <label className="user-field user-field--half">
                  Name
                  <input
                    type="text"
                    value={newUser.displayName}
                    onChange={(e) => setNewUser((p) => ({ ...p, displayName: e.target.value }))}
                    autoComplete="name"
                  />
                </label>
                <label className="user-field user-field--half">
                  <span className="user-field-label-row">
                    <span>Badge code</span>
                    <BadgeSectionToggle
                      open={createBadgeVisible}
                      onClick={() => setCreateBadgeVisible((v) => !v)}
                    />
                  </span>
                  {createBadgeVisible ? (
                    <div className="user-badge-field">
                      <div className="user-badge-input-row">
                        <input
                          type="text"
                          value={newUser.badgeCode}
                          onChange={(e) => setNewUser((p) => ({ ...p, badgeCode: e.target.value }))}
                          placeholder={`${BADGE_CODE_LENGTH}-character code`}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="btn ghost btn small"
                          onClick={generateCreateBadgeCode}
                          disabled={busy}
                          title={`Generate a unique ${BADGE_CODE_LENGTH}-character badge not used by another user`}
                        >
                          Generate
                        </button>
                      </div>
                      <p className="muted user-badge-generate-hint">
                        Optional. Generates a random {BADGE_CODE_LENGTH}-character code (mixed letters and numbers) for POS badge login.
                      </p>
                    </div>
                  ) : (
                    <div className="user-badge-field">
                      {newUser.badgeCode.trim() ? (
                        <span className="muted user-field-hidden-hint">Badge entered (hidden)</span>
                      ) : (
                        <span className="muted user-field-hidden-hint">Hidden — show to enter a POS badge</span>
                      )}
                      <button
                        type="button"
                        className="btn ghost btn small user-badge-generate-standalone"
                        onClick={generateCreateBadgeCode}
                        disabled={busy}
                      >
                        Generate unique badge
                      </button>
                    </div>
                  )}
                </label>
                <label className="user-field user-field--half">
                  Role
                  <select
                    value={newUser.roleId}
                    onChange={(e) => setNewUser((p) => ({ ...p, roleId: e.target.value }))}
                    required
                  >
                    <option value="">Choose…</option>
                    {roles.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.name} ({r.slug})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="user-field user-field--full form-checkbox-row">
                  <input
                    type="checkbox"
                    checked={newUser.allowOfflineLogin}
                    onChange={(e) => setNewUser((p) => ({ ...p, allowOfflineLogin: e.target.checked }))}
                  />
                  <span>Allow offline login on the till when the server is unreachable</span>
                </label>
                <label className="user-field user-field--full form-checkbox-row">
                  <input
                    type="checkbox"
                    checked={newUser.allowShopAssistCatalogAdjustment}
                    onChange={(e) =>
                      setNewUser((p) => ({
                        ...p,
                        allowShopAssistCatalogAdjustment: e.target.checked,
                      }))
                    }
                  />
                  <span>Allow ShopAssist Catalog Adjustment</span>
                </label>
                <div className="user-field user-field--full user-create-actions">
                  <button type="submit" className="btn primary" disabled={busy}>
                    Create user
                  </button>
                </div>
              </div>
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
                      <p className="muted">
                        Role: <strong>{u.roleName ?? u.role}</strong> ({u.role})
                      </p>
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
                            value={u.roleId}
                            onChange={(e) => void patchUser(u._id, { roleId: e.target.value })}
                          >
                            {roles.map((r) => (
                              <option key={r._id} value={r._id}>
                                {r.name} ({r.slug})
                              </option>
                            ))}
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
                        <label className="check-inline">
                          <input
                            type="checkbox"
                            checked={u.allowOfflineLogin === true}
                            onChange={(e) => void patchUser(u._id, { allowOfflineLogin: e.target.checked })}
                          />
                          <span>{u.allowOfflineLogin ? 'Offline login allowed' : 'Offline login blocked'}</span>
                        </label>
                        <label className="check-inline">
                          <input
                            type="checkbox"
                            checked={u.allowShopAssistCatalogAdjustment === true}
                            onChange={(e) =>
                              void patchUser(u._id, {
                                allowShopAssistCatalogAdjustment: e.target.checked,
                              })
                            }
                          />
                          <span>
                            {u.allowShopAssistCatalogAdjustment
                              ? 'ShopAssist catalog adjustment allowed'
                              : 'ShopAssist catalog adjustment blocked'}
                          </span>
                        </label>
                      </div>
                    </section>

                    <section className="user-card-block">
                      <div className="user-card-block-header">
                        <h4>Badge Code</h4>
                        <BadgeSectionToggle
                          open={isBadgeSectionOpen(u._id, !!(badgeDraft[u._id] ?? u.badgeCode)?.trim())}
                          onClick={() => toggleBadgeSection(u._id, !!(badgeDraft[u._id] ?? u.badgeCode)?.trim())}
                        />
                      </div>
                      {isBadgeSectionOpen(u._id, !!(badgeDraft[u._id] ?? u.badgeCode)?.trim()) ? (
                        <form
                          className="inline-password"
                          onSubmit={(e) => {
                            e.preventDefault()
                            void patchUser(u._id, { badgeCode: badgeDraft[u._id] ?? '' })
                          }}
                        >
                          <input
                            type="text"
                            placeholder={`${BADGE_CODE_LENGTH}-character code`}
                            value={badgeDraft[u._id] ?? ''}
                            onChange={(e) =>
                              setBadgeDraft((d) => ({ ...d, [u._id]: e.target.value }))
                            }
                            autoComplete="off"
                          />
                          <button type="submit" className="btn small">
                            Save
                          </button>
                        </form>
                      ) : (badgeDraft[u._id] ?? u.badgeCode)?.trim() ? (
                        <p className="muted user-field-hidden-hint">POS badge is set (hidden)</p>
                      ) : (
                        <p className="muted user-field-hidden-hint">No badge — show to add one</p>
                      )}
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
