/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  resolve: {
    alias: {
      '@hostly/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Own service worker (src/sw/sw.ts) for push notifications; Workbox still precaches the app.
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hostly',
        short_name: 'Hostly',
        description: 'Reservations and table management',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks so app updates do not re-download libraries.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          data: ['@tanstack/react-query', 'zustand', 'socket.io-client'],
          i18n: ['i18next', 'react-i18next', 'luxon'],
          validation: ['zod', 'libphonenumber-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/socket.io': { target: apiTarget, ws: true, changeOrigin: false },
    },
  },
  test: { environment: 'node' },
});
