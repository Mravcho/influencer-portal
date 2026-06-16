'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [branding, setBranding] = useState({ logo_url: null, login_bg_url: null, terms_url: null })
  const [forgotMode, setForgotMode]   = useState(false)
  const [forgotIdent, setForgotIdent] = useState('')
  const [forgotSent, setForgotSent]   = useState(false)

  const [applyMode, setApplyMode] = useState(false)
  const [applySent, setApplySent] = useState(false)
  const [applyForm, setApplyForm] = useState({
    full_name: '', email: '', phone: '',
    instagram_url: '', tiktok_url: '', facebook_url: '', youtube_url: '', other_url: '',
    motivation: '', terms_accepted: false,
  })
  const setApplyField = (k, v) => setApplyForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    fetch('/api/public/branding')
      .then(r => r.json())
      .then(d => setBranding(d))
      .catch(() => {})
  }, [])

  const submitForgot = async (e) => {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: forgotIdent }),
    })
    setLoading(false)
    setForgotSent(true)
  }

  const submitApplication = async (e) => {
    e.preventDefault()
    setError('')
    if (!applyForm.instagram_url && !applyForm.tiktok_url && !applyForm.facebook_url && !applyForm.youtube_url && !applyForm.other_url) {
      setError('Моля въведи поне един линк към соц. мрежа')
      return
    }
    if (branding.terms_url && !applyForm.terms_accepted) {
      setError('Моля приеми Общите условия')
      return
    }
    setLoading(true)
    const res = await fetch('/api/auth/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(applyForm),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Грешка'); return }
    setApplySent(true)
  }

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
    <div className="login-shell">
      {/* Лява половина — голяма снимка */}
      <div className="login-bg" style={{
        flex: 1.2, position: 'relative', overflow: 'hidden',
        backgroundImage: branding.login_bg_url
          ? `url(${branding.login_bg_url})`
          : 'linear-gradient(135deg, #1D9E75 0%, #0F6E56 100%)',
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        {/* Силен gradient overlay долу — гарантира четимост на текста */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,.55) 80%, rgba(0,0,0,.85) 100%)',
        }} />
        <div style={{
          position: 'absolute', bottom: 40, left: 40, right: 40,
          color: '#fff',
          textShadow: '0 2px 12px rgba(0,0,0,.85), 0 1px 4px rgba(0,0,0,.5)',
        }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 }}>
            Влез в портала
          </h2>
          <p style={{ fontSize: 15, opacity: .95 }}>
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

          {!forgotMode && !applyMode && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  Потребителско име или имейл
                </label>
                <input
                  type="text" value={username} placeholder="maria_style или maria@example.com"
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

              <button
                type="button"
                onClick={() => { setForgotMode(true); setForgotSent(false); setForgotIdent(username) }}
                style={{
                  background: 'none', border: 'none', color: 'var(--accent)',
                  fontSize: 12, cursor: 'pointer', padding: 4, fontFamily: 'inherit',
                  textDecoration: 'underline',
                }}
              >
                Забравена парола?
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>или</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <button
                type="button"
                onClick={() => { setApplyMode(true); setApplySent(false); setError('') }}
                className="btn"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                ✨ Кандидатствай като инфлуенсър
              </button>
            </form>
          )}

          {applyMode && (
            <form onSubmit={submitApplication} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {applySent ? (
                <>
                  <div className="alert alert-success" style={{ marginBottom: 0 }}>
                    Заявката ти е получена! Ще те свържем по имейл скоро.
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => { setApplyMode(false); setApplySent(false) }}
                    style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                  >← Назад към вход</button>
                </>
              ) : (
                <>
                  <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>Кандидатствай</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Попълни формата — ще се свържем с теб скоро.
                  </p>

                  {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}

                  <input
                    type="text" placeholder="Име и фамилия *" required
                    value={applyForm.full_name}
                    onChange={e => setApplyField('full_name', e.target.value)}
                  />
                  <input
                    type="email" placeholder="Имейл *" required
                    value={applyForm.email}
                    onChange={e => setApplyField('email', e.target.value)}
                  />
                  <input
                    type="tel" placeholder="Телефон *" required
                    value={applyForm.phone}
                    onChange={e => setApplyField('phone', e.target.value)}
                  />

                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Поне един линк към твой профил в социалните мрежи:
                  </div>
                  <input
                    type="url" placeholder="Instagram линк"
                    value={applyForm.instagram_url}
                    onChange={e => setApplyField('instagram_url', e.target.value)}
                  />
                  <input
                    type="url" placeholder="TikTok линк"
                    value={applyForm.tiktok_url}
                    onChange={e => setApplyField('tiktok_url', e.target.value)}
                  />
                  <input
                    type="url" placeholder="Facebook линк"
                    value={applyForm.facebook_url}
                    onChange={e => setApplyField('facebook_url', e.target.value)}
                  />
                  <input
                    type="url" placeholder="YouTube линк"
                    value={applyForm.youtube_url}
                    onChange={e => setApplyField('youtube_url', e.target.value)}
                  />
                  <input
                    type="url" placeholder="Друг линк (по желание)"
                    value={applyForm.other_url}
                    onChange={e => setApplyField('other_url', e.target.value)}
                  />

                  <textarea
                    placeholder="Защо искаш да си инфлуенсър за RealFood? (кратко мотивационно обяснение)"
                    value={applyForm.motivation}
                    onChange={e => setApplyField('motivation', e.target.value)}
                    rows={4}
                    style={{ resize: 'vertical', fontFamily: 'inherit', minHeight: 80 }}
                  />

                  {branding.terms_url && (
                    <label style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      fontSize: 13, color: 'var(--text)', cursor: 'pointer', marginTop: 4,
                    }}>
                      <input
                        type="checkbox"
                        checked={applyForm.terms_accepted}
                        onChange={e => setApplyField('terms_accepted', e.target.checked)}
                        style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <span>
                        Съгласявам се с{' '}
                        <a
                          href="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                        >
                          Общите условия
                        </a>
                        {' '}*
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 4 }}
                    disabled={loading}
                  >
                    {loading ? 'Изпращане...' : 'Изпрати заявка'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setApplyMode(false); setError('') }}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >← Назад</button>
                </>
              )}
            </form>
          )}

          {forgotMode && (
            <form onSubmit={submitForgot} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {forgotSent ? (
                <>
                  <div className="alert alert-success" style={{ marginBottom: 0 }}>
                    Ако този акаунт съществува, изпратихме линк за смяна на парола на регистрирания имейл адрес. Провери и спам папката.
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => { setForgotMode(false); setForgotSent(false) }}
                    style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                  >← Назад към вход</button>
                </>
              ) : (
                <>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>Забравена парола</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Въведи потребителско име или имейл — ще получиш линк за смяна.
                  </p>
                  <input
                    type="text" value={forgotIdent}
                    onChange={e => setForgotIdent(e.target.value)}
                    placeholder="username или email" required autoFocus
                  />
                  <button
                    type="submit" className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                    disabled={loading}
                  >{loading ? 'Изпращане...' : 'Изпрати линк'}</button>
                  <button
                    type="button" className="btn btn-ghost"
                    onClick={() => setForgotMode(false)}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >Отказ</button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
