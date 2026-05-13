'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')

  const [valid, setValid]     = useState(null) // null = checking, true/false
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [branding, setBranding]   = useState({ logo_url: null, login_bg_url: null })

  useEffect(() => {
    fetch('/api/public/branding').then(r => r.json()).then(setBranding).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) { setValid(false); return }
    fetch(`/api/auth/reset-password?token=${token}`)
      .then(r => r.json())
      .then(d => setValid(d.valid))
      .catch(() => setValid(false))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Паролата трябва да е минимум 6 символа'); return }
    if (password !== confirm)  { setError('Паролите не съвпадат'); return }

    setLoading(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Грешка'); return }
    setDone(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <div className="login-shell">
      <div className="login-bg" style={{
        flex: 1.2, position: 'relative', overflow: 'hidden',
        backgroundImage: branding.login_bg_url
          ? `url(${branding.login_bg_url})`
          : 'linear-gradient(135deg, #1D9E75 0%, #0F6E56 100%)',
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.35) 100%)' }} />
      </div>

      <div className="login-form-side" style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem', background: 'var(--surface)',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            {branding.logo_url && (
              <img src={branding.logo_url} alt="Logo" style={{ maxHeight: 64, maxWidth: 200, marginBottom: 16, objectFit: 'contain' }} />
            )}
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Задаване на парола</h1>
          </div>

          {valid === null && (
            <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Зареждане...</p>
          )}

          {valid === false && (
            <div className="alert alert-error">
              Линкът е невалиден или изтекъл. Поискай нов от администратора или използвай{' '}
              <a href="/login" style={{ color: 'var(--accent)' }}>забравена парола</a>.
            </div>
          )}

          {valid === true && done && (
            <div className="alert alert-success">
              ✓ Паролата е зададена! Пренасочване към login...
            </div>
          )}

          {valid === true && !done && (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  Нова парола
                </label>
                <input
                  type="password" value={password} placeholder="мин. 6 символа"
                  onChange={e => setPassword(e.target.value)} required autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  Повтори паролата
                </label>
                <input
                  type="password" value={confirm} placeholder="••••••••"
                  onChange={e => setConfirm(e.target.value)} required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                disabled={loading}
              >
                {loading ? 'Запазване...' : 'Задай парола'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
