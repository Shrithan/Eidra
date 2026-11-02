import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@stations': decodeURIComponent(new URL('../shared/stations', import.meta.url).pathname) } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:2567',
      '/auth': 'http://localhost:2567',
      // the game rooms (world, stations, theatre) for anyone not on this machine, over the same address as the page
      '/colyseus': { target: 'http://localhost:2567', ws: true, rewrite: (path) => path.replace(/^\/colyseus/, '') },
    },
  },
})
