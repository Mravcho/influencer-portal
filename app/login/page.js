'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [branding, setBranding] = useState({ logo_url: null, login_bg_url: null })

  useEffect(() => {
    fetch('/api/public/branding')
      .then(r => r.json())
      .then(d => setBranding(d))
      .catch(() => {})
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/login', {
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
      minHeight: '100vh', display: 'flex', background: 'var(--bg)',
    }}>
      {/* Лява половина — голяма снимка */}
      <div className="login-bg" style={{
        flex: 1.2, position: 'relative', overflow: 'hidden',
        backgroundImage: branding.login_bg_url
          ? `url(${branding.login_bg_url})`
          : 'linear-gradient(135deg, #1D9E75 0%, #0F6E56 100%)',
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        {/* Лек overlay за по-добра четимост ако има текст */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.35) 100%)',
        }} />
        <div style={{
          position: 'absolute', bottom: 40, left: 40, right: 40,
          color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.4)',
        }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 }}>
            Влез в портала
          </h2>
          <p style={{ fontSize: 15, opacity: .9 }}>
            Виж своите поръчки и комисионна в реално време.
          </p>
        </div>
      </div>

      {/* Дясна половина — лого + login форма */}
      <div className="login-form-side" style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem', background: 'var(--surface)',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* Лого */}
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt="Logo"
                style={{ maxHeight: 80, maxWidth: 220, marginBottom: 16, objectFit: 'contain' }}
              />
            ) : (
              <div style={{
                width: 64, height: 64, background: 'var(--accent-lt)',
                borderRadius: 16, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.8">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
            )}
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>RealFood Influencer Portal</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
              Влезте, за да видите вашите поръчки
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Потребителско име
              </label>
              <input
                type="text" value={username} placeholder="напр. maria_style"
                onChange={e => setUsername(e.target.value)} required autoFocus
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Парола
              </label>
              <input
                type="password" value={password} placeholder="••••••••"
                onChange={e => setPassword(e.target.value)} required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? 'Влизане...' : 'Вход'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              Нямате достъп? Свържете се с администратора.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
