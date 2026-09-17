// Mounts the /api handlers onto Vite's dev server so `npm run dev` serves the
// same routes as production, with the keys read from .env.local server-side.

import type { Plugin } from 'vite'

export function apiDevPlugin(): Plugin {
  return {
    name: 'sentiment-desk-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        // Imported lazily so edits to server/* hot-reload without a restart
        const { handle, toErrorResponse } = await server.ssrLoadModule(
          '/server/handlers.ts'
        )

        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname.replace(/^\/+|\/+$/g, '')

        let body: unknown = null
        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const raw = Buffer.concat(chunks).toString('utf8')
          try {
            body = raw ? JSON.parse(raw) : null
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({ error: 'BAD_JSON', message: 'Invalid JSON body.' })
            )
            return
          }
        }

        let result
        try {
          result = await handle({
            path,
            query: url.searchParams,
            method: req.method ?? 'GET',
            body,
            cookies: req.headers.cookie ?? '',
          })
        } catch (err) {
          result = toErrorResponse(err)
        }

        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        // Session cookie, set on login/register and cleared on logout
        if (result.setCookie) res.setHeader('Set-Cookie', result.setCookie)
        res.end(JSON.stringify(result.body))
      })
    },
  }
}
