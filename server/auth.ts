// Email + password accounts, with a verification code sent over SMTP.
//
// Password hashing uses Node's built-in scrypt rather than an external
// dependency. Tokens and codes come from crypto.randomBytes, never Math.random.
// Verification codes are stored hashed, so a database read cannot reveal a code
// that is still valid.

import {
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  createHash,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

import { query, sweep } from './db.ts'
import { UpstreamError } from './http.ts'
import { sendCode } from './mailer.ts'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>

const SESSION_DAYS = 30
const CODE_TTL_MS = 10 * 60_000
const RESEND_COOLDOWN_MS = 60_000
const MAX_CODE_ATTEMPTS = 5

export interface User {
  id: string
  email: string
  displayName: string | null
  avatar: string | null
}

interface UserRow extends Record<string, unknown> {
  id: string
  email: string
  password_hash: string
  display_name: string | null
  avatar: string | null
}

function publicUser(row: Pick<UserRow, 'id' | 'email' | 'display_name' | 'avatar'>): User {
  return {
    id: String(row.id),
    email: row.email,
    displayName: row.display_name,
    avatar: row.avatar,
  }
}

/** scrypt hash, stored as salt:hash so the salt travels with the password. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `${salt}:${derived.toString('hex')}`
}

/** Constant-time password check. */
async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false
  const derived = await scrypt(password, salt, 64)
  const expectedBuf = Buffer.from(expected, 'hex')
  if (expectedBuf.length !== derived.length) return false
  return timingSafeEqual(derived, expectedBuf)
}

/** Codes are short, so they are hashed rather than stored in the clear. */
function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}`).digest('hex')
}

function normalizeEmail(raw: unknown): string {
  const email = String(raw ?? '')
    .trim()
    .toLowerCase()
  // Deliberately simple: the verification code is the real proof of ownership
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    throw new UpstreamError(400, 'BAD_EMAIL', 'Enter a valid email address.')
  }
  return email
}

function checkPassword(raw: unknown): string {
  const password = String(raw ?? '')
  if (password.length < 8) {
    throw new UpstreamError(
      400,
      'WEAK_PASSWORD',
      'Password must be at least 8 characters.'
    )
  }
  if (password.length > 200) {
    throw new UpstreamError(400, 'WEAK_PASSWORD', 'Password is too long.')
  }
  return password
}

/**
 * Send a verification code to an address that has no account yet.
 * Rate-limited per address so the mailbox cannot be flooded.
 */
export async function requestCode(rawEmail: unknown): Promise<{ sent: true }> {
  const email = normalizeEmail(rawEmail)
  await sweep()

  const existing = await query<UserRow>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  )
  if (existing.length > 0) {
    throw new UpstreamError(
      409,
      'EMAIL_TAKEN',
      'An account already exists for this address. Sign in instead.'
    )
  }

  const prior = await query<{ sent_at: Date }>(
    'SELECT sent_at FROM email_codes WHERE email = $1',
    [email]
  )
  if (prior.length > 0) {
    const elapsed = Date.now() - new Date(prior[0].sent_at).getTime()
    if (elapsed < RESEND_COOLDOWN_MS) {
      throw new UpstreamError(
        429,
        'TOO_SOON',
        `Wait ${Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)}s before requesting another code.`
      )
    }
  }

  // 6 digits, uniformly random, zero-padded
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expires = new Date(Date.now() + CODE_TTL_MS)

  await query(
    `INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at)
     VALUES ($1, $2, $3, 0, now())
     ON CONFLICT (email) DO UPDATE
       SET code_hash = $2, expires_at = $3, attempts = 0, sent_at = now()`,
    [email, hashCode(email, code), expires]
  )

  // Send after storing, so a mail failure cannot leave a code the user has but
  // the database does not.
  await sendCode(email, code)
  return { sent: true }
}

/** Create the account once the emailed code checks out. */
export async function register(
  rawEmail: unknown,
  rawCode: unknown,
  rawPassword: unknown
): Promise<{ user: User; token: string }> {
  const email = normalizeEmail(rawEmail)
  const password = checkPassword(rawPassword)
  const code = String(rawCode ?? '').trim()

  const rows = await query<{
    code_hash: string
    expires_at: Date
    attempts: number
  }>(
    'SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = $1',
    [email]
  )
  if (rows.length === 0) {
    throw new UpstreamError(
      400,
      'NO_CODE',
      'Request a verification code first.'
    )
  }
  const record = rows[0]

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await query('DELETE FROM email_codes WHERE email = $1', [email])
    throw new UpstreamError(400, 'CODE_EXPIRED', 'That code has expired.')
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await query('DELETE FROM email_codes WHERE email = $1', [email])
    throw new UpstreamError(
      429,
      'TOO_MANY_ATTEMPTS',
      'Too many incorrect attempts. Request a new code.'
    )
  }

  const supplied = Buffer.from(hashCode(email, code), 'hex')
  const stored = Buffer.from(record.code_hash, 'hex')
  const matches =
    supplied.length === stored.length && timingSafeEqual(supplied, stored)

  if (!matches) {
    await query(
      'UPDATE email_codes SET attempts = attempts + 1 WHERE email = $1',
      [email]
    )
    throw new UpstreamError(400, 'BAD_CODE', 'That code is not correct.')
  }

  const passwordHash = await hashPassword(password)
  let created: UserRow[]
  try {
    created = await query<UserRow>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email, password_hash, display_name, avatar`,
      [email, passwordHash]
    )
  } catch (err) {
    // Unique violation: two registrations raced for the same address
    if (err instanceof UpstreamError && /duplicate key/i.test(err.message)) {
      throw new UpstreamError(
        409,
        'EMAIL_TAKEN',
        'An account already exists for this address.'
      )
    }
    throw err
  }

  await query('DELETE FROM email_codes WHERE email = $1', [email])

  const user = publicUser(created[0])
  return { user, token: await createSession(user.id) }
}

