import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export const LABEL_CONFIG_FILE = 'label-printers.json'

function labelConfigPath() {
  return path.join(app.getPath('userData'), LABEL_CONFIG_FILE)
}

function readLabelConfigFile(): string | null {
  const file = labelConfigPath()
  if (!fs.existsSync(file)) return null
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

export function registerLabelIpc() {
  ipcMain.on('label:getConfigSync', (event) => {
    event.returnValue = readLabelConfigFile()
  })

  ipcMain.handle('label:setConfig', async (_event, payload: string) => {
    if (typeof payload !== 'string') return { ok: false as const, error: 'invalid_payload' }
    try {
      JSON.parse(payload)
    } catch {
      return { ok: false as const, error: 'invalid_json' }
    }
    fs.writeFileSync(labelConfigPath(), payload, 'utf8')
    return { ok: true as const }
  })
}
