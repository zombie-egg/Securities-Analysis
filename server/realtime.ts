// Live trade stream from Finnhub's WebSocket.
//
// The API key must stay server-side, so the browser cannot open this socket
// itself. Instead the server holds one shared connection, keeps the latest
// trade price per symbol in memory, and /api/quote merges those prices over the
// REST snapshot. Clients then poll quickly without spending REST quota — the
// socket pushes, polling just reads memory.
//
// Falls back silently to REST-only values if the socket cannot connect, so a
// blocked or unavailable socket degrades to the previous 30s behaviour rather
// than breaking quotes.

interface LivePrice {
  price: number
  /** Exchange timestamp of the trade, in ms. */
  at: number
}

const live = new Map<string, LivePrice>()

/** Symbols we have asked the socket for, so reconnects can re-subscribe. */
const subscribed = new Set<string>()

let socket: WebSocket | null = null
let connecting = false
let reconnectDelay = 1_000
let disabled = false

interface TradeMessage {
  type?: string
  data?: { s?: string; p?: number; t?: number }[]
}

function handleMessage(raw: string) {
  let parsed: TradeMessage
  try {
    parsed = JSON.parse(raw) as TradeMessage
  } catch {
    return
  }
  if (parsed.type !== 'trade' || !Array.isArray(parsed.data)) return

  for (const trade of parsed.data) {
    if (!trade.s || typeof trade.p !== 'number') continue
    const at = typeof trade.t === 'number' ? trade.t : Date.now()
    const current = live.get(trade.s)
    // Trades can arrive slightly out of order; keep the newest
    if (!current || at >= current.at) {
      live.set(trade.s, { price: trade.p, at })
    }
  }
}

function send(payload: unknown) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(payload))
}

function connect() {
  const key = process.env.FINNHUB_API_KEY
  if (!key || disabled || connecting || socket) return
  connecting = true

  let next: WebSocket
  try {
    next = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(key)}`)
  } catch {
    connecting = false
    disabled = true
    return
  }

  next.addEventListener('open', () => {
    connecting = false
    socket = next
    reconnectDelay = 1_000
    for (const symbol of subscribed) {
      send({ type: 'subscribe', symbol })
    }
  })

  next.addEventListener('message', (event: MessageEvent) => {
    if (typeof event.data === 'string') handleMessage(event.data)
  })

  next.addEventListener('error', () => {
    // 'close' always follows, which is where reconnect is scheduled
  })

  next.addEventListener('close', () => {
    connecting = false
    socket = null
    // Back off to avoid hammering a socket that keeps refusing us
    const delay = reconnectDelay
    reconnectDelay = Math.min(delay * 2, 60_000)
    const timer = setTimeout(connect, delay)
    // Never hold the process open just for a reconnect
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
  })
}

/**
 * Ensure these symbols are streaming, and return whichever live prices we
 * already hold. Safe to call on every request.
 */
export function track(symbols: string[]): Map<string, LivePrice> {
  if (!process.env.FINNHUB_API_KEY || disabled) return new Map()

  connect()
  for (const symbol of symbols) {
    if (!subscribed.has(symbol)) {
      subscribed.add(symbol)
      send({ type: 'subscribe', symbol })
    }
  }
  return live
}

/** Whether the stream is currently connected, for /api/health. */
export function streaming(): boolean {
  return socket?.readyState === 1
}
