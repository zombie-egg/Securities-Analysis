// Bilingual (English / Simplified Chinese) UI string dictionary.
// Only UI chrome lives here. Live market content arrives from the API.

export type Locale = 'en' | 'zh'

export interface Dict {
  // Shell
  brand: string
  languageSwitchTo: string
  navWatchlist: string
  navFocus: string
  navNews: string
  subtitleWatchlist: string
  subtitleFocus: string
  subtitleNews: string
  navAccount: string
  subtitleAccount: string

  // Authentication
  authWelcome: string
  authDescription: string
  signIn: string
  signingIn: string
  createAccount: string
  creatingAccount: string
  email: string
  emailPlaceholder: string
  password: string
  passwordPlaceholder: string
  verificationCode: string
  codePlaceholder: string
  sendCode: string
  sendingCode: string
  resendIn: (seconds: number) => string
  codeSent: string
  existingAccount: string
  newAccount: string
  switchToSignIn: string
  switchToRegister: string
  passwordHint: string
  authRequiredFields: string

  // Account
  accountTitle: string
  accountDescription: string
  displayName: string
  displayNamePlaceholder: string
  displayNameHint: string
  avatar: string
  avatarHint: string
  chooseAvatar: string
  removeAvatar: string
  saveProfile: string
  savingProfile: string
  profileSaved: string
  signOut: string
  signingOut: string
  avatarBadType: string
  avatarTooLarge: string
  accountFor: (email: string) => string

  // Shared states
  loading: string
  retry: string
  errorTitle: string
  configErrorTitle: string
  configErrorHint: string
  offlineHint: string
  apiErrorMessage: (code: string, message: string) => string

  // Watchlist
  addTicker: string
  addTickerDesc: string
  tickerLabel: string
  tickerPlaceholder: string
  add: string
  verifying: string
  errEmpty: string
  errFormat: string
  errDuplicate: (ticker: string) => string
  errNotFound: (ticker: string) => string
  myWatchlist: string
  tracked: (count: number) => string
  emptyWatchlist: string
  removeAria: (ticker: string) => string
  editList: string
  doneEditing: string
  removeSelected: (count: number) => string
  selectAria: (ticker: string) => string
  noQuoteData: string
  open: string
  dayRange: string
  prevClose: string
  liveQuotes: string
  updatedAt: (time: string) => string

  // AI Focus
  aiDailyFocus: string
  aiDailyFocusDesc: string
  analyzedAt: (time: string) => string
  runAnalysis: string
  analyzing: string
  confidence: string
  polymarketLabel: string
  polymarketUnavailable: string
  reasoningLabel: string
  sourcesLabel: string
  noFocusYet: string
  noFocusHint: string
  partialFailure: (symbols: string) => string
  poweredBy: string
  liveMarkets: string
  marketVolume: (amount: string) => string
  sourceStatus: string
  sourceQuotes: string
  sourceNews: string
  sourcePolymarket: string
  sourceLive: string
  sourceMissing: string
  degradedNotice: string

  // News
  newsFeedTitle: string
  newsFeedDesc: string
  companyNewsTitle: (symbol: string) => string
  allMarkets: string
  readOriginal: string
  back: string
  relatedTickers: string
  translateAction: string
  translating: string
  showOriginal: string
  noSummary: string
  emptyNews: string

  // Sentiment tags
  sentiment: Record<'Bullish' | 'Neutral' | 'Bearish', string>
}