/** Verify credentials and open a session. */
export async function login(
  rawEmail: unknown,
  rawPassword: unknown
): Promise<{ user: User; token: string }> {
  const email = normalizeEmail(rawEmail)
  const password = String(rawPassword ?? '')

  const rows = await query<UserRow>(
    `SELECT id, email, password_hash, display_name, avatar
       FROM users WHERE email = $1`,
    [email]
  )
  // Same message either way, so this cannot be used to enumerate addresses
  const invalid = new UpstreamError(
    401,
    'BAD_CREDENTIALS',
    'Email or password is incorrect.'
  )
  if (rows.length === 0) throw invalid
  if (!(await verifyPassword(password, rows[0].password_hash))) throw invalid

  const user = publicUser(rows[0])
  return { user, token: await createSession(user.id) }
}

async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, expires]
  )
  return token
}

/** Resolve a session token to its user, or null if absent or expired. */
export async function userForToken(
  token: string | null
): Promise<User | null> {
  if (!token) return null
  const rows = await query<UserRow>(
    `SELECT u.id, u.email, u.password_hash, u.display_name, u.avatar
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  )
  return rows.length > 0 ? publicUser(rows[0]) : null
}

/** Update only the supplied profile fields and return the public user shape. */
export async function updateProfile(
  userId: string,
  profile: { displayName?: unknown; avatar?: string | null }
): Promise<User> {
  let displayName: string | null | undefined
  if (profile.displayName !== undefined) {
    const trimmed = String(profile.displayName).trim()
    if (trimmed && Array.from(trimmed).length > 32) {
      throw new UpstreamError(
        400,
        'BAD_DISPLAY_NAME',
        'Display name must be 32 characters or fewer.'
      )
    }
    displayName = trimmed || null
  }

  const rows = await query<UserRow>(
    `UPDATE users
        SET display_name = CASE WHEN $5 THEN $2 ELSE display_name END,
            avatar = CASE WHEN $4 THEN $3 ELSE avatar END
      WHERE id = $1
      RETURNING id, email, password_hash, display_name, avatar`,
    [
      userId,
      displayName,
      profile.avatar ?? null,
      profile.avatar !== undefined,
      profile.displayName !== undefined,
    ]
  )
  if (rows.length === 0) {
    throw new UpstreamError(404, 'USER_NOT_FOUND', 'Account not found.')
  }
  return publicUser(rows[0])
}

export async function logout(token: string | null): Promise<void> {
  if (token) await query('DELETE FROM sessions WHERE token = $1', [token])
}

/** The signed-in user's watchlist, oldest first. */
export async function getWatchlist(userId: string): Promise<string[]> {
  const rows = await query<{ symbol: string }>(
    'SELECT symbol FROM watchlist WHERE user_id = $1 ORDER BY added_at, symbol',
    [userId]
  )
  return rows.map((r) => r.symbol)
}

export async function addToWatchlist(
  userId: string,
  symbol: string
): Promise<string[]> {
  await query(
    `INSERT INTO watchlist (user_id, symbol) VALUES ($1, $2)
     ON CONFLICT (user_id, symbol) DO NOTHING`,
    [userId, symbol]
  )
  return getWatchlist(userId)
}

export async function removeFromWatchlist(
  userId: string,
  symbols: string[]
): Promise<string[]> {
  if (symbols.length > 0) {
    await query('DELETE FROM watchlist WHERE user_id = $1 AND symbol = ANY($2)', [
      userId,
      symbols,
    ])
  }
  return getWatchlist(userId)
}
