import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import { apiDevPlugin } from './server/vite-plugin.ts'

export default defineConfig(({ mode }) => {
  // Load .env files into process.env for the server-side API handlers.
  // Passing '' as the prefix loads every var, including the unprefixed secrets;
  // they stay server-side because they are never referenced via import.meta.env.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of [
    'FINNHUB_API_KEY',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_MODEL',
    'DATABASE_URL',
    'DATABASE_SSL',
    'SESSION_SECRET',
    'QQ_EMAIL',
    'QQ_EMAIL_AUTH_CODE',
  ]) {
    if (env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [react(), apiDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
