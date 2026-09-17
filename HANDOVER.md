# 接手提示词 / Handover Prompt

把下面 `---` 之间的全部内容作为提示词交给 GPT。

---

## 项目背景

`/Users/zombie/Desktop/证券分析` — 美股情绪分析看板。React 18 + TypeScript + Vite 8 + Tailwind 3 + shadcn-ui。真实数据，无 mock。中英双语。

启动：`npm run dev`（http://localhost:5173）。本地 Postgres 16 已运行，库名 `sentiment_desk`，owner `zombie`。

### 硬性约束（必须遵守）

1. **绝不用假数据兜底。** 任何上游失败都显示明确错误状态 + 原因 + 重试按钮。禁止 mock/placeholder 回退。这是项目最重要的原则。
2. **只用现有 shadcn 组件**：`button` `card` `input` `label` `tabs`，以及 magicui `BorderBeam`。不要新增组件库，不要引入 Dialog/Dropdown/Avatar 等。需要弹层就用页面内状态切换（master-detail 模式，参考 `src/components/pages/news-page.tsx`）。
3. **颜色只用 theme token**（`bg-background` `text-muted-foreground` `text-chart-2` 等），禁止硬编码 hex。米白色主题定义在 `src/index.css` 的 `:root`。
4. **所有文字必须双语**，走 `src/lib/i18n.ts`。带插值的条目写成函数（如 `tracked: (count) => ...`），保证中英语序自然。
5. **密钥只在服务端。** `.env.local` 无 `VITE_` 前缀。禁止把任何 key 写进 `src/` 或客户端 bundle。
6. **改完必须验证**：`npm run build`（tsc + vite）和 `npm run lint` 都要过。已知可接受的遗留告警只有一条：`src/components/ui/button.tsx:56 only-export-components`。

### 架构

代理逻辑只写一份在 `server/handlers.ts`，由两处挂载：
- `server/vite-plugin.ts` — 本地 dev 中间件
- `api/[...path].ts` — Vercel serverless 入口

`server/` 目录：`handlers.ts`（路由）`http.ts`（UpstreamError + getJson）`cache.ts`（内存 TTL）`db.ts`（Postgres 池 + schema）`auth.ts`（账号）`mailer.ts`（QQ SMTP）`finnhub.ts` `yahoo.ts` `polymarket.ts` `deepseek.ts` `realtime.ts`（WebSocket 行情流）。

---

## 已完成并验证的部分（不要重写）

- **行情**：Finnhub REST 快照 + WebSocket 实时成交价覆盖。`server/realtime.ts` 持有一条共享 socket，价格存内存，`/api/quote` 合并。客户端 5 秒轮询不消耗 API 配额。`/api/health` 的 `streaming: true` 表示已连接。
- **新闻**：Finnhub company-news / general news，详情页可看大图完整摘要并跳转原文，有按需 DeepSeek 翻译按钮。
- **AI 分析**：DeepSeek `deepseek-flash`，返回双语结构化 JSON，引用真实新闻 index 可溯源。**已修 bug**：`max_tokens` 原为 900 导致中文回答被截断、JSON 解析失败（表现为随机的 "malformed JSON"）；现为 2400 并显式检测 `finish_reason === 'length'` 报 `TRUNCATED`。不要把这个值改小。
- **Polymarket**：`/public-search`（注意 `/markets?q=` 会静默忽略 q，不要用）。按 ticker 和公司名双查询合并去重。覆盖率天然参差，失败即空数组不阻断。
- **自选股编辑栏**：勾选框批量删除 + 单条删除。列表遍历 `symbols` 而非 `quotes`，所以行情失败的股票仍可见可删。
- **后端账号系统全部通路已验证**（见下方 API 清单）：注册/登录/登出/会话/按用户隔离的自选股，邮件验证码真实收发成功。scrypt 密码哈希，验证码存 sha256、10 分钟过期、5 次错误上限、60 秒重发冷却，登录失败信息不区分"邮箱不存在"和"密码错误"（防枚举）。
- **左侧栏已固定**（`sticky top-0 h-screen`），正文独立滚动，桌面端 TabsList 已隐藏（避免导航重复）。
- **配色**：暖米白（hue 40）。所有实际渲染的文字组合已算过 WCAG 对比度，全部 ≥4.5:1 过 AA。**改任何颜色后必须重算对比度**，浅底上的图表色极易掉到 4.5 以下。

### 已验证可用的凭据（都在 `.env.local`，已 git-ignore）

| 变量 | 状态 |
|---|---|
| `FINNHUB_API_KEY` | 40 位，REST 和 WebSocket 都通 |
| `DEEPSEEK_API_KEY` | 通，模型 `deepseek-flash`（不是 `deepseek-chat`） |
| `QQ_EMAIL` / `QQ_EMAIL_AUTH_CODE` | SMTP 465 实测发信成功 |
| `DATABASE_URL` | `postgres://zombie@localhost:5432/sentiment_desk`，4 张表已自动建好 |

`vite.config.ts` 里有一个 env 白名单数组，**新增任何环境变量都必须加进去**，否则服务端读不到（这个坑已经踩过一次）。

### 已验证的后端 API

