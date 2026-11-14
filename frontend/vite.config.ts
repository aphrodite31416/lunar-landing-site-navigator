import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
})