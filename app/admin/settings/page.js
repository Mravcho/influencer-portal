'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '../components/AdminShell'

export default function AdminSettings() {
  const router = useRouter()
  const [branding, setBranding] = useState({ logo_url: '', login_bg_url: '', default_banner_url: '' })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState({ logo: false, bg: false, banner: false })
  const [msg, setMsg]           = useState({ type: '', text: '' })

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => {
        if (r.status === 401 || r.status === 403) { router.push('/login'); return null }
        return r.json()
      })
      .then(d => {
        if (d) setBranding({
          logo_url:           d.logo_url           || '',
          login_bg_url:       d.login_bg_url       || '',
          default_banner_url: d.default_banner_url || '',
        })
      })
      .finally(() => setLoading(false))
  }, [router])

  const setField = (k, v) => setBranding(b => ({ ...b, [k]: v }))

  const uploadFile = async (file, kind) => {
    const stateKey = kind === 'logo' ? 'logo' : kind === 'banner' ? 'banner' : 'bg'
    setUploading(u => ({ ...u, [stateKey]: true }))
    setMsg({})

    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind === 'banner' ? 'default-banner' : kind)

    const res = await fetch('/api/admin/settings/upload', { method: 'POST', body: fd })
    const data = await res.json()
    setUploading(u => ({ ...u, [stateKey]: false }))

    if (!res.ok) {
      setMsg({ type: 'error', text: data.error || 'Грешка при качване' })
      return
    }

    if (kind === 'logo')   setField('logo_url', data.url)
    else if (kind === 'banner') setField('default_banner_url', data.url)
    else setField('login_bg_url', data.url)
  }

  const save = async () => {
    setSaving(true)
    setMsg({})
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logo_url:           branding.logo_url || null,
        login_bg_url:       branding.login_bg_url || null,
        default_banner_url: branding.default_banner_url || null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg({ type: 'error', text: data.error || 'Грешка' }); return }
    setMsg({ type: 'success', text: 'Настройките са запазени.' })
    setTimeout(() => setMsg({}), 2500)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Зареждане...</p>
    </div>
  )

  return (
    <AdminShell>
      <div className="main-container" style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 20, paddingTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Настройки</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Брандинг и визия</div>
        </div>
        {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {/* Logo */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Лого</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            Показва се над формата за вход и в горната лента на портала.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <div style={{
              width: 100, height: 100, borderRadius: 12,
              background: 'var(--bg)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Няма лого</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label className="btn btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                {uploading.logo ? '⟳ Качване...' : '📤 Качи ново'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], 'logo')}
                  disabled={uploading.logo}
                  style={{ display: 'none' }}
                />
              </label>
              {branding.logo_url && (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ marginLeft: 8, color: 'var(--danger)' }}
                  onClick={() => setField('logo_url', '')}
                >
                  Премахни
                </button>
              )}
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                PNG / SVG препоръчително, прозрачен фон, макс 5 MB.
              </p>
            </div>
          </div>

          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Или поставете URL директно:
          </label>
          <input
            value={branding.logo_url}
            onChange={e => setField('logo_url', e.target.value)}
            placeholder="https://..."
          />
        </div>

        {/* Login background */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Снимка за login страницата</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            Голяма снимка, която се показва в лявата част на login страницата.
          </p>

          <div style={{
            width: '100%', height: 200, borderRadius: 12,
            background: 'var(--bg)', border: '1px solid var(--border)',
            backgroundImage: branding.login_bg_url ? `url(${branding.login_bg_url})` : 'none',
            backgroundSize: 'cover', backgroundPosition: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12, overflow: 'hidden',
          }}>
            {!branding.login_bg_url && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Няма снимка</span>}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <label className="btn btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              {uploading.bg ? '⟳ Качване...' : '📤 Качи ново'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], 'bg')}
                disabled={uploading.bg}
                style={{ display: 'none' }}
              />
            </label>
            {branding.login_bg_url && (
              <button
                className="btn btn-sm btn-ghost"
                style={{ color: 'var(--danger)' }}
                onClick={() => setField('login_bg_url', '')}
              >
                Премахни
              </button>
            )}
          </div>

          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Или поставете URL директно:
          </label>
          <input
            value={branding.login_bg_url}
            onChange={e => setField('login_bg_url', e.target.value)}
            placeholder="https://..."
          />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Препоръчителни размери: 1200×1800 px или по-голяма. Макс 5 MB.
          </p>
        </div>

        {/* Default banner за всички инфлуенсъри */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Default снимка за инфлуенсърски dashboard</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            Тази снимка ще се показва на топа на dashboard-а за <strong>всички инфлуенсъри</strong>, които нямат собствен banner. Индивидуалният banner (от формата за редактиране на инфлуенсър) винаги има приоритет.
          </p>

          <div style={{
            width: '100%', height: 200, borderRadius: 12,
            background: 'var(--bg)', border: '1px solid var(--border)',
            backgroundImage: branding.default_banner_url ? `url(${branding.default_banner_url})` : 'none',
            backgroundSize: 'cover', backgroundPosition: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12, overflow: 'hidden',
          }}>
            {!branding.default_banner_url && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Няма снимка</span>}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <label className="btn btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              {uploading.banner ? '⟳ Качване...' : '📤 Качи ново'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], 'banner')}
                disabled={uploading.banner}
                style={{ display: 'none' }}
              />
            </label>
            {branding.default_banner_url && (
              <button
                className="btn btn-sm btn-ghost"
                style={{ color: 'var(--danger)' }}
                onClick={() => setField('default_banner_url', '')}
              >Премахни</button>
            )}
          </div>

          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Или поставете URL директно:
          </label>
          <input
            value={branding.default_banner_url}
            onChange={e => setField('default_banner_url', e.target.value)}
            placeholder="https://..."
          />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Препоръчителни размери: 1600×500 px. Макс 5 MB.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Запазване...' : '💾 Запази настройките'}
          </button>
          <button className="btn" onClick={() => router.push('/admin')}>Отказ</button>
        </div>
      </div>
    </AdminShell>
  )
}