const en: Dict = {
  brand: 'Sentiment Desk',
  languageSwitchTo: '中文',
  navWatchlist: 'Watchlist',
  navFocus: 'AI Focus Stocks',
  navNews: 'News Feed',
  subtitleWatchlist: 'Live quotes for the symbols you track',
  subtitleFocus: 'AI analysis of real headlines and prediction markets',
  subtitleNews: 'Real US market news, click any story to read more',
  navAccount: 'Account',
  subtitleAccount: 'Manage your name, avatar, and session',

  authWelcome: 'Your market signal workspace',
  authDescription:
    'Sign in to keep a private watchlist and analyze live market evidence.',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  createAccount: 'Create account',
  creatingAccount: 'Creating account…',
  email: 'Email',
  emailPlaceholder: 'you@example.com',
  password: 'Password',
  passwordPlaceholder: 'At least 8 characters',
  verificationCode: 'Verification code',
  codePlaceholder: '6-digit code',
  sendCode: 'Send code',
  sendingCode: 'Sending…',
  resendIn: (seconds) => `Resend in ${seconds}s`,
  codeSent: 'Verification code sent. Check your inbox.',
  existingAccount: 'Already have an account?',
  newAccount: 'New to Sentiment Desk?',
  switchToSignIn: 'Sign in instead',
  switchToRegister: 'Create an account',
  passwordHint: 'Use at least 8 characters.',
  authRequiredFields: 'Complete all fields before continuing.',

  accountTitle: 'Account profile',
  accountDescription: 'Your profile is stored with this account.',
  displayName: 'Display name',
  displayNamePlaceholder: 'Defaults to your email name',
  displayNameHint: 'Up to 32 characters. Leave blank to use your email name.',
  avatar: 'Avatar',
  avatarHint: 'PNG, JPEG, or WebP, up to 200 KB.',
  chooseAvatar: 'Choose image',
  removeAvatar: 'Remove image',
  saveProfile: 'Save profile',
  savingProfile: 'Saving…',
  profileSaved: 'Profile saved.',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  avatarBadType: 'Choose a PNG, JPEG, or WebP image.',
  avatarTooLarge: 'Avatar must be 200 KB or smaller.',
  accountFor: (email) => `Signed in as ${email}`,

  loading: 'Loading…',
  retry: 'Retry',
  errorTitle: 'Could not load data',
  configErrorTitle: 'Server not configured',
  configErrorHint:
    'Add the missing key to .env.local and restart the dev server. See .env.example.',
  offlineHint: 'The API server is not reachable. Is the dev server running?',
  apiErrorMessage: (_code, message) => message,

  addTicker: 'Add Ticker',
  addTickerDesc: 'Symbols are verified against live market data before being added.',
  tickerLabel: 'Ticker symbol',
  tickerPlaceholder: 'e.g. AAPL',
  add: 'Add',
  verifying: 'Verifying…',
  errEmpty: 'Enter a ticker symbol.',
  errFormat: 'Use 1-6 letters, e.g. AAPL.',
  errDuplicate: (ticker) => `${ticker} is already on your watchlist.`,
  errNotFound: (ticker) => `${ticker} was not found on any US exchange.`,
  myWatchlist: 'My Watchlist',
  tracked: (count) => `${count} symbol${count === 1 ? '' : 's'} tracked`,
  emptyWatchlist: 'No symbols yet. Add one above to get started.',
  removeAria: (ticker) => `Remove ${ticker} from watchlist`,
  editList: 'Edit list',
  doneEditing: 'Done',
  removeSelected: (count) =>
    `Remove ${count} selected${count === 1 ? '' : ''}`,
  selectAria: (ticker) => `Select ${ticker}`,
  noQuoteData: 'No quote data',
  open: 'Open',
  dayRange: 'Day range',
  prevClose: 'Prev close',
  liveQuotes: 'Live quotes',
  updatedAt: (time) => `Checked ${time}`,

  aiDailyFocus: 'AI Daily Focus',
  aiDailyFocusDesc:
    'Each verdict is generated from the real headlines listed on the card.',
  analyzedAt: (time) => `Analyzed ${time}`,
  runAnalysis: 'Run AI Analysis',
  analyzing: 'Analyzing…',
  confidence: 'Confidence',
  polymarketLabel: 'Polymarket signal',
  polymarketUnavailable: 'No related prediction market found.',
  reasoningLabel: 'AI reasoning',
  sourcesLabel: 'Sources used',
  noFocusYet: 'No analysis yet',
  noFocusHint:
    'Run the analysis to have the model read current headlines for your watchlist.',
  partialFailure: (symbols) => `Skipped: ${symbols}`,
  poweredBy: 'Analysis by DeepSeek. Not investment advice.',
  liveMarkets: 'Live prediction markets',
  marketVolume: (amount) => `${amount} volume`,
  sourceStatus: 'Data sources',
  sourceQuotes: 'Quotes',
  sourceNews: 'News',
  sourcePolymarket: 'Polymarket',
  sourceLive: 'Live',
  sourceMissing: 'Unavailable',
  degradedNotice:
    'Analysis ran on the sources marked live. Missing sources were excluded, not guessed.',

  newsFeedTitle: 'Market News',
  newsFeedDesc: 'Live headlines from US market coverage.',
  companyNewsTitle: (symbol) => `${symbol} news`,
  allMarkets: 'All markets',
  readOriginal: 'Read full article',
  back: 'Back',
  relatedTickers: 'Related',
  translateAction: 'Translate',
  translating: 'Translating…',
  showOriginal: 'Show original',
  noSummary: 'No summary provided. Open the original article to read the full story.',
  emptyNews: 'No stories found for this selection.',

  sentiment: { Bullish: 'Bullish', Neutral: 'Neutral', Bearish: 'Bearish' },
}

