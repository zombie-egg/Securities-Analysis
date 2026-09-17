import { useState } from 'react'
import {
  AlertCircle,
  ImagePlus,
  Loader2,
  LogOut,
  Save,
  Trash2,
} from 'lucide-react'

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
import { ApiError, logout, updateProfile, type User } from '@/lib/api'
import { displayNameFor } from '@/lib/user'
import type { Dict } from '@/lib/i18n'

const MAX_AVATAR_BYTES = 200 * 1024
const AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

interface AccountPageProps {
  user: User
  t: Dict
  onUserChange: (user: User) => void
  onSignedOut: () => void
}

export function AccountPage({
  user,
  t,
  onUserChange,
  onSignedOut,
}: AccountPageProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '')
  const [pendingAvatar, setPendingAvatar] = useState<
    string | null | undefined
  >()
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [errorAction, setErrorAction] = useState<'save' | 'logout' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const avatar = pendingAvatar === undefined ? user.avatar : pendingAvatar
  const initials = Array.from(
    displayNameFor({ ...user, displayName })
  )[0]?.toUpperCase()

  function showError(err: unknown, action: 'save' | 'logout') {
    setError(
      err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', t.errorTitle)
    )
    setErrorAction(action)
    setNotice(null)
  }

  function handleAvatar(file: File | undefined) {
    setError(null)
    setNotice(null)
    if (!file) return
    if (!AVATAR_TYPES.has(file.type)) {
      showError(new ApiError(400, 'BAD_AVATAR', t.avatarBadType), 'save')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showError(new ApiError(413, 'AVATAR_TOO_LARGE', t.avatarTooLarge), 'save')
      return
    }
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') setPendingAvatar(reader.result)
    })
    reader.addEventListener('error', () => {
      showError(new ApiError(400, 'BAD_AVATAR', t.avatarBadType), 'save')
    })
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateProfile({
        displayName,
        ...(pendingAvatar !== undefined ? { avatar: pendingAvatar } : {}),
      })
      onUserChange(updated)
      setDisplayName(updated.displayName ?? '')
      setPendingAvatar(undefined)
      setNotice(t.profileSaved)
      setErrorAction(null)
    } catch (err) {
      showError(err, 'save')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    setSigningOut(true)
    setError(null)
    setNotice(null)
    try {
      await logout()
      onSignedOut()
    } catch (err) {
      showError(err, 'logout')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.accountTitle}</CardTitle>
          <CardDescription>{t.accountDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xl font-semibold">
              {avatar ? (
                <img
                  src={avatar}
                  alt={t.avatar}
                  className="size-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="avatar">{t.avatar}</Label>
              <Input
                id="avatar"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => handleAvatar(event.target.files?.[0])}
                disabled={saving}
                aria-describedby="avatar-hint"
                className="sr-only"
              />
              <Button asChild variant="outline" size="sm">
                <label
                  htmlFor="avatar"
                  aria-disabled={saving}
                  className={saving ? 'pointer-events-none opacity-50' : ''}
                >
                  <ImagePlus />
                  {t.chooseAvatar}
                </label>
              </Button>
              <p id="avatar-hint" className="text-xs text-muted-foreground">
                {t.avatarHint}
              </p>
              {avatar && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingAvatar(null)}
                  disabled={saving}
                >
                  <Trash2 />
                  {t.removeAvatar}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">{t.displayName}</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t.displayNamePlaceholder}
              maxLength={32}
              disabled={saving}
              aria-describedby="display-name-hint"
            />
            <p id="display-name-hint" className="text-xs text-muted-foreground">
              {t.displayNameHint}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {t.accountFor(user.email)}
          </p>

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
                  void (errorAction === 'logout'
                    ? handleLogout()
                    : handleSave())
                }
                disabled={saving || signingOut}
              >
                {t.retry}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-5">
            <Button
              onClick={() => void handleSave()}
              disabled={saving || signingOut}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? t.savingProfile : t.saveProfile}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleLogout()}
              disabled={saving || signingOut}
            >
              {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
              {signingOut ? t.signingOut : t.signOut}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
