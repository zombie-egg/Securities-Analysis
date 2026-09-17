# Sentiment Desk

US stock sentiment dashboard driven by real market data, real news, and AI
analysis. Bilingual (English / 简体中文).

- **Live quotes** — Finnhub REST snapshots with a shared WebSocket trade stream;
  clients poll the server-side in-memory price every 5 seconds
- **Real news** — clickable stories with summary, image, related tickers, and a
  link to the publisher's full article
- **AI analysis** — DeepSeek reads the actual headlines and Polymarket odds for
  your watchlist and returns a bilingual verdict with its sources cited
- **Accounts** — email verification, scrypt password hashing, HttpOnly sessions,
  and editable display names/avatars
- **Watchlist** — stored per account in PostgreSQL; tickers are verified against
  live market data before they can be added

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
DEEPSEEK_API_KEY=your_key     # https://platform.deepseek.com — needed for AI analysis
DEEPSEEK_MODEL=deepseek-flash
FINNHUB_API_KEY=your_key      # https://finnhub.io/register — quotes, stream, news, search
DATABASE_URL=postgres://user:password@host:5432/sentiment_desk
DATABASE_SSL=true             # false for a local PostgreSQL server
QQ_EMAIL=your-address@qq.com
QQ_EMAIL_AUTH_CODE=your-qq-smtp-authorization-code
```

```bash
npm run dev     # http://localhost:5173
```

Without a Finnhub key, quotes can use Yahoo Finance's keyless chart endpoint.
Production should set `FINNHUB_API_KEY` so quotes, news, symbol search, and the
shared real-time stream all use the documented Finnhub APIs. `/api/health`
reports the configured services and active quote source.

News requires `FINNHUB_API_KEY`. Without it, the news feed and the news half of
the AI analysis say so explicitly; analysis still runs on prediction-market odds
and price data alone, at correspondingly lower confidence. No panel ever falls
back to fake data.

## Why there is a server

API keys cannot be kept secret in frontend JavaScript. Anything in the browser
bundle is readable by anyone who opens devtools. So all upstream calls go through
a small proxy:

```
browser  →  /api/*  →  Finnhub / DeepSeek / Polymarket
                       (keys live here, server-side only)
```

The proxy logic lives once in `server/handlers.ts`, mounted three ways:

- **Dev** — a Vite middleware plugin (`server/vite-plugin.ts`)
- **Persistent production host** — Node HTTP server (`server/index.ts`), which
  also serves the compiled Vite app and keeps the Finnhub WebSocket alive
- **Prod** — a serverless function (`api/[...path].ts`, Vercel-compatible)

Both import the same handlers, so local and deployed behavior match. The proxy
also holds a shared TTL cache, which is what keeps usage inside Finnhub's free
tier of 60 requests/minute.

Env vars deliberately have **no** `VITE_` prefix, so Vite cannot inline them into
client code. Verify with `grep -r 'sk-' dist/` after a build.

## Endpoints

| Route | Upstream | Cache |
|---|---|---|
| `GET /api/quote?symbols=AAPL,NVDA` | Yahoo chart, or Finnhub `/quote` with a key | 15s |
| `GET /api/search?q=AAPL` | same source as quotes | 1h |
| `GET /api/news[?symbol=AAPL]` | Finnhub company/general news | 60s |
| `GET /api/polymarket?q=NVDA` | Polymarket Gamma | 60s |
| `POST /api/analyze` | DeepSeek | 10min |
| `POST /api/translate` | DeepSeek | 24h |
| `POST /api/auth/request-code` | QQ SMTP + PostgreSQL | — |
| `POST /api/auth/register` | PostgreSQL | — |
| `POST /api/auth/login` | PostgreSQL | — |
| `POST /api/auth/logout` | PostgreSQL | — |
| `GET /api/auth/me` | PostgreSQL | — |
| `POST /api/auth/profile` | PostgreSQL | — |
| `GET/POST /api/watchlist` | PostgreSQL | — |
| `GET /api/health` | — | — |

`/api/health` reports which keys are configured, which quote source is active,
and whether Polymarket is reachable. Useful first stop when something looks
empty.

## Known limitations

**News full text is not available.** Finnhub returns a headline, summary, and a
link — not licensed article bodies. Republishing full text would be a copyright
problem, and most publishers set `X-Frame-Options`, so embedding is not possible
either. The detail view shows everything the API provides and links out for the
rest.

**Coverage of prediction markets is uneven.** Few Polymarket markets map cleanly
to individual US equities, so this field is often empty for smaller names — and
which query finds them is inconsistent, so each symbol is searched by both ticker
and company name. Where a matched market is only loosely related, the model is
instructed to say so rather than stretch the connection. Any Polymarket failure
is treated as optional enrichment: the field reads "no related market found" and
the analysis proceeds without it.

**The default quote source is undocumented.** Yahoo's chart endpoint needs no
key, but it is not a supported public API: it requires a browser User-Agent,
allows only one symbol per request, and could change without notice. It is here
so the app works before you register for anything. For anything you depend on,
set `FINNHUB_API_KEY` and quotes move to a documented, rate-limited API.

**Ticker validation is exact-match without a Finnhub key.** Yahoo has no search
endpoint, so `/api/search` confirms whether a ticker exists rather than
suggesting completions from a partial name. With a Finnhub key you get real
search.

## Scripts

```bash
npm run dev       # dev server + API middleware
npm run build     # typecheck and bundle
npm start         # production static app + API server (requires npm run build)
npm run preview   # serve the built bundle (no API — use dev or deploy)
npm run lint      # oxlint
```

Note that `npm run preview` serves static files only; the `/api` routes need
either `npm run dev` or a real deployment.

## Structure

```
server/            proxy: cache, upstream adapters, route handlers
server/index.ts    persistent production HTTP server
api/[...path].ts   serverless entry (production)
src/lib/           API client, i18n, hooks
src/components/ui/ shadcn components (unmodified)
src/components/pages/
```

Not a trading system. Analysis output is not investment advice.
