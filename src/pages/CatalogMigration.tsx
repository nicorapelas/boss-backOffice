import { useState, type FormEvent } from 'react'
import {
  deleteEntireCatalog,
  previewVectorImport,
  runVectorImport,
} from '../api/client'
import type { CatalogDeleteResponse, VectorImportRunResponse, VectorImportStats } from '../api/types'
import { BoShell } from '../layouts/BoShell'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'

function ImportStats({ stats }: { stats: VectorImportStats }) {
  return (
    <ul className="muted" style={{ margin: '0.5rem 0 0' }}>
      <li>
        PLU rows in Ramset.dat: <strong>{stats.pluRowsTotal}</strong>
      </li>
      <li>
        Would import / imported: <strong>{stats.migrated}</strong> (considered {stats.considered},
        skipped {stats.skipped})
      </li>
      {stats.dryRun ? (
        <li>
          <em>Preview only — no database changes.</em>
        </li>
      ) : null}
    </ul>
  )
}

export function CatalogMigrationPage() {
  const { session } = useAuth()
  const allowed = hasPermission(session?.user, 'migration.access')
  const [vectorZip, setVectorZip] = useState<File | null>(null)
  const [replaceCatalog, setReplaceCatalog] = useState(false)
  const [normalizeSku, setNormalizeSku] = useState(true)
  const [importPreview, setImportPreview] = useState<VectorImportStats | null>(null)
  const [importConfirm, setImportConfirm] = useState('')
  const [importResult, setImportResult] = useState<VectorImportRunResponse | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteResult, setDeleteResult] = useState<CatalogDeleteResponse | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function onPreviewImport(e: FormEvent) {
    e.preventDefault()
    if (!allowed || !vectorZip) return
    setBusy('preview')
    setError(null)
    setSuccess(null)
    setImportResult(null)
    try {
      const stats = await previewVectorImport(vectorZip)
      setImportPreview(stats)
      setSuccess('Vector backup looks valid. Review counts before importing.')
    } catch (err) {
      setImportPreview(null)
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setBusy(null)
    }
  }

  async function onRunImport(e: FormEvent) {
    e.preventDefault()
    if (!allowed || !vectorZip) return
    setBusy('import')
    setError(null)
    setSuccess(null)
    try {
      const result = await runVectorImport(vectorZip, {
        confirm: importConfirm,
        replaceCatalog,
        normalizeSku,
      })
      setImportResult(result)
      setImportPreview(result.import)
      setImportConfirm('')
      setSuccess(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(null)
    }
  }

  async function onDeleteCatalog(e: FormEvent) {
    e.preventDefault()
    if (!allowed) return
    setBusy('delete')
    setError(null)
    setSuccess(null)
    try {
      const result = await deleteEntireCatalog(deleteConfirm)
      setDeleteResult(result)
      setDeleteConfirm('')
      setImportPreview(null)
      setImportResult(null)
      setSuccess(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <BoShell>
      <h1>Catalog migration (temporary)</h1>
      <p className="muted">
        Import products from a Victor/Vector <code>RP_BACK</code> folder (<code>Ramset.dat</code> +{' '}
        <code>RamStock.dat</code>) or delete the entire product catalog. Remove this page once you are
        fully on CogniPOS in production.
      </p>

      {!allowed ? (
        <p className="error">Permission required: migration tools.</p>
      ) : (
        <>
          <section className="panel" style={{ marginTop: '1.25rem' }}>
            <h2>Import from Vector RP_BACK</h2>
            <p className="muted">
              ZIP the backup folder so it contains <code>Ramset.dat</code> and <code>RamStock.dat</code>{' '}
              at the root or in one subfolder. Products upsert by Vector item number and type.
            </p>
            <form onSubmit={(e) => void onPreviewImport(e)} style={{ marginBottom: '1rem' }}>
              <label>
                Vector backup (.zip)
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(ev) => {
                    setVectorZip(ev.target.files?.[0] ?? null)
                    setImportPreview(null)
                    setImportResult(null)
                  }}
                  disabled={busy !== null}
                />
              </label>
              <button
                type="submit"
                className="btn ghost"
                disabled={!vectorZip || busy !== null}
                style={{ marginTop: '0.5rem' }}
              >
                {busy === 'preview' ? 'Checking…' : 'Preview import'}
              </button>
            </form>

            {importPreview ? <ImportStats stats={importPreview} /> : null}

            <form onSubmit={(e) => void onRunImport(e)} style={{ marginTop: '1rem' }}>
              <label className="pos-settings-check" style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={replaceCatalog}
                  onChange={(e) => setReplaceCatalog(e.target.checked)}
                  disabled={busy !== null}
                />
                Delete existing catalog before import
              </label>
              <label className="pos-settings-check" style={{ display: 'flex', marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={normalizeSku}
                  onChange={(e) => setNormalizeSku(e.target.checked)}
                  disabled={busy !== null}
                />
                Normalize SKUs after import (<code>VEC-8632-0</code> → <code>8632</code>)
              </label>
              <label>
                Type <code>IMPORT</code> to confirm
                <input
                  type="text"
                  value={importConfirm}
                  onChange={(e) => setImportConfirm(e.target.value)}
                  autoComplete="off"
                  disabled={busy !== null || !importPreview}
                  placeholder="IMPORT"
                />
              </label>
              <button
                type="submit"
                className="btn primary"
                disabled={!vectorZip || !importPreview || importConfirm !== 'IMPORT' || busy !== null}
                style={{ marginTop: '0.75rem' }}
              >
                {busy === 'import' ? 'Importing…' : 'Import catalog'}
              </button>
            </form>

            {importResult?.skuNormalize ? (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                SKU normalization: {importResult.skuNormalize.updated} updated,{' '}
                {importResult.skuNormalize.conflicts} conflicts skipped.
              </p>
            ) : null}
            {importResult?.catalogDelete ? (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Cleared {importResult.catalogDelete.productsDeleted} existing products before import.
              </p>
            ) : null}
          </section>

          <section className="panel" style={{ marginTop: '1.25rem' }}>
            <h2>Delete entire catalog</h2>
            <p className="error" style={{ marginBottom: '0.75rem' }}>
              Removes all products, supplier offers, product photos, and preset product links. Sales
              history is kept but line items may reference missing products.
            </p>
            <form onSubmit={(e) => void onDeleteCatalog(e)}>
              <label>
                Type <code>DELETE CATALOG</code> to confirm
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  autoComplete="off"
                  disabled={busy !== null}
                  placeholder="DELETE CATALOG"
                />
              </label>
              <button
                type="submit"
                className="btn danger"
                disabled={deleteConfirm !== 'DELETE CATALOG' || busy !== null}
                style={{ marginTop: '0.75rem' }}
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete entire catalog'}
              </button>
            </form>
            {deleteResult ? (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                Deleted {deleteResult.productsDeleted} products, {deleteResult.supplierOffersDeleted}{' '}
                supplier offers, {deleteResult.photosRemoved} photos; cleared{' '}
                {deleteResult.presetEntriesCleared} preset entries.
              </p>
            ) : null}
          </section>

          {error ? <p className="error">{error}</p> : null}
          {success ? <p className="success">{success}</p> : null}
        </>
      )}
    </BoShell>
  )
}
