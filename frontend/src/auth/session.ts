const storageKey = 'pqrs.session'

export type SessionUser = {
  id: string
  email: string
  role: string
}

export type Session = {
  accessToken: string
  user: SessionUser
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(storageKey, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(storageKey)
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const session = value as Session
  return typeof session.accessToken === 'string' && isUser(session.user)
}

function isUser(value: unknown): value is SessionUser {
  if (typeof value !== 'object' || value === null) return false
  const user = value as SessionUser
  return typeof user.id === 'string' && typeof user.email === 'string' && typeof user.role === 'string'
}