```
GET  /api/quote?symbols=AAPL,NVDA     实时价格
GET  /api/search?q=AAPL               校验代码
GET  /api/news[?symbol=AAPL]          新闻
GET  /api/polymarket?q=NVDA           预测市场
POST /api/analyze  {symbols:[]}       AI 分析
POST /api/translate {id,headline,summary}
POST /api/auth/request-code {email}   发验证码（60s 冷却，已存在账号返回 409）
POST /api/auth/register {email,code,password}  → 设置 sd_session cookie
POST /api/auth/login {email,password}          → 设置 cookie
POST /api/auth/logout
GET  /api/auth/me                     → {user:null} 或 {user:{id,email}}
GET  /api/watchlist                   → {symbols:[]}，未登录 401
POST /api/watchlist {symbol:"AAPL"}   添加（会先校验代码真实存在，假代码 404）
POST /api/watchlist {remove:["AAPL"]} 批量删除
GET  /api/health                      各源状态
```

Cookie 名 `sd_session`，HttpOnly + SameSite=Lax + 生产环境 Secure，30 天。前端 fetch **必须带 `credentials: 'include'`**。

---

## 你要完成的工作

### 任务 1：账号系统前端（后端已就绪，只差 UI）

目前 `src/lib/api.ts` 里**完全没有 auth 相关函数**，`src/App.tsx` 也没有任何登录逻辑，自选股仍读写 `localStorage`（`src/lib/watchlist-store.ts`）。需要：

1. 在 `src/lib/api.ts` 增加：`fetchMe` `requestCode` `register` `login` `logout` `fetchWatchlist` `addSymbol` `removeSymbols`。所有请求带 `credentials: 'include'`。沿用现有 `ApiError` 和 `request()` 封装的风格。
2. 新建登录/注册页。**未登录时显示它，不显示看板。** 流程：输入邮箱 → 点击发送验证码 → 输入 6 位码 + 设置密码 → 注册成功自动登录。同页可切换到"已有账号，直接登录"（邮箱 + 密码）。
   - 参考用户提供的 sign-in 设计，但：**不要 Google 登录**（后端不支持）、**不要那三条虚构用户评价**（违反"不伪装数据"原则）、**不要紫色**（用米白主题的 token）。只做邮箱密码。
   - 60 秒重发冷却要有倒计时显示。验证码错误、过期、次数超限都要显示后端返回的具体 message。
3. 自选股改为**从 `/api/watchlist` 读写**，删除 `src/lib/watchlist-store.ts` 及其 localStorage 逻辑。每个账号管理自己的股票。

### 任务 2：侧边栏布局调整（用户新要求）

当前 `src/App.tsx` 中侧边栏结构：顶部是品牌区（`LineChart` 图标 + "Sentiment Desk"），底部 footer 是语言切换按钮。用户要求交换职责：

- **语言切换移到顶部品牌栏那一行**（截图中 "Sentiment Desk" 所在位置的右侧）。
- **底部原语言切换的位置改成账户区**：显示头像 + 昵称，点击进入账户信息页面。
- 账户页面需要：修改昵称、修改头像、退出登录。

### 任务 3：账户资料后端（部分已备好）

`server/db.ts` 的 schema 里**已经加好了** `users.display_name` 和 `users.avatar` 两列（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，重启后自动生效）。但还**没有**对应的路由和函数，需要补：

1. `server/auth.ts`：`userForToken` 目前只返回 `{id, email}`，要扩展为同时返回 `displayName` 和 `avatar`；新增 `updateProfile(userId, {displayName?, avatar?})`。
2. `server/handlers.ts`：新增 `POST /api/auth/profile`。
3. 头像存储：schema 注释里的设计是**存 data: URI 字符串**（避免引入文件存储服务）。必须在 handler 里限制大小（建议 ≤200KB 的 base64），并校验 MIME 只允许 image/png、image/jpeg、image/webp。超限返回明确错误。
4. 昵称：trim 后长度 1–32，允许中文。空则回退显示邮箱前缀。

### 任务 4（可选，用户已提及要部署服务器）

`api/[...path].ts` 这个 Vercel 入口**还没有加 cookie 支持**——`server/vite-plugin.ts` 已经传 `cookies` 并回写 `Set-Cookie`，但 Vercel 入口没有同步改。**不改的话线上登录会直接失效。** 需要读 `req.headers.cookie` 传入，并把 `result.setCookie` 写到响应头。

另外注意：`server/realtime.ts` 的 WebSocket 常驻连接**在 serverless 上不成立**（函数执行完即冻结）。部署到 Vercel 时实时行情会退化成 REST 快照（仍然可用，只是不再是秒级）。如果要保留实时能力，需要部署到常驻进程环境（Railway/Fly/VPS 等）。这一点如实告知用户，不要假装它能工作。

---

## 工作方式要求

- 改动前先读相关文件，遵循现有代码风格：注释密度、命名、双语 i18n 的函数式插值写法。
- 每完成一块就跑 `npm run build` 和 `npm run lint`。
- 涉及颜色改动要重算 WCAG 对比度。
- 如实报告：跑不通就说跑不通并给出输出，不要声称完成。
- 遇到设计取舍（比如头像上传方案）先说明再动手，不要静默扩大或缩小需求范围。

---
