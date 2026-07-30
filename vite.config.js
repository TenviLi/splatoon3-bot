import { resolve } from 'path'
import { fileURLToPath, URL } from 'url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueI18n from '@intlify/unplugin-vue-i18n/vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const dataDirectory = process.env.SPLATOON_DATA_DIRECTORY
  ? resolve(rootDir, process.env.SPLATOON_DATA_DIRECTORY)
  : resolve(rootDir, 'data')
const publicDirectory = process.env.SPLATOON_PUBLIC_DIRECTORY
  ? resolve(rootDir, process.env.SPLATOON_PUBLIC_DIRECTORY)
  : resolve(rootDir, 'public')

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: publicDirectory,
  plugins: [
    vue(),
    vueI18n({
      include: resolve(rootDir, './src/assets/i18n/**'),
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@data': dataDirectory,
    },
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        screenshots: resolve(rootDir, 'screenshots.html'),
      },
    },
  },
})
