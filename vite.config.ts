import path from 'node:path'
import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import electron from 'vite-plugin-electron/simple'
import type { Plugin } from 'vite'

function copyLabelFontsPlugin(): Plugin {
  return {
    name: 'copy-label-fonts',
    closeBundle() {
      const src = path.resolve(__dirname, 'electron/assets/fonts')
      const dest = path.resolve(__dirname, 'dist-electron/assets/fonts')
      if (!fs.existsSync(src)) return
      fs.mkdirSync(dest, { recursive: true })
      for (const name of fs.readdirSync(src)) {
        if (!name.toUpperCase().endsWith('.TTF')) continue
        fs.copyFileSync(path.join(src, name), path.join(dest, name))
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE_URL || 'http://localhost:4000/api'
  const intakeUrl = env.VITE_INVOICE_INTAKE_URL || ''
  const intakeKey = env.VITE_INVOICE_INTAKE_API_KEY || ''

  return {
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBase),
      'import.meta.env.VITE_INVOICE_INTAKE_URL': JSON.stringify(intakeUrl),
      'import.meta.env.VITE_INVOICE_INTAKE_API_KEY': JSON.stringify(intakeKey),
    },
    optimizeDeps: {
      include: ['@vladmandic/face-api'],
      esbuildOptions: {
        target: 'es2020',
      },
    },
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            build: {
              rollupOptions: {
                plugins: [copyLabelFontsPlugin()],
              },
            },
          },
        },
        preload: {
          input: path.join(__dirname, 'electron/preload.ts'),
        },
        renderer: process.env.NODE_ENV === 'test' ? undefined : {},
      }),
    ],
  }
})
