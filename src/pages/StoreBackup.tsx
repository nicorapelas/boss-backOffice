import { useEffect, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import {
  downloadStoreBackup,
  fetchMongoCloudBackupStatus,
  previewStoreRestore,
  restoreStoreBackup,
  triggerMongoCloudBackup,
} from '../api/client'
import type { MongoCloudBackupStatus, StoreBackupManifest, StoreRestoreResponse } from '../api/types'
import { BusyModal, waitForModalPaint } from '../components/BusyModal'
import { BoShell } from '../layouts/BoShell'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'

type BusyKind = 'backup' | 'cloud' | 'preview' | 'restore'

const BUSY_COPY: Record<BusyKind, { title: string; message: string }> = {
  backup: {
    title: 'Preparing backup',
    message: 'Collecting store data and building the ZIP file. This may take a few minutes.',
  },
  cloud: {
    title: 'Backing up to cloud',
    message:
      'Dumping MongoDB and mirroring to the configured cloud destination. This may take a few minutes.',
  },
  preview: {
    title: 'Checking backup',
    message: 'Reading the ZIP and validating contents. Please wait…',
  },
  restore: {
    title: 'Restoring store',
    message:
      'Replacing all store data from the backup. Do not close this window — this can take several minutes for large catalogs.',
  },
}

export function StoreBackupPage() {
  const { session } = useAuth()
  const allowed = hasPermission(session?.user, 'migration.access')
  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState<BusyKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [preview, setPreview] = useState<StoreBackupManifest | null>(null)
  const [restoreResult, setRestoreResult] = useState<StoreRestoreResponse | null>(null)
  const [cloudStatus, setCloudStatus] = useState<MongoCloudBackupStatus | null>(null)

  useEffect(() => {
    if (!allowed) return
    void fetchMongoCloudBackupStatus()
      .then(setCloudStatus)
      .catch(() => setCloudStatus(null))
  }, [allowed])

  async function refreshCloudStatus() {
    try {
      setCloudStatus(await fetchMongoCloudBackupStatus())
    } catch {
      setCloudStatus(null)
    }
  }

  async function beginBusy(kind: BusyKind, work: () => Promise<void>) {
    flushSync(() => setBusy(kind))
    await waitForModalPaint()
    try {
      await work()
    } finally {
      setBusy(null)
    }
  }

  async function onDownloadBackup() {
    if (!allowed) return
    setError(null)
    setSuccess(null)
    try {
      await beginBusy('backup', async () => {
        await downloadStoreBackup(includePhotos)
        setSuccess('Backup download started.')
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup failed')
    }
  }

  async function onCloudBackup() {
    if (!allowed) return
    setError(null)
    setSuccess(null)
    try {
      await beginBusy('cloud', async () => {
        const res = await triggerMongoCloudBackup()
        await refreshCloudStatus()
        const mb = (res.result.archiveBytes / (1024 * 1024)).toFixed(1)
        setSuccess(`${res.message} (${res.result.databaseName}, ${mb} MB)`)
      })
    } catch (e) {
      await refreshCloudStatus()
      setError(e instanceof Error ? e.message : 'Cloud backup failed')
    }
  }

  async function onPreview(e: FormEvent) {
    e.preventDefault()
    if (!allowed || !file) return
    setError(null)
    setSuccess(null)
    setRestoreResult(null)
    try {
      await beginBusy('preview', async () => {
        const manifest = await previewStoreRestore(file)
        setPreview(manifest)
        setSuccess('Backup file is valid. Review counts below before restoring.')
      })
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Preview failed')
    }
  }

  async function onRestore(e: FormEvent) {
    e.preventDefault()
    if (!allowed || !file) return
    setError(null)
    setSuccess(null)
    try {
      await beginBusy('restore', async () => {
        const result = await restoreStoreBackup(file, confirmText)
        setRestoreResult(result)
        setPreview(result.manifest)
        setSuccess(result.message)
        setConfirmText('')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    }
  }

  const totalProducts = preview?.counts.products ?? restoreResult?.manifest.counts.products
  const busyCopy = busy ? BUSY_COPY[busy] : null

  return (
    <BoShell>
      <BusyModal
        open={busy !== null}
        title={busyCopy?.title ?? 'Please wait'}
        message={busyCopy?.message}
      />

      <h1>Store backup &amp; restore</h1>
      <p className="muted">
        Full disaster-recovery snapshot: products, photos, users, sales, lay-bys, quotes, shifts, and
        related data. Restore <strong>replaces everything</strong> in the database with the backup file.
      </p>

      {!allowed ? (
        <p className="error">Permission required: migration tools.</p>
      ) : (
        <>
          <section className="panel" style={{ marginTop: '1.25rem' }}>
            <h2>Download backup</h2>
            <p className="muted">
              Save the ZIP off-server (USB, cloud). Use after HDD failure or if the server is stolen.
            </p>
            <label className="pos-settings-check" style={{ display: 'flex', margin: '0.75rem 0' }}>
              <input
                type="checkbox"
                checked={includePhotos}
                onChange={(e) => setIncludePhotos(e.target.checked)}
                disabled={busy !== null}
              />
              Include product photos (larger file)
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={busy !== null}
              onClick={() => void onDownloadBackup()}
            >
              {busy === 'backup' ? 'Preparing…' : 'Download full backup (ZIP)'}
            </button>
          </section>

          <section className="panel" style={{ marginTop: '1.25rem' }}>
            <h2>Cloud backup (MongoDB)</h2>
            <p className="muted">
              Mirror the live database to your configured MongoDB Atlas (or remote) cluster using{' '}
              <code>mongodump</code> and <code>mongorestore</code>. Runs automatically each day at{' '}
              <strong>{cloudStatus?.schedule ?? '13:00'}</strong> when enabled on the server.
            </p>
            {cloudStatus && !cloudStatus.enabled ? (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Daily schedule is <strong>off</strong> (<code>mongoCloudBackup.enabled</code>). Manual
                backup still works when a destination URI is configured.
              </p>
            ) : null}
            {cloudStatus && !cloudStatus.configured ? (
              <p className="error" style={{ marginTop: '0.5rem' }}>
                Destination URI is missing — set <code>mongoCloudBackup.destinationUri</code> or{' '}
                <code>MONGO_CLOUD_BACKUP_URI</code> in the config file the server is using (
                <code>development.json</code> when running <code>npm run dev</code>,{' '}
                <code>production.json</code> or env when running production).
              </p>
            ) : null}
            {cloudStatus?.lastRun ? (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Last successful backup:{' '}
                <strong>{new Date(cloudStatus.lastRun.finishedAt).toLocaleString()}</strong>
                {' · '}
                {cloudStatus.lastRun.trigger === 'manual' ? 'manual' : 'scheduled'}
              </p>
            ) : null}
            {cloudStatus?.lastError ? (
              <p className="error" style={{ marginTop: '0.5rem' }}>
                Last error ({new Date(cloudStatus.lastError.at).toLocaleString()}):{' '}
                {cloudStatus.lastError.message}
              </p>
            ) : null}
            <button
              type="button"
              className="btn primary"
              disabled={
                busy !== null ||
                cloudStatus?.running === true ||
                cloudStatus?.configured === false
              }
              onClick={() => void onCloudBackup()}
              style={{ marginTop: '0.75rem' }}
            >
              {busy === 'cloud' ? 'Backing up…' : 'Backup to cloud'}
            </button>
          </section>

          <section className="panel" style={{ marginTop: '1.25rem' }}>
            <h2>Restore backup</h2>
            <p className="error" style={{ marginBottom: '0.75rem' }}>
              Warning: This deletes all current store data and replaces it from the file. Cannot be undone.
              Everyone must sign in again afterward.
            </p>
            <form onSubmit={(e) => void onPreview(e)} style={{ marginBottom: '1rem' }}>
              <label>
                Backup file (.zip)
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(ev) => {
                    setFile(ev.target.files?.[0] ?? null)
                    setPreview(null)
                    setRestoreResult(null)
                  }}
                  disabled={busy !== null}
                />
              </label>
              <button type="submit" className="btn ghost" disabled={!file || busy !== null} style={{ marginTop: '0.5rem' }}>
                {busy === 'preview' ? 'Checking…' : 'Preview backup'}
              </button>
            </form>

            {preview ? (
              <div className="backup-preview">
                <p>
                  Exported: <strong>{new Date(preview.exportedAt).toLocaleString()}</strong>
                  {preview.includesPhotos ? ' · includes photos' : ' · no photos'}
                </p>
                <ul className="muted" style={{ columns: 2, margin: '0.5rem 0 1rem' }}>
                  {Object.entries(preview.counts).map(([k, n]) => (
                    <li key={k}>
                      {k}: <strong>{n}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <form onSubmit={(e) => void onRestore(e)}>
              <label>
                Type <code>RESTORE</code> to confirm
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  disabled={busy !== null || !preview}
                  placeholder="RESTORE"
                />
              </label>
              <button
                type="submit"
                className="btn danger"
                disabled={!file || !preview || confirmText !== 'RESTORE' || busy !== null}
                style={{ marginTop: '0.75rem' }}
              >
                {busy === 'restore' ? 'Restoring…' : 'Restore from backup'}
              </button>
            </form>

            {restoreResult ? (
              <p className="muted" style={{ marginTop: '1rem' }}>
                Restored {totalProducts ?? '—'} products. Refresh other Back Office tabs and re-login on POS
                tills.
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
