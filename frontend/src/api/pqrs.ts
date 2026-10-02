import { ApiError, apiRequest } from './client.ts'

export type Ticket = {
  id: string
  userId: string
  subject: string
  description: string
  category: string | null
  department: string | null
  priority: string | null
  isUrgent: boolean
  summary: string | null
  priorityJustification: string | null
  status: string
  createdAt: string
}

export function createTicket(userId: string, subject: string, description: string) {
  return apiRequest<unknown>('/api/v1/tickets', {
    service: 'pqrs',
    method: 'POST',
    body: { userId, subject, description },
  }).then(requireTicket)
}

export function listByUser(userId: string) {
  return apiRequest<unknown>(`/api/v1/tickets/user/${encodeURIComponent(userId)}`, {
    service: 'pqrs',
    method: 'GET',
  }).then(requireList)
}

export function getTicket(id: string) {
  return apiRequest<unknown>(`/api/v1/tickets/${encodeURIComponent(id)}`, {
    service: 'pqrs',
    method: 'GET',
  }).then(requireTicket)
}

function requireList(payload: unknown) {
  if (typeof payload !== 'object' || payload === null || !('data' in payload) || !Array.isArray(payload.data)) {
    throw new ApiError('No se pudo leer la lista de solicitudes.')
  }
  return payload.data.filter(isTicket)
}

function requireTicket(payload: unknown) {
  if (!isTicket(payload)) throw new ApiError('No se pudo leer la solicitud.')
  return payload
}

function isTicket(value: unknown): value is Ticket {
  if (typeof value !== 'object' || value === null) return false
  const ticket = value as Ticket
  return (
    typeof ticket.id === 'string' &&
    typeof ticket.userId === 'string' &&
    typeof ticket.subject === 'string' &&
    typeof ticket.description === 'string' &&
    typeof ticket.status === 'string' &&
    typeof ticket.isUrgent === 'boolean' &&
    typeof ticket.createdAt === 'string'
  )
}
