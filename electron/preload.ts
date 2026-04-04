import { ipcRenderer, contextBridge } from 'electron'

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
