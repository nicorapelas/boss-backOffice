/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  ipcRenderer?: import('electron').IpcRenderer
  electronAuth?: {
    setBundle: (json: string) => Promise<{ ok: boolean; error?: string }>
    getBundle: () => Promise<string | null>
    clear: () => Promise<{ ok: boolean }>
  }
}
