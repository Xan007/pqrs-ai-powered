import { useState, type FormEvent } from 'react'
import { ApiError } from './api/client.ts'
import { login, register } from './api/auth.ts'
import { clearSession, loadSession, saveSession, type Session } from './auth/session.ts'
import { TicketsView } from './tickets/TicketsView.tsx'

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextEmail = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError('Escribe un correo válido.')
      return
    }
    if (mode === 'login' && !password) {
      setError('Escribe tu contraseña.')
      return
    }
    if (mode === 'register') {
      const passwordError = passwordProblem(password)
      if (passwordError) {
        setError(passwordError)
        return
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.')
        return
      }
    }

    setPending(true)
    setError('')
    try {
      if (mode === 'register') await register(nextEmail, password)
      const result = await login(nextEmail, password)
      const nextSession = { accessToken: result.accessToken, user: result.user }
      saveSession(nextSession)
      setSession(nextSession)
      setPassword('')
      setConfirmPassword('')
    } catch (caught) {
      setError(messageFor(caught, mode))
    } finally {
      setPending(false)
    }
  }

  function show(next: 'login' | 'register') {
    setMode(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  function logout() {
    clearSession()
    setSession(null)
    setMode('login')
  }

  return (
    <main className="grid min-h-svh place-items-center bg-stone-100 px-4 py-10 text-stone-900">
      {session ? (
        <TicketsView userId={session.user.id} email={session.user.email} onLogout={logout} />
      ) : (
        <section className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium tracking-wide text-teal-800">PQRS</p>
            <h1 className="mt-2 text-2xl font-semibold">
              {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {mode === 'login'
                ? 'Entra con tu correo y contraseña.'
                : 'Regístrate con un correo y una contraseña de al menos 8 caracteres.'}
            </p>
            <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
              <label className="block text-sm font-medium" htmlFor="email">
                Correo
                <input
                  id="email"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  spellCheck={false}
                  value={email}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'login-error' : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium" htmlFor="password">
                Contraseña
                <input
                  id="password"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  maxLength={72}
                  value={password}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'login-error' : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {mode === 'register' ? (
                <label className="block text-sm font-medium" htmlFor="confirm-password">
                  Confirmar contraseña
                  <input
                    id="confirm-password"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    value={confirmPassword}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
              ) : null}
              {error ? (
                <p id="login-error" className="text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                className="w-full rounded-lg bg-teal-800 px-3 py-2 font-medium text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:opacity-60"
                type="submit"
                disabled={pending}
              >
                {pending ? 'Espera…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
              </button>
            </form>
            <button
              className="mt-4 text-sm font-medium text-teal-800 hover:text-teal-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
              type="button"
              onClick={() => show(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
            </button>
        </section>
      )}
    </main>
  )
}

function passwordProblem(password: string) {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (password.length > 72) return 'La contraseña no puede pasar de 72 caracteres.'
  return ''
}

function messageFor(caught: unknown, mode: 'login' | 'register') {
  if (caught instanceof ApiError && caught.message === 'Invalid email or password') {
    return 'Correo o contraseña incorrectos.'
  }
  if (caught instanceof ApiError && caught.message === 'Email is already registered') {
    return 'Ese correo ya está registrado.'
  }
  if (caught instanceof ApiError && caught.message === 'Validation failed') {
    return 'Revisa el correo y la contraseña.'
  }
  if (caught instanceof ApiError) return caught.message
  return mode === 'register' ? 'No se pudo crear la cuenta.' : 'No se pudo iniciar sesión.'
}
