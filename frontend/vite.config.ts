import { existsSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function includeScienceData(): Plugin {
  let hasSyncedData = false

  return {
    name: 'include-science-data',
    apply: 'build',
    configResolved({ publicDir, build }) {
      hasSyncedData = build.copyPublicDir && !!publicDir && existsSync(resolve(publicDir, 'data/manifest.json'))
    },
    async writeBundle({ dir }) {
      if (!dir || hasSyncedData) return

      const dataDir = resolve(dir, 'data')
      await cp(new URL('../data/processed/', import.meta.url), dataDir, { recursive: true })
      await cp(new URL('../data/terrain/', import.meta.url), resolve(dataDir, 'terrain'), {
        recursive: true,
        filter: (source) => !source.endsWith('README.md'),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), includeScienceData()],
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
})
