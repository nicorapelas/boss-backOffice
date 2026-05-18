/** API base URL encoded in the CogniPOS Scan pairing QR (same as this Back Office build). */
export function getScanPairingUrl(): { url: string; warning: string | null } {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') ?? ''
  if (!raw) {
    return {
      url: '',
      warning: 'VITE_API_BASE_URL is not set for this Back Office build.',
    }
  }
  if (/localhost|127\.0\.0\.1/i.test(raw)) {
    return {
      url: raw,
      warning:
        'This install uses localhost — phones on Wi‑Fi cannot reach that. Rebuild Back Office with Steve’s LAN IP (e.g. http://192.168.1.10:4000/api).',
    }
  }
  return { url: raw, warning: null }
}