const zh: Dict = {
  brand: '情绪终端',
  languageSwitchTo: 'English',
  navWatchlist: '自选股',
  navFocus: 'AI 焦点股',
  navNews: '新闻资讯',
  subtitleWatchlist: '你所跟踪标的的实时行情',
  subtitleFocus: '基于真实新闻与预测市场的 AI 分析',
  subtitleNews: '真实美股新闻，点击任意条目查看详情',
  navAccount: '账户',
  subtitleAccount: '管理昵称、头像和登录状态',

  authWelcome: '你的市场信号工作台',
  authDescription: '登录后可保存个人自选股，并分析实时市场依据。',
  signIn: '登录',
  signingIn: '正在登录…',
  createAccount: '注册账户',
  creatingAccount: '正在注册…',
  email: '邮箱',
  emailPlaceholder: 'you@example.com',
  password: '密码',
  passwordPlaceholder: '至少 8 个字符',
  verificationCode: '邮箱验证码',
  codePlaceholder: '6 位验证码',
  sendCode: '发送验证码',
  sendingCode: '发送中…',
  resendIn: (seconds) => `${seconds} 秒后可重发`,
  codeSent: '验证码已发送，请查收邮件。',
  existingAccount: '已有账户？',
  newAccount: '第一次使用情绪终端？',
  switchToSignIn: '直接登录',
  switchToRegister: '注册新账户',
  passwordHint: '请使用至少 8 个字符。',
  authRequiredFields: '请先完整填写所有字段。',

  accountTitle: '账户资料',
  accountDescription: '资料会跟随当前账户保存。',
  displayName: '昵称',
  displayNamePlaceholder: '默认显示邮箱前缀',
  displayNameHint: '最多 32 个字符；留空则使用邮箱前缀。',
  avatar: '头像',
  avatarHint: '支持 PNG、JPEG 或 WebP，最大 200 KB。',
  chooseAvatar: '选择图片',
  removeAvatar: '移除图片',
  saveProfile: '保存资料',
  savingProfile: '保存中…',
  profileSaved: '资料已保存。',
  signOut: '退出登录',
  signingOut: '正在退出…',
  avatarBadType: '请选择 PNG、JPEG 或 WebP 图片。',
  avatarTooLarge: '头像大小不能超过 200 KB。',
  accountFor: (email) => `当前登录：${email}`,

  loading: '加载中…',
  retry: '重试',
  errorTitle: '数据加载失败',
  configErrorTitle: '服务端未配置',
  configErrorHint:
    '请将缺失的 key 填入 .env.local 后重启开发服务器，参见 .env.example。',
  offlineHint: '无法连接到 API 服务器，请确认开发服务器正在运行。',
  apiErrorMessage: (code, message) => {
    const seconds = message.match(/\b(\d+)s\b/)?.[1]
    const known: Record<string, string> = {
      BAD_EMAIL: '请输入有效的邮箱地址。',
      EMAIL_TAKEN: '该邮箱已注册，请直接登录。',
      TOO_SOON: seconds
        ? `请等待 ${seconds} 秒后再获取验证码。`
        : '请稍后再获取验证码。',
      WEAK_PASSWORD: message.includes('too long')
        ? '密码过长。'
        : '密码至少需要 8 个字符。',
      NO_CODE: '请先获取邮箱验证码。',
      CODE_EXPIRED: '验证码已过期，请重新获取。',
      TOO_MANY_ATTEMPTS: '验证码错误次数过多，请重新获取。',
      BAD_CODE: '验证码不正确。',
      BAD_CREDENTIALS: '邮箱或密码不正确。',
      UNAUTHENTICATED: '请登录后继续。',
      BAD_DISPLAY_NAME: '昵称不能超过 32 个字符。',
      USER_NOT_FOUND: '未找到该账户。',
      BAD_AVATAR: '请选择有效的 PNG、JPEG 或 WebP 图片。',
      AVATAR_TOO_LARGE: '头像大小不能超过 200 KB。',
      MISSING_FIELDS: '请先完整填写所有字段。',
      OFFLINE: '无法连接到 API 服务器。',
      TIMEOUT: '行情请求超时，请检查网络连接。',
      BAD_JSON: '服务器返回了无效响应。',
      UNKNOWN: '发生未知错误。',
    }
    return known[code] ?? `服务器返回：${message}`
  },

  addTicker: '添加股票代码',
  addTickerDesc: '添加前会通过实时行情校验该代码是否真实存在。',
  tickerLabel: '股票代码',
  tickerPlaceholder: '例如 AAPL',
  add: '添加',
  verifying: '校验中…',
  errEmpty: '请输入股票代码。',
  errFormat: '请输入 1-6 个字母，例如 AAPL。',
  errDuplicate: (ticker) => `${ticker} 已在你的自选股中。`,
  errNotFound: (ticker) => `未在美股市场中找到 ${ticker}。`,
  myWatchlist: '我的自选股',
  tracked: (count) => `已跟踪 ${count} 只标的`,
  emptyWatchlist: '暂无标的，请在上方添加一只开始使用。',
  removeAria: (ticker) => `将 ${ticker} 从自选股移除`,
  editList: '编辑列表',
  doneEditing: '完成',
  removeSelected: (count) => `移除所选 ${count} 只`,
  selectAria: (ticker) => `选择 ${ticker}`,
  noQuoteData: '暂无行情数据',
  open: '开盘',
  dayRange: '日内区间',
  prevClose: '昨收',
  liveQuotes: '实时行情',
  updatedAt: (time) => `检查于 ${time}`,

  aiDailyFocus: 'AI 每日焦点',
  aiDailyFocusDesc: '每条结论均由卡片中列出的真实新闻生成。',
  analyzedAt: (time) => `分析于 ${time}`,
  runAnalysis: '运行 AI 分析',
  analyzing: '分析中…',
  confidence: '置信度',
  polymarketLabel: 'Polymarket 信号',
  polymarketUnavailable: '未找到相关的预测市场。',
  reasoningLabel: 'AI 推理',
  sourcesLabel: '引用来源',
  noFocusYet: '尚无分析结果',
  noFocusHint: '运行分析，让模型读取你自选股的当前新闻。',
  partialFailure: (symbols) => `已跳过：${symbols}`,
  poweredBy: '分析由 DeepSeek 生成，不构成投资建议。',
  liveMarkets: '实时预测市场',
  marketVolume: (amount) => `成交量 ${amount}`,
  sourceStatus: '数据源',
  sourceQuotes: '行情',
  sourceNews: '新闻',
  sourcePolymarket: 'Polymarket',
  sourceLive: '正常',
  sourceMissing: '不可用',
  degradedNotice: '分析仅基于标记为正常的数据源，缺失的数据源已排除，不做任何猜测。',

  newsFeedTitle: '市场新闻',
  newsFeedDesc: '来自美股市场的实时头条。',
  companyNewsTitle: (symbol) => `${symbol} 相关新闻`,
  allMarkets: '全市场',
  readOriginal: '阅读原文',
  back: '返回',
  relatedTickers: '相关标的',
  translateAction: '翻译',
  translating: '翻译中…',
  showOriginal: '显示原文',
  noSummary: '暂无摘要，请打开原文阅读完整报道。',
  emptyNews: '当前筛选下没有新闻。',

  sentiment: { Bullish: '看多', Neutral: '中性', Bearish: '看空' },
}

export const DICT: Record<Locale, Dict> = { en, zh }

/** Locale tag for Intl formatting. */
export function intlLocale(locale: Locale) {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

/** Relative time like "18m ago" / "18 分钟前". */
export function relativeTime(ms: number, locale: Locale): string {
  const diffSec = Math.round((ms - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: 'auto',
  })
  const abs = Math.abs(diffSec)
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  return rtf.format(Math.round(diffSec / 86400), 'day')
}
