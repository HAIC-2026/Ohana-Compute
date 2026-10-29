import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'

const config = defineConfig({
  server: {
    proxy: {
      '/api/v1/staff': {
        target: process.env.STAFF_PROXY_TARGET || 'http://127.0.0.1:8080',
      },
      '/api/v1/operations': {
        target: process.env.STAFF_PROXY_TARGET || 'http://127.0.0.1:8080',
      },
    },
  },
  preview: {
    proxy: {
      '/api/v1/staff': {
        target: process.env.STAFF_PROXY_TARGET || 'http://127.0.0.1:8080',
      },
      '/api/v1/operations': {
        target: process.env.STAFF_PROXY_TARGET || 'http://127.0.0.1:8080',
      },
    },
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart(),
    viteReact(),
    {
      name: 'public-offline-assets',
      generateBundle(_options, bundle) {
        if (this.environment.name !== 'client') return
        const files = Object.keys(bundle)
          .filter(
            (name) => name.startsWith('assets/') && !name.endsWith('.map'),
          )
          .sort()
        const version = createHash('sha256')
          .update(files.join('\n'))
          .digest('hex')
          .slice(0, 12)
        this.emitFile({
          type: 'asset',
          fileName: 'offline-assets.json',
          source: JSON.stringify(files.map((name) => `/${name}`)),
        })
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: readFileSync(
            new URL('./public/sw.js', import.meta.url),
            'utf8',
          ).replace("'hmcp-shell-v1'", `'hmcp-shell-${version}'`),
        })
      },
    },
  ],
})

export default config
