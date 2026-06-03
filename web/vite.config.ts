import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.VITE_DEV_PORT || 5173),
    hmr: {
      clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || process.env.VITE_DEV_PORT || 5173),
      protocol: (process.env.VITE_HMR_PROTOCOL as 'ws' | 'wss') || 'ws',
    },
    open: false,
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
      '/print': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
    },
  },
});
