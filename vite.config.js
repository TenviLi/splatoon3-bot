import { resolve } from 'path'
import { fileURLToPath, URL } from 'url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueI18n from '@intlify/unplugin-vue-i18n/vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// const redirectToDist = ['/assets/splatnet/', '/data/']
const redirectToDist = ['/assets/splatnet/']

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueI18n({
      include: resolve(rootDir, './src/assets/i18n/**'),
    }),
    {
      // Quick hack to redirect dynamic assets to the /dist/ directory
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (redirectToDist.some((s) => req.url.startsWith(s))) {
            req.url = '/dist' + req.url
          }

          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@data': fileURLToPath(new URL('./data', import.meta.url)),
    },
  },
  build: {
    emptyOutDir: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        screenshots: resolve(rootDir, 'screenshots.html'),
      },
    },
  },
})
