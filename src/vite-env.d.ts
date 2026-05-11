/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  electronPlatform?: NodeJS.Platform
  electronApp?: {
    quit: () => Promise<void>
    minimize: () => Promise<void>
  }
  ipcRenderer?: import('electron').IpcRenderer
  electronAuth?: {
    setBundle: (json: string) => Promise<{ ok: boolean; error?: string }>
    getBundle: () => Promise<string | null>
    clear: () => Promise<{ ok: boolean }>
  }
  electronBo?: {
    printProductLabel: (
      transport: unknown,
      label: unknown,
      opts?: {
        copies?: number
        layout?: { widthMm: number; heightMm: number; gapMm: number }
        presetId?: 'compactRetail' | 'priceFocus' | 'priceFocusSku' | 'barcodeFocus' | 'minimal'
        template?: {
          nameX: number
          nameY: number
          skuX: number
          skuY: number
          priceX: number
          priceY: number
          barcodeX: number
          barcodeY: number
          barcodeHeight: number
          barcodeTextX: number
          barcodeTextY: number
        }
      },
    ) => Promise<{ ok: boolean; error?: string }>
    printLabelFontTest: (
      transport: unknown,
      opts?: {
        copies?: number
        layout?: { widthMm: number; heightMm: number; gapMm: number }
      },
    ) => Promise<{ ok: boolean; error?: string }>
    detectLabelTransport: () => Promise<{
      ok: boolean
      transport?: { kind: 'usb'; path: string } | { kind: 'lan'; host: string; port: number }
      candidates: string[]
      error?: string
    }>
  }
}
