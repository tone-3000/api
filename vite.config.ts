import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { lanBridgePlugin } from './vite-plugin-lan-bridge'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), lanBridgePlugin()],
  server: {
    // host: true binds to 0.0.0.0 so the LAN-flow demo's phone can reach the
    // /lan-callback middleware. Other demos still work via http://localhost.
    host: true,
    port: 3001,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})
