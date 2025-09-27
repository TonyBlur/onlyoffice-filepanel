import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.VITE_DEV_PORT || 3000),
    // Configure HMR client connection (browser-side). Set VITE_HMR_CLIENT_PORT to the
    // external port that browsers use to access the frontend (e.g. 8390). This prevents
    // Vite's HMR client from attempting to connect to the wrong hard-coded port.
    hmr: {
      clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || process.env.VITE_DEV_PORT || 3000),
      protocol: process.env.VITE_HMR_PROTOCOL || 'ws'
    },
    open: false,
    proxy: {
      // proxy to backend when developing locally
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:4000'
    }
  }
})
