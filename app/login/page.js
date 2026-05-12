'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    router.push(data.redirect)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '1.5rem',
      background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 52, height: 52, background: 'var(--accent-lt)',
            borderRadius: 14, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.8">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Influencer Portal</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Влезте, за да видите вашите поръчки
          </p>
        </div>

        <form onSubmit={handleLogin} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>
              Потребителско име
            </label>
            <input
              type="text" value={username} placeholder="напр. maria_style"
              onChange={e => setUsername(e.target.value)} required autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>
              Парола
            </label>
            <input
              type="password" value={password} placeholder="••••••••"
              onChange={e => setPassword(e.target.value)} required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} disabled={loading}>
            {loading ? 'Влизане...' : 'Вход'}
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
            Нямате достъп? Свържете се с администратора.
          </p>
        </form>
      </div>
    </div>
  )
}
