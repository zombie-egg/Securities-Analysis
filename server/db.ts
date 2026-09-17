// Postgres access and schema setup.
//
// One shared pool per process. The schema is created on first use so a fresh
// database (local or a newly provisioned server) works without a manual
// migration step.

// pg is CommonJS, so `import { Pool } from 'pg'` fails under Vite's SSR loader
import pg from 'pg'
import { UpstreamError } from './http.ts'

const { Pool } = pg
type Pool = pg.Pool

let pool: Pool | null = null
let ready: Promise<void> | null = null

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new UpstreamError(
      503,
      'MISSING_DATABASE',
      'DATABASE_URL is not configured on the server. Add it to .env.local and restart.'
    )
  }
  return url
}

/**
 * Whether to negotiate TLS. Local Postgres has no certificate, so SSL is off
 * for localhost unless explicitly requested; anything remote gets it by default.
 */
function needsSsl(): boolean {
  const explicit = process.env.DATABASE_SSL
  if (explicit === 'true') return true
  if (explicit === 'false') return false
  const url = process.env.DATABASE_URL ?? ''
  return !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profile fields, added after the table shipped, so guarded rather than inline.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
-- Stored as a data: URI, capped in the handler, so there is no file store to run
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- One row per tracked symbol, so a watchlist is per-user rather than per-browser
CREATE TABLE IF NOT EXISTS watchlist (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol  TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- Signup / login codes. Kept separate from users so an unverified address never
-- creates an account row.
CREATE TABLE IF NOT EXISTS email_codes (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

/** Lazily create the pool and ensure the schema exists. */
export async function db(): Promise<Pool> {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      // Managed Postgres (Supabase, Neon, RDS) requires TLS; a local server has
      // no certificate. Detect from the URL, overridable with DATABASE_SSL.
      ssl: needsSsl() ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30_000,
    })
    // A pool-level error would otherwise crash the process
    pool.on('error', () => {})
  }
  if (!ready) {
    ready = pool
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err: unknown) => {
        // Allow a later request to retry instead of caching the failure
        ready = null
        throw new UpstreamError(
          503,
          'DATABASE_ERROR',
          err instanceof Error ? err.message : 'Database setup failed.'
        )
      })
  }
  await ready
  return pool
}

/** Run a query, mapping driver errors to a client-safe shape. */
export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = await db()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } catch (err) {
    if (err instanceof UpstreamError) throw err
    throw new UpstreamError(
      503,
      'DATABASE_ERROR',
      err instanceof Error ? err.message : 'Database query failed.'
    )
  }
}

/** Remove expired sessions and codes. Cheap enough to run opportunistically. */
export async function sweep(): Promise<void> {
  try {
    await query('DELETE FROM sessions WHERE expires_at < now()')
    await query('DELETE FROM email_codes WHERE expires_at < now()')
  } catch {
    // Housekeeping only — never fail a request because a sweep failed
  }
}
