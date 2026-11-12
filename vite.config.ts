import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// The seal's teal (the default world in src/design/tokens.css).
const TEAL = '#00394a'

/** `vite preview` answers with what public/_headers says, so that e2e runs under the policy the site runs under. */
function assetHeaders(): Record<string, string> {
  const text = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8')
  return Object.fromEntries([...text.matchAll(/^\s+([\w-]+):\s*(.+?)\s*$/gm)].map((m) => [m[1]!, m[2]!]))
}

export default defineConfig({
  preview: { headers: assetHeaders() },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      // Behind Access the manifest request must carry credentials.
      useCredentials: true,
      injectRegister: false,
      manifest: {
        name: 'Orden de lectura del Cosmere',
        short_name: 'Orden Cosmere',
        description: 'Orden de lectura del Cosmere. Web de fans no oficial, sin relación con Dragonsteel.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: TEAL,
        theme_color: TEAL,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,json,png}'],
        // The sign-in flow has to reach the network. Access only sees a navigation that does (the link, SIGN_IN_HREF),
        // and it comes back through /cdn-cgi/access/authorized, whose answer is what sets the cookie.
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//, /[?&]signin=/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: 'es2022' },
})
