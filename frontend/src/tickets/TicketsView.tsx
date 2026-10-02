import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client.ts'
import { createTicket, getTicket, listByUser, type Ticket } from '../api/pqrs.ts'

type TicketsViewProps = {
  userId: string
  email: string
  onLogout: () => void
}

export function TicketsView({ userId, email, onLogout }: TicketsViewProps) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [listError, setListError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Ticket | null>(null)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setListError('')
    listByUser(userId)
      .then((rows) => {
        if (active) setTickets(rows)
      })
      .catch((caught: unknown) => {
        if (active) setListError(messageFor(caught))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId, reloadKey])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailError('')
      return
    }
    let active = true
    setDetailError('')
    getTicket(selectedId)
      .then((ticket) => {
        if (active) setDetail(ticket)
      })
      .catch((caught: unknown) => {
        if (!active) return
        setDetail(null)
        setDetailError(messageFor(caught))
      })
    return () => {
      active = false
    }
  }, [selectedId, reloadKey])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextSubject = subject.trim()
    const nextDescription = description.trim()
    if (nextSubject.length < 5) {
      setFormError('El asunto debe tener al menos 5 caracteres.')
      return
    }
    if (nextSubject.length > 200) {
      setFormError('El asunto no puede pasar de 200 caracteres.')
      return
    }
    if (nextDescription.length < 10) {
      setFormError('La descripción debe tener al menos 10 caracteres.')
      return
    }

    setSubmitting(true)
    setFormError('')
    try {
      const created = await createTicket(userId, nextSubject, nextDescription)
      setSubject('')
      setDescription('')
      setSelectedId(created.id)
      setDetail(created)
      setReloadKey((value) => value + 1)
    } catch (caught) {
      setFormError(messageFor(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="w-full max-w-3xl rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-teal-800">PQRS</p>
          <h1 className="mt-2 text-2xl font-semibold">Mis solicitudes</h1>
          <p className="mt-1 text-sm text-stone-600">
            Sesión de <span className="font-medium text-stone-900">{email}</span>
          </p>
        </div>
        <button
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          type="button"
          onClick={onLogout}
        >
          Cerrar sesión
        </button>
      </div>

      <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
        <label className="block text-sm font-medium" htmlFor="subject">
          Asunto
          <input
            id="subject"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
            value={subject}
            maxLength={200}
            spellCheck={false}
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? 'ticket-error' : undefined}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium" htmlFor="description">
          Descripción
          <textarea
            id="description"
            className="mt-1 min-h-28 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
            value={description}
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? 'ticket-error' : undefined}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {formError ? (
          <p id="ticket-error" className="text-sm text-red-700" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          className="rounded-lg bg-teal-800 px-3 py-2 font-medium text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Tus solicitudes</h2>
        <button
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:opacity-60"
          type="button"
          disabled={loading}
          onClick={() => setReloadKey((value) => value + 1)}
        >
          Actualizar
        </button>
      </div>

      {listError ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {listError}
        </p>
      ) : null}
      {loading ? <p className="mt-3 text-sm text-stone-600">Cargando…</p> : null}
      {!loading && !listError && tickets.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">Aún no tienes solicitudes.</p>
      ) : null}

      {tickets.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <button
                className={`w-full rounded-lg border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 ${
                  selectedId === ticket.id
                    ? 'border-teal-800 bg-teal-50'
                    : 'border-stone-200 hover:bg-stone-50'
                }`}
                type="button"
                aria-pressed={selectedId === ticket.id}
                onClick={() => setSelectedId(ticket.id)}
              >
                <span className="block font-medium">{ticket.subject}</span>
                <span className="mt-1 block text-sm text-stone-600">
                  {statusLabel(ticket.status)} · {formatWhen(ticket.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {detailError ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {detailError}
        </p>
      ) : null}
      {detail ? <TicketDetail ticket={detail} /> : null}
    </section>
  )
}

function TicketDetail({ ticket }: { ticket: Ticket }) {
  return (
    <article className="mt-4 rounded-xl border border-stone-200 p-4">
      <h2 className="text-lg font-semibold">{ticket.subject}</h2>
      <p className="mt-1 text-sm text-stone-600">
        {statusLabel(ticket.status)} · {formatWhen(ticket.createdAt)}
      </p>
      <p className="mt-3 text-sm whitespace-pre-wrap">{ticket.description}</p>
      {ticket.status === 'PENDING' ? (
        <p className="mt-4 text-sm text-stone-600">El triaje sigue en curso.</p>
      ) : null}
      {ticket.status === 'TRIAGE_FAILED' ? (
        <p className="mt-4 text-sm text-red-700">El triaje no se completó.</p>
      ) : null}
      {ticket.status === 'AI_PROCESSED' ? (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Categoría" value={ticket.category} />
          <Field label="Área" value={ticket.department} />
          <Field label="Prioridad" value={ticket.priority} />
          <Field label="Urgente" value={ticket.isUrgent ? 'Sí' : 'No'} />
          <Field label="Resumen" value={ticket.summary} wide />
          <Field label="Justificación" value={ticket.priorityJustification} wide />
        </dl>
      ) : null}
    </article>
  )
}

function Field({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="font-medium text-stone-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap">{value?.trim() ? value : 'Sin dato'}</dd>
    </div>
  )
}

function statusLabel(status: string) {
  if (status === 'PENDING') return 'Pendiente'
  if (status === 'AI_PROCESSED') return 'Procesada'
  if (status === 'TRIAGE_FAILED') return 'Triaje fallido'
  return status
}

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es')
}

function messageFor(caught: unknown) {
  if (!(caught instanceof ApiError)) return 'No se pudo completar la solicitud.'
  if (caught.message === 'Validation failed') return 'Revisa el asunto y la descripción.'
  if (caught.message.startsWith('Ticket with ID')) return 'No encontramos esa solicitud.'
  return caught.message
}
