import { useEffect, useState } from 'react'
import { AlertCircle, Languages, LineChart, Loader2, Mail } from 'lucide-react'

import { BorderBeam } from '@/components/ui/border-beam'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, login, register, requestCode, type User } from '@/lib/api'
import type { Dict, Locale } from '@/lib/i18n'

interface AuthPageProps {
  locale: Locale
  t: Dict
  onToggleLocale: () => void
  onAuthenticated: (user: User) => void
}

type Mode = 'login' | 'register'
type FailedAction = 'code' | 'submit'

export function AuthPage({
  locale,
  t,
  onToggleLocale,
  onAuthenticated,
}: AuthPageProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [failedAction, setFailedAction] = useState<FailedAction | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1_000
    )
    return () => window.clearInterval(timer)
  }, [cooldown])

  function showError(err: unknown, action: FailedAction) {
    setError(
      err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', t.errorTitle)
    )
    setFailedAction(action)
  }

  async function handleSendCode() {
    if (sendingCode || cooldown > 0) return
    setSendingCode(true)
    setError(null)
    setNotice(null)
    try {
      await requestCode(email)
      setCooldown(60)
      setNotice(t.codeSent)
      setFailedAction(null)
    } catch (err) {
      showError(err, 'code')
    } finally {
      setSendingCode(false)
    }
  }

  async function handleSubmit() {
    if (submitting) return
    if (!email || !password || (mode === 'register' && !code)) {
      showError(
        new ApiError(400, 'MISSING_FIELDS', t.authRequiredFields),
        'submit'
      )
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const user =
        mode === 'login'
          ? await login(email, password)
          : await register(email, code, password)
      onAuthenticated(user)
    } catch (err) {
      showError(err, 'submit')
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setFailedAction(null)
    setNotice(null)
  }

  return (
    <div
      className="min-h-screen bg-background px-4 py-8 text-foreground"
      lang={locale}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <LineChart className="size-5" />
          {t.brand}
        </div>
        <Button variant="ghost" size="sm" onClick={onToggleLocale}>
          <Languages />
          {t.languageSwitchTo}
        </Button>
      </div>

      <div className="mx-auto grid min-h-[calc(100vh-7rem)] w-full max-w-5xl items-center gap-10 py-10 md:grid-cols-[1fr_26rem]">
        <section className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground">{t.brand}</p>
          <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t.authWelcome}
          </h1>
          <p className="max-w-lg text-muted-foreground">{t.authDescription}</p>
        </section>

        <Card className="relative overflow-hidden">
          <CardHeader>
            <CardTitle>
              {mode === 'login' ? t.signIn : t.createAccount}
            </CardTitle>
            <CardDescription>
              {mode === 'login' ? t.newAccount : t.existingAccount}{' '}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4"
                disabled={submitting || sendingCode}
                onClick={() =>
                  switchMode(mode === 'login' ? 'register' : 'login')
                }
              >
                {mode === 'login' ? t.switchToRegister : t.switchToSignIn}
              </button>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="auth-email">{t.email}</Label>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t.emailPlaceholder}
                  autoComplete="email"
                  disabled={submitting}
                />
              </div>

              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="auth-code">{t.verificationCode}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="auth-code"
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, '').slice(0, 6)
                        )
                      }
                      placeholder={t.codePlaceholder}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      disabled={submitting}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => void handleSendCode()}
                      disabled={sendingCode || cooldown > 0 || !email}
                    >
                      {sendingCode ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Mail />
                      )}
                      {sendingCode
                        ? t.sendingCode
                        : cooldown > 0
                          ? t.resendIn(cooldown)
                          : t.sendCode}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="auth-password">{t.password}</Label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t.passwordPlaceholder}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  disabled={submitting}
                />
                {mode === 'register' && (
                  <p className="text-xs text-muted-foreground">
                    {t.passwordHint}
                  </p>
                )}
              </div>

              {notice && (
                <p className="text-sm text-chart-2" role="status">
                  {notice}
                </p>
              )}
              {error && (
                <div className="space-y-2 rounded-md border border-chart-5/40 p-3">
                  <p
                    className="flex items-start gap-2 text-sm text-chart-5"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    {t.apiErrorMessage(error.code, error.message)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void (failedAction === 'code'
                        ? handleSendCode()
                        : handleSubmit())
                    }
                    disabled={sendingCode || submitting}
                  >
                    {t.retry}
                  </Button>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                {submitting
                  ? mode === 'login'
                    ? t.signingIn
                    : t.creatingAccount
                  : mode === 'login'
                    ? t.signIn
                    : t.createAccount}
              </Button>
            </form>
          </CardContent>
          <BorderBeam />
        </Card>
      </div>
    </div>
  )
}
