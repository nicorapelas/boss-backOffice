import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client'
import type { BoRole } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

type PermDef = { id: string; label: string }

function RolePermissionEditor({
  role,
  catalog,
  onSaved,
}: {
  role: BoRole
  catalog: PermDef[]
  onSaved: () => void
}) {
  const [name, setName] = useState(role.name)
  const [slug, setSlug] = useState(role.slug)
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(catalog.map((c) => [c.id, role.permissions.includes(c.id)])),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isAdmin = role.slug === 'admin'
  const isPresetSystem = role.slug === 'cashier' || role.slug === 'manager'

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      if (isAdmin) {
        await apiFetch(`/roles/${role._id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        })
        onSaved()
        return
      }
      const permissions = catalog.filter((c) => picked[c.id]).map((c) => c.id)
      const body = isPresetSystem ? { name, permissions } : { name, slug, permissions }
      await apiFetch(`/roles/${role._id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete role "${role.name}"?`)) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/roles/${role._id}`, { method: 'DELETE' })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel role-card" onSubmit={(e) => void save(e)}>
      <h3>
        {role.name}{' '}
        <span className="muted">
          ({role.slug}){role.isSystem ? ' · system' : ''}
        </span>
      </h3>
      {isAdmin && (
        <p className="muted">Administrator has full access ({'*'}). Only the display name can be changed.</p>
      )}
      {isPresetSystem && (
        <p className="muted">
          {role.slug === 'cashier' && (
            <>Preset for standard till users. Slug is fixed; adjust permissions if needed.</>
          )}
          {role.slug === 'manager' && (
            <>
              Preset supervisor: cashier access plus sales history, POS manager tools, price overrides, and lay-by
              admin. Slug is fixed; tune permissions for your store.
            </>
          )}
        </p>
      )}
      {err && <p className="error">{err}</p>}
      <label className="role-editor-display-name">
        <span className="role-editor-display-name-label">Display name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>
      {!isAdmin && !isPresetSystem && (
        <label className="stack">
          Slug (URL-safe id)
          <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} disabled={busy} />
        </label>
      )}
      {!isAdmin && (
        <fieldset className="role-perm-fieldset">
          <legend>Permissions</legend>
          <div className="role-perm-grid">
            {catalog.map((c) => (
              <label key={c.id} className="check-inline role-perm-item">
                <input
                  type="checkbox"
                  checked={!!picked[c.id]}
                  onChange={() => setPicked((p) => ({ ...p, [c.id]: !p[c.id] }))}
                  disabled={busy}
                />
                <span>
                  <code>{c.id}</code> — {c.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="form-actions role-card-form-actions">
        {!isAdmin && (
          <button type="submit" className="btn primary" disabled={busy}>
            Save role
          </button>
        )}
        {isAdmin && (
          <button type="submit" className="btn primary" disabled={busy}>
            Save name
          </button>
        )}
        {!role.isSystem && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void remove()}>
            Delete role
          </button>
        )}
      </div>
    </form>
  )
}

export function RolesPage() {
  const { session } = useAuth()
  const can = hasPermission(session?.user, 'users.manage')
  const [catalog, setCatalog] = useState<PermDef[]>([])
  const [roles, setRoles] = useState<BoRole[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newPicked, setNewPicked] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    if (!can) return
    setBusy(true)
    setError(null)
    try {
      const [cat, rlist] = await Promise.all([
        apiFetch<{ permissions: PermDef[] }>('/roles/catalog'),
        apiFetch<BoRole[]>('/roles'),
      ])
      setCatalog(cat.permissions)
      setRoles(rlist)
      setNewPicked((prev) => {
        const next = { ...prev }
        for (const c of cat.permissions) {
          if (next[c.id] === undefined) next[c.id] = false
        }
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roles')
    } finally {
      setBusy(false)
    }
  }, [can])

  useEffect(() => {
    void load()
  }, [load])

  async function createRole(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) {
      setError('Role name required')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const permissions = catalog.filter((c) => newPicked[c.id]).map((c) => c.id)
      await apiFetch('/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          slug: newSlug.trim() || undefined,
          permissions,
        }),
      })
      setNewName('')
      setNewSlug('')
      setNewPicked(Object.fromEntries(catalog.map((c) => [c.id, false])))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BoShell>
      <h1>Roles &amp; permissions</h1>
      <p className="muted">
        Built-in roles: <strong>Administrator</strong> (full access), <strong>Manager</strong> (supervisor preset), and{' '}
        <strong>Cashier</strong> (standard till). Add custom roles as needed, then assign them on the{' '}
        <Link to="/users">Users</Link> page.
      </p>

      {!can && <p className="error">Permission required: manage users.</p>}
      {can && (
        <>
          <div className="panel audit-toolbar">
            <button type="button" className="btn primary" onClick={() => void load()} disabled={busy}>
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}

          <section className="panel">
            <h2>Create role</h2>
            <form
              onSubmit={(e) => void createRole(e)}
              className="role-create-form"
            >
              <div className="inline-form">
                <label>
                  Name
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
                </label>
                <label>
                  Slug (optional)
                  <input
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="auto from name"
                  />
                </label>
              </div>
              <fieldset className="role-perm-fieldset">
                <legend>Permissions</legend>
                <div className="role-perm-grid">
                  {catalog.map((c) => (
                    <label key={c.id} className="check-inline role-perm-item">
                      <input
                        type="checkbox"
                        checked={!!newPicked[c.id]}
                        onChange={() => setNewPicked((p) => ({ ...p, [c.id]: !p[c.id] }))}
                      />
                      <span>
                        <code>{c.id}</code> — {c.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className="btn primary" disabled={busy}>
                Create role
              </button>
            </form>
          </section>

          <div className="roles-editor-list">
            {roles.map((r) => (
              <RolePermissionEditor key={r._id} role={r} catalog={catalog} onSaved={() => void load()} />
            ))}
          </div>
        </>
      )}
    </BoShell>
  )
}
