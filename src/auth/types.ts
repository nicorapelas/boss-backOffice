export interface AuthUser {
  id: string
  email: string
  /** Role slug from server (e.g. admin, cashier, or custom). */
  role: string
  permissions?: string[]
}

export interface SessionBundle {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}
