import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronPlatform', process.platform)

contextBridge.exposeInMainWorld('electronApp', {
  quit: () => ipcRenderer.invoke('app:quit'),
  minimize: () => ipcRenderer.invoke('app:minimize'),
})

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...rest) => listener(event, ...rest))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('electronAuth', {
  setBundle: (json: string) => ipcRenderer.invoke('auth:set', json) as Promise<{ ok: boolean; error?: string }>,
  getBundle: () => ipcRenderer.invoke('auth:get') as Promise<string | null>,
  clear: () => ipcRenderer.invoke('auth:clear') as Promise<{ ok: boolean }>,
})

contextBridge.exposeInMainWorld('electronBo', {
  printProductLabel: (
    transport: unknown,
    label: unknown,
    opts?: {
      copies?: number
      layout?: { widthMm: number; heightMm: number; gapMm: number }
      /** Built-in preset only; omit when using a custom saved template. */
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
  ) =>
    ipcRenderer.invoke('bo:label:print', { transport, label, ...opts }) as Promise<{ ok: boolean; error?: string }>,
  printLabelFontTest: (
    transport: unknown,
    opts?: {
      copies?: number
      layout?: { widthMm: number; heightMm: number; gapMm: number }
    },
  ) =>
    ipcRenderer.invoke('bo:label:print-font-test', { transport, ...opts }) as Promise<{ ok: boolean; error?: string }>,
  detectLabelTransport: () =>
    ipcRenderer.invoke('bo:label:detect-transport') as Promise<{
      ok: boolean
      transport?: { kind: 'usb'; path: string } | { kind: 'lan'; host: string; port: number }
      candidates: string[]
      error?: string
    }>,
})
