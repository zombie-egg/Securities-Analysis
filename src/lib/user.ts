import type { User } from './api'

export function displayNameFor(user: User): string {
  return user.displayName || user.email.split('@')[0]
}
