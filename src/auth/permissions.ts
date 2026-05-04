import type { AuthUser } from './types'

export function hasPermission(user: AuthUser | null | undefined, perm: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  const p = user.permissions ?? []
  if (p.includes('*')) return true
  return p.includes(perm)
}
