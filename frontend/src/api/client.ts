const origins = {
  auth: (import.meta.env.VITE_AUTH_API_URL ?? 'http://localhost:8001').replace(/\/$/, ''),
  pqrs: (import.meta.env.VITE_PQRS_API_URL ?? 'http://localhost:8002').replace(/\/$/, ''),
}

const offlineMessage = {
  auth: 'No se pudo conectar con el servicio de autenticación',
  pqrs: 'No se pudo conectar con el servicio de PQRS',
}

const fallbackMessage = {
  auth: 'No se pudo iniciar sesión',
  pqrs: 'No se pudo completar la solicitud',
}

type ServiceName = keyof typeof origins

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

type ApiRequestOptions = {
  service: ServiceName
  method: 'GET' | 'POST'
  body?: unknown
}

export function authRequest<T>(path: string, body: unknown) {
  return apiRequest<T>(path, { service: 'auth', method: 'POST', body })
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${origins[options.service]}${path}`, {
      method: options.method,
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(offlineMessage[options.service])
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, fallbackMessage[options.service]))
  }
  return payload as T
}

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== 'object' || payload === null || !('message' in payload)) {
    return fallback
  }
  const message = payload.message
  if (typeof message === 'string' && message) return message
  if (Array.isArray(message)) {
    const lines = message.filter((item) => typeof item === 'string' && item)
    if (lines.length) return lines.join(' ')
  }
  return fallback
}
