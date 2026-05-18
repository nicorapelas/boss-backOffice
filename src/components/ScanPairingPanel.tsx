import { useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { getScanPairingUrl } from '../scan/scanPairingUrl'

export function ScanPairingPanel() {
  const { url, warning } = useMemo(() => getScanPairingUrl(), [])
  const [copied, setCopied] = useState(false)

  async function copyUrl() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (!url) {
    return (
      <section className="panel bo-scan-pairing" aria-labelledby="bo-scan-pairing-heading">
        <h2 id="bo-scan-pairing-heading" className="bo-settings-section-title">
          CogniPOS Scan (mobile)
        </h2>
        <p className="error">Cannot show pairing QR — API URL is not configured on this build.</p>
      </section>
    )
  }

  return (
    <section className="panel bo-scan-pairing" aria-labelledby="bo-scan-pairing-heading">
      <h2 id="bo-scan-pairing-heading" className="bo-settings-section-title">
        CogniPOS Scan (mobile)
      </h2>
      <p className="muted bo-settings-section-lead">
        Warehouse staff: open <strong>CogniPOS Scan</strong> on the same shop Wi‑Fi, scan this code on first setup, then
        sign in with your Back Office account.
      </p>
      {warning ? <p className="error bo-scan-pairing-warning">{warning}</p> : null}
      <div className="bo-scan-pairing-body">
        <div className="bo-scan-pairing-qr" aria-hidden>
          <QRCode value={url} size={168} bgColor="#ffffff" fgColor="#0f1419" level="M" />
        </div>
        <div className="bo-scan-pairing-meta">
          <p className="muted bo-scan-pairing-label">Server API URL</p>
          <code className="bo-scan-pairing-url">{url}</code>
          <div className="form-actions bo-scan-pairing-actions">
            <button type="button" className="btn small" onClick={() => void copyUrl()}>
              {copied ? 'Copied' : 'Copy URL'}
            </button>
          </div>
          <p className="muted bo-scan-pairing-hint">
            In Scan: first screen → paste or type this URL if you cannot scan. Requires <code>catalog.read</code> to
            sign in.
          </p>
        </div>
      </div>
    </section>
  )
}
