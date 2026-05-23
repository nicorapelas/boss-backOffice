import { useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { getShopAssistPairingUrl } from '../shopAssist/shopAssistPairingUrl'

export function ShopAssistPairingPanel() {
  const { url, warning } = useMemo(() => getShopAssistPairingUrl(), [])
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
      <section className="panel bo-shopassist-pairing" aria-labelledby="bo-shopassist-pairing-heading">
        <h2 id="bo-shopassist-pairing-heading" className="bo-settings-section-title">
          ShopAssist (mobile)
        </h2>
        <p className="error">Cannot show server URL — API URL is not configured on this build.</p>
      </section>
    )
  }

  return (
    <section className="panel bo-shopassist-pairing" aria-labelledby="bo-shopassist-pairing-heading">
      <h2 id="bo-shopassist-pairing-heading" className="bo-settings-section-title">
        ShopAssist (mobile)
      </h2>
      <p className="muted bo-settings-section-lead">
        Warehouse and floor staff: install <strong>ShopAssist</strong> (Expo), open <strong>Server</strong> on first
        launch, paste the API URL below (or scan the QR to copy on another device), then sign in with your Back Office
        account.
      </p>
      {warning ? <p className="error bo-shopassist-pairing-warning">{warning}</p> : null}
      <div className="bo-shopassist-pairing-body">
        <div className="bo-shopassist-pairing-qr" aria-hidden>
          <QRCode value={url} size={168} bgColor="#ffffff" fgColor="#0f1419" level="M" />
        </div>
        <div className="bo-shopassist-pairing-meta">
          <p className="muted bo-shopassist-pairing-label">Server API URL</p>
          <code className="bo-shopassist-pairing-url">{url}</code>
          <div className="form-actions bo-shopassist-pairing-actions">
            <button type="button" className="btn small" onClick={() => void copyUrl()}>
              {copied ? 'Copied' : 'Copy URL'}
            </button>
          </div>
          <p className="muted bo-shopassist-pairing-hint">
            Requires <code>catalog.read</code> to sign in; <code>catalog.write</code> to adjust stock and barcode.
            Managers can also edit name and price.
          </p>
        </div>
      </div>
    </section>
  )
}
