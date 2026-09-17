// Vercel serverless entry. Reuses the same handlers as the dev middleware.

import { handle, toErrorResponse } from '../server/handlers.ts'

export const config = { runtime: 'nodejs' }

export default async function route(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '')

  let body: unknown = null
  if (request.method === 'POST') {
    body = await request.json().catch(() => null)
  }

  let result
  try {
    result = await handle({
      path,
      query: url.searchParams,
      method: request.method,
      body,
      cookies: request.headers.get('cookie') ?? '',
    })
  } catch (err) {
    result = toErrorResponse(err)
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  if (result.setCookie) headers.set('Set-Cookie', result.setCookie)

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  })
}
