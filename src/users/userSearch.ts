import type { BackOfficeUser } from '../api/types'

export function userMatchesSearch(user: BackOfficeUser, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const parts = [
    user.email,
    user.displayName,
    user.role,
    user.roleName,
    user.badgeCode,
    user.hrProfile?.phone,
    user.hrProfile?.notes,
    user.hrProfile?.scoreCard,
    user.active === false ? 'disabled' : 'enabled',
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())

  return parts.some((text) => text.includes(q))
}

export function filterUsersBySearch(users: BackOfficeUser[], query: string): BackOfficeUser[] {
  const q = query.trim()
  if (!q) return users
  return users.filter((u) => userMatchesSearch(u, q))
}
