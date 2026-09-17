// Production HTTP server for persistent hosts such as Zeabur, Railway, or a
// VPS. It serves the Vite build and mounts the exact same API handler used by
// local development and Vercel.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { handle, toErrorResponse } from './handlers.ts'

const PORT = Number(process.env.PORT || 8080)
const DIST = path.resolve(process.cwd(), 'dist')
const MAX_BODY_BYTES = 512 * 1024

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function setCommonHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.length
    if (length > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request body is too large.'), {
        status: 413,
        code: 'BODY_TOO_LARGE',
      })
    }
    chunks.push(buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), {
      status: 400,
      code: 'BAD_JSON',
    })
  }
}

async function serveApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  let body: unknown = null
  let result
  try {
    if (req.method === 'POST') body = await readJson(req)
    result = await handle({
      path: url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, ''),
      query: url.searchParams,
      method: req.method ?? 'GET',
      body,
      cookies: req.headers.cookie ?? '',
    })
  } catch (err) {
    if (
      err instanceof Error &&
      'status' in err &&
      'code' in err &&
      typeof err.status === 'number' &&
      typeof err.code === 'string'
    ) {
      result = {
        status: err.status,
        body: { error: err.code, message: err.message },
      }
    } else {
      result = toErrorResponse(err)
    }
  }

  res.statusCode = result.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (result.setCookie) res.setHeader('Set-Cookie', result.setCookie)
  res.end(JSON.stringify(result.body))
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.end('Method Not Allowed')
    return
  }

  const requested = path.resolve(DIST, `.${decodeURIComponent(url.pathname)}`)
  let file = requested.startsWith(`${DIST}${path.sep}`) ? requested : ''
  try {
    if (!file || !(await stat(file)).isFile()) file = path.join(DIST, 'index.html')
  } catch {
    file = path.join(DIST, 'index.html')
  }

  try {
    const content = await readFile(file)
    const extension = path.extname(file).toLowerCase()
    res.statusCode = 200
    res.setHeader('Content-Type', CONTENT_TYPES[extension] ?? 'application/octet-stream')
    res.setHeader(
      'Cache-Control',
      extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    )
    res.end(req.method === 'HEAD' ? undefined : content)
  } catch {
    res.statusCode = 503
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Application build is unavailable.')
  }
}

const server = createServer(async (req, res) => {
  setCommonHeaders(res)
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await serveApi(req, res, url)
    } else {
      await serveStatic(req, res, url)
    }
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Unexpected server error.',
      })
    )
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sentiment Desk listening on port ${PORT}`)
})
