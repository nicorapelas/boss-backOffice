/** API base URL for ShopAssist mobile (same as this Back Office build). */
export function getShopAssistPairingUrl(): { url: string; warning: string | null } {
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
        'This install uses localhost — phones cannot reach that. Rebuild with your shop API URL (LAN IP or Cloudflare tunnel, e.g. https://api-dev.jacobscycles.com/api).',
    }
  }
  return { url: raw, warning: null }
}
