// QQ Mail SMTP over implicit TLS (port 465), spoken directly.
//
// Written against the socket rather than pulling in nodemailer: the only thing
// needed is AUTH LOGIN plus one message, and a mail library is a large
// dependency for that. QQ requires the account's *authorization code* (from
// Settings → Account → SMTP), not the mailbox password.

import { connect as tlsConnect, type TLSSocket } from 'node:tls'

import { requireEnv, UpstreamError } from './http.ts'

const HOST = 'smtp.qq.com'
const PORT = 465
const TIMEOUT_MS = 20_000

/** One SMTP conversation, reading replies line-by-line. */
class SmtpSession {
  private socket: TLSSocket
  private buffer = ''
  private waiting: {
    resolve: (reply: string) => void
    reject: (err: Error) => void
  } | null = null

  constructor(socket: TLSSocket) {
    this.socket = socket
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => this.onData(chunk))
    socket.on('error', (err) => this.fail(err))
    socket.on('close', () => this.fail(new Error('SMTP connection closed.')))
  }

  private onData(chunk: string) {
    this.buffer += chunk
    // A reply is complete when a line starts with "NNN " rather than "NNN-"
    const match = /^\d{3} [^\n]*\n/m.exec(this.buffer)
    if (!match) return
    const end = this.buffer.indexOf(match[0]) + match[0].length
    const reply = this.buffer.slice(0, end)
    this.buffer = this.buffer.slice(end)
    const pending = this.waiting
    this.waiting = null
    pending?.resolve(reply)
  }

  private fail(err: Error) {
    const pending = this.waiting
    this.waiting = null
    pending?.reject(err)
  }

  /** Send a line (or nothing) and await the server's reply. */
  private exchange(line?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject }
      if (line !== undefined) this.socket.write(line + '\r\n')
    })
  }

  /** Send a command and require a reply in the expected 2xx/3xx range. */
  async command(line: string | undefined, expect: number): Promise<string> {
    const reply = await this.exchange(line)
    const code = Number(reply.slice(0, 3))
    if (Math.floor(code / 100) !== Math.floor(expect / 100)) {
      // Never echo the command back — it may contain a credential
      throw new Error(`SMTP expected ${expect}, got: ${reply.trim()}`)
    }
    return reply
  }

  end() {
    this.socket.removeAllListeners()
    this.socket.destroy()
  }
}

/** RFC 2047 encoding, so a non-ASCII subject survives transit. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/** Dots at the start of a line terminate the DATA section, so escape them. */
function escapeBody(body: string): string {
  return body.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..')
}

/** Send one verification code. Throws UpstreamError if mail cannot be sent. */
export async function sendCode(to: string, code: string): Promise<void> {
  const from = requireEnv('QQ_EMAIL')
  const authCode = requireEnv('QQ_EMAIL_AUTH_CODE')

  let session: SmtpSession | null = null
  try {
    const socket = await new Promise<TLSSocket>((resolve, reject) => {
      const s = tlsConnect(
        { host: HOST, port: PORT, servername: HOST },
        () => resolve(s)
      )
      s.setTimeout(TIMEOUT_MS, () =>
        reject(new Error('SMTP connection timed out.'))
      )
      s.once('error', reject)
    })

    session = new SmtpSession(socket)
    await session.command(undefined, 220) // greeting
    await session.command('EHLO sentiment-desk', 250)
    await session.command('AUTH LOGIN', 334)
    await session.command(Buffer.from(from).toString('base64'), 334)
    await session.command(Buffer.from(authCode).toString('base64'), 235)
    await session.command(`MAIL FROM:<${from}>`, 250)
    await session.command(`RCPT TO:<${to}>`, 250)
    await session.command('DATA', 354)

    const subject = encodeHeader(`验证码 ${code} — Sentiment Desk`)
    const text =
      `您的验证码是 ${code}\n\n` +
      `10 分钟内有效。如果这不是您本人的操作，请忽略此邮件。\n\n` +
      `Your verification code is ${code}. It expires in 10 minutes.\n`

    const message = [
      `From: Sentiment Desk <${from}>`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      `Date: ${new Date().toUTCString()}`,
      '',
      text,
    ].join('\r\n')

    await session.command(`${escapeBody(message)}\r\n.`, 250)
    await session.command('QUIT', 221).catch(() => {})
  } catch (err) {
    throw new UpstreamError(
      502,
      'MAIL_FAILED',
      err instanceof Error
        ? `Could not send the verification email: ${err.message}`
        : 'Could not send the verification email.'
    )
  } finally {
    session?.end()
  }
}
