import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: (() => {
      const backend = process.env.VITE_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:4000'
      // when running inside docker compose, use service name
      const containerBackend = 'http://backend:4000'
      const target = (process.env.NODE_ENV === 'production') ? backend : (process.env.IN_DOCKER === '1' ? containerBackend : backend)
      return {
        '/api': target,
        '/files': target,
        '/editor': target
      }
    })()
  }
})
