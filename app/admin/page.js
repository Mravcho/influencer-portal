'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import StatsCharts from './components/StatsCharts'
import MonthlyLeaderboard from './components/MonthlyLeaderboard'

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Друга']

const emptyForm = {
  name: '', username: '', password: '', promo_code: '', commission: 10,
  platform: 'Instagram', email: '', email_notifications: true, notes: '',
  profile_url: '', avatar_url: '', banner_url: '',
  send_password_reset: false,
  exclude_from_leaderboard: false,
}

export default function AdminPage() {
  const router = useRouter()
  const [influencers, setInfluencers] = useState([])
  const [tab, setTab]     = useState('list')
  const [form, setForm]   = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [originalEmail, setOriginalEmail] = useState('')
  const [allProducts, setAllProducts]               = useState([])
  const [assignedProductIds, setAssignedProductIds] = useState(new Set())
  const [msg, setMsg]     = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [pendingPayouts, setPendingPayouts]      = useState(0)
  const [pendingApplications, setPendingApplications] = useState(0)
  const [pendingProductRequests, setPendingProductRequests] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const load = async () => {
    const res = await fetch('/api/admin/influencers')
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    setInfluencers(await res.json())
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  // Pending payouts + applications count за badges
  useEffect(() => {
    const fetchPending = () => {
      fetch('/api/admin/payouts?count=pending')
        .then(r => r.json())
        .then(d => setPendingPayouts(d.count || 0))
        .catch(() => {})
      fetch('/api/admin/applications?count=pending')
        .then(r => r.json())
        .then(d => setPendingApplications(d.count || 0))
        .catch(() => {})
      fetch('/api/admin/product-requests?count=pending')
        .then(r => r.json())
        .then(d => setPendingProductRequests(d.count || 0))
        .catch(() => {})
    }
    fetchPending()
    const interval = setInterval(fetchPending, 30_000)
    return () => clearInterval(interval)
  }, [])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const uploadImage = async (file, kind) => {
    const setter = kind === 'banner' ? setBannerUploading : setAvatarUploading
    setter(true)
    setMsg({})

    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind === 'banner' ? 'banners' : 'avatars')

    const res = await fetch('/api/admin/settings/upload', { method: 'POST', body: fd })
    const data = await res.json()
    setter(false)

    if (!res.ok) {
      setMsg({ type: 'error', text: data.error || 'Грешка при качване' })
      return
    }

    if (kind === 'banner') setField('banner_url', data.url)
    else setField('avatar_url', data.url)
  }

  const fetchAvatar = async () => {
    if (!form.profile_url) return
    setAvatarLoading(true)
    const res = await fetch('/api/admin/fetch-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: form.profile_url }),
    })
    const data = await res.json()
    setAvatarLoading(false)
    if (data.avatarUrl) setField('avatar_url', data.avatarUrl)
    else setMsg({ type: 'error', text: data.error || 'Не намерих снимка' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg({})

    const method = editId ? 'PATCH' : 'POST'
    const body   = editId ? { id: editId, ...form } : form

    // Hard timeout: не оставяме бутона да се блокира ако сървърът виси
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)

    try {
      const res = await fetch('/api/admin/influencers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || `Грешка (${res.status})` })
        return
      }

      const resetSent = editId && form.send_password_reset && form.email && form.email !== originalEmail
      setMsg({
        type: 'success',
        text: editId
          ? (resetSent ? 'Инфлуенсърът е обновен. Изпратен е welcome мейл на новия адрес.' : 'Инфлуенсърът е обновен.')
          : `${data.name} е добавен с код ${data.promo_code}.`,
      })
      setForm(emptyForm)
      setEditId(null)
      setOriginalEmail('')
      load()
      setTimeout(() => setTab('list'), 1200)
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'Заявката се забави твърде много. Опитай отново.'
        : `Мрежова грешка: ${err.message || 'неизвестна'}`
      setMsg({ type: 'error', text: msg })
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  const startEdit = async (inf) => {
    setEditId(inf.id)
    setOriginalEmail(inf.email || '')
    setForm({
      name: inf.name, username: inf.username, password: '',
      promo_code: inf.promo_code, commission: inf.commission,
      platform: inf.platform || 'Instagram', email: inf.email || '',
      email_notifications: inf.email_notifications !== false,
      notes: inf.notes || '',
      profile_url: inf.profile_url || '',
      avatar_url:  inf.avatar_url  || '',
      banner_url:  inf.banner_url  || '',
      send_password_reset: false,
      exclude_from_leaderboard: inf.exclude_from_leaderboard === true,
    })
    setTab('form')
    setMsg({})

    // Зареждаме каталога и индивидуалните присвоявания за този инфлуенсър
    const [prodRes, assignRes] = await Promise.all([
      fetch('/api/admin/request-products').then(r => r.ok ? r.json() : []),
      fetch(`/api/admin/influencer-products?influencer_id=${inf.id}`).then(r => r.ok ? r.json() : []),
    ])
    setAllProducts(prodRes || [])
    setAssignedProductIds(new Set(assignRes || []))
  }

  const toggleProductAccess = async (productId, willAssign) => {
    if (willAssign) {
      await fetch('/api/admin/influencer-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ influencer_id: editId, request_product_id: productId }),
      })
      setAssignedProductIds(s => new Set(s).add(productId))
    } else {
      await fetch(`/api/admin/influencer-products?influencer_id=${editId}&request_product_id=${productId}`, {
        method: 'DELETE',
      })
      setAssignedProductIds(s => { const n = new Set(s); n.delete(productId); return n })
    }
  }

  const toggleActive = async (inf) => {
    await fetch('/api/admin/influencers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inf.id, active: !inf.active }),
    })
    load()
  }

  const sendPasswordResetLink = async (inf) => {
    if (!inf.email) {
      alert(`${inf.name} няма записан имейл. Добави първо.`)
      return
    }
    if (!confirm(`Да изпратя линк за нова парола на ${inf.email}?`)) return
    const res = await fetch('/api/admin/influencers/send-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inf.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Грешка при изпращане')
      return
    }
    alert(`Линк за нова парола е изпратен на ${data.sentTo}.`)
  }

  const deleteInfluencer = async (inf) => {
    const ok = confirm(
      `Сигурен ли си че искаш да ИЗТРИЕШ инфлуенсъра "${inf.name}"?\n\n` +
      `Това ще премахне:\n` +
      `• ${inf.orderCount || 0} поръчки\n` +
      `• Всички сесии и история\n\n` +
      `Действието е НЕОБРАТИМО.`
    )
    if (!ok) return
    const res = await fetch(`/api/admin/influencers?id=${inf.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Грешка при изтриване')
      return
    }
    load()
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`
  const totOrders = influencers.reduce((s, i) => s + (i.orderCount || 0), 0)
  const totComm   = influencers.reduce((s, i) => s + (i.totalCommission || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--info-lt)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Admin панел</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Управление на инфлуенсъри</div>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-sm"
            onClick={() => router.push('/admin/applications')}
            title="Заявки за инфлуенсъри"
            style={{ position: 'relative' }}
          >
            📨 Заявки
            {pendingApplications > 0 && (
              <span style={{
                position: 'absolute',
                top: -6, right: -6,
                background: '#dc2626',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                padding: '0 5px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--surface)',
                lineHeight: 1,
              }}>{pendingApplications}</span>
            )}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => router.push('/admin/payouts')}
            title="Заявки за изплащане"
            style={{ position: 'relative' }}
          >
            💰 Изплащане
            {pendingPayouts > 0 && (
              <span style={{
                position: 'absolute',
                top: -6, right: -6,
                background: '#dc2626',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                padding: '0 5px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--surface)',
                lineHeight: 1,
              }}>{pendingPayouts}</span>
            )}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => router.push('/admin/product-requests')}
            title="Заявки за продукти от инфлуенсъри"
            style={{ position: 'relative' }}
          >
            🎁 Заявки
            {pendingProductRequests > 0 && (
              <span style={{
                position: 'absolute',
                top: -6, right: -6,
                background: '#dc2626',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                padding: '0 5px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--surface)',
                lineHeight: 1,
              }}>{pendingProductRequests}</span>
            )}
          </button>
          <button className="btn btn-sm" onClick={() => router.push('/admin/orders')} title="Всички поръчки през промокод">📋 Поръчки</button>
          <button className="btn btn-sm" onClick={() => router.push('/admin/request-products')} title="Каталог за заявки">🎁 Каталог</button>
          <button className="btn btn-sm" onClick={() => router.push('/admin/sessions')} title="История на влизанията">👤 Сесии</button>
          <button className="btn btn-sm" onClick={() => router.push('/admin/settings')} title="Брандинг настройки">⚙ Настройки</button>
          <button className="btn btn-sm btn-ghost" onClick={logout}>Изход</button>
        </div>

        {/* Hamburger — само на мобилен */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Меню"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="7"  x2="20" y2="7"  />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
          {(pendingApplications + pendingPayouts + pendingProductRequests) > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: '#dc2626', color: '#fff',
              fontSize: 10, fontWeight: 700,
              minWidth: 16, height: 16, borderRadius: 8,
              padding: '0 4px', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--surface)', lineHeight: 1,
            }}>{pendingApplications + pendingPayouts + pendingProductRequests}</span>
          )}
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-drawer">
            <div className="mobile-drawer-header">
              <div style={{ fontWeight: 700, fontSize: 14 }}>Меню</div>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Затвори"
                style={{ fontSize: 18, padding: '4px 10px' }}
              >✕</button>
            </div>

            {[
              { icon: '📨', label: 'Заявки за инфлуенсъри', path: '/admin/applications', count: pendingApplications },
              { icon: '💰', label: 'Изплащане',             path: '/admin/payouts',      count: pendingPayouts },
              { icon: '🎁', label: 'Заявки за продукти',    path: '/admin/product-requests', count: pendingProductRequests },
              { icon: '📋', label: 'Всички поръчки',        path: '/admin/orders' },
              { icon: '🎁', label: 'Каталог продукти',       path: '/admin/request-products' },
              { icon: '👤', label: 'Сесии',                  path: '/admin/sessions' },
              { icon: '⚙',  label: 'Настройки',              path: '/admin/settings' },
            ].map(item => (
              <button
                key={item.path}
                className="mobile-drawer-item"
                onClick={() => { setMobileMenuOpen(false); router.push(item.path) }}
              >
                <span className="icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.count > 0 && <span className="badge-count">{item.count}</span>}
              </button>
            ))}

            <button
              className="mobile-drawer-item"
              onClick={() => { setMobileMenuOpen(false); logout() }}
              style={{ marginTop: 12, color: '#dc2626' }}
            >
              <span className="icon">↪</span>
              <span>Изход</span>
            </button>
          </div>
        </>
      )}

      <main className="main-container">
        {/* Monthly leaderboard — най-отгоре */}
        <MonthlyLeaderboard />

        {/* Summary metrics */}
        <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
          {[
            { label: 'Инфлуенсъри', value: influencers.length },
            { label: 'Общо поръчки', value: totOrders },
            { label: 'Дължими комисионни', value: fmtEur(totComm) },
          ].map(m => (
            <div key={m.label} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-value">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <StatsCharts />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          {[['list', 'Инфлуенсъри'], ['form', editId ? 'Редактиране' : 'Добави нов']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); if (id === 'form' && !editId) { setForm(emptyForm); setMsg({}) } }}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                border: 'none', background: 'none', fontFamily: 'inherit',
                color: tab === id ? 'var(--accent)' : 'var(--muted)',
                borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
              }}
            >{label}</button>
          ))}
        </div>

        {tab === 'list' && (
          <div className="card table-wrap">
            <table style={{ minWidth: 760 }}>
              <thead><tr>
                <th>Инфлуенсър</th>
                <th>Промокод</th>
                <th>Кликове 90д</th>
                <th>Поръчки</th>
                <th>Приход</th>
                <th>Ком. %</th>
                <th>Дължимо</th>
                <th>Мейл</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr></thead>
              <tbody>
                {influencers.map(inf => (
                  <tr key={inf.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {inf.avatar_url ? (
                          <img
                            src={inf.avatar_url}
                            alt={inf.name}
                            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'var(--accent-lt)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, color: 'var(--accent-dk)', flexShrink: 0,
                          }}>
                            {inf.name?.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{inf.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {inf.username} · {' '}
                            {inf.profile_url ? (
                              <a href={inf.profile_url} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--accent)' }}>
                                {inf.platform}
                              </a>
                            ) : inf.platform}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><code style={{ background: 'var(--bg)', padding: '2px 7px', borderRadius: 5, fontSize: 12 }}>{inf.promo_code}</code></td>
                    <td style={{ fontWeight: 600, color: inf.clickCount > 0 ? 'var(--accent)' : 'var(--muted)' }}>
                      {inf.clickCount || 0}
                    </td>
                    <td style={{ fontWeight: 600 }}>{inf.orderCount || 0}</td>
                    <td>{fmtEur(inf.totalRevenue)}</td>
                    <td>{inf.commission}%</td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmtEur(inf.totalCommission)}</td>
                    <td>
                      {inf.email ? (
                        <span title={inf.email} style={{ fontSize: 13 }}>
                          {inf.email_notifications !== false ? '📧' : '🔕'}
                          {' '}
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {inf.email_notifications !== false ? 'вкл.' : 'изкл.'}
                          </span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#ccc' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <span className={`badge ${inf.active ? 'badge-green' : 'badge-gray'}`}>
                          {inf.active ? 'Активен' : 'Неактивен'}
                        </span>
                        {inf.exclude_from_leaderboard && (
                          <span
                            className="badge"
                            title="Не участва в класацията"
                            style={{ background: '#fee2e2', color: '#991b1b', fontSize: 10 }}
                          >
                            🚫 Извън класация
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => router.push(`/admin/view/${inf.id}`)} title="Виж изгледа на инфлуенсъра">👁</button>
                        <button className="btn btn-sm" onClick={() => startEdit(inf)} title="Редактиране">✎</button>
                        <button
                          className="btn btn-sm"
                          onClick={() => sendPasswordResetLink(inf)}
                          title="Прати линк за нова парола"
                          disabled={!inf.email}
                          style={!inf.email ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                        >🔑</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(inf)} title={inf.active ? 'Деактивирай' : 'Активирай'}>
                          {inf.active ? '⏸' : '▶'}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => deleteInfluencer(inf)}
                          title="Изтрий инфлуенсъра (необратимо)"
                        >🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {influencers.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                    Няма добавени инфлуенсъри.{' '}
                    <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setTab('form')}>Добави първия</button>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'form' && (
          <div className="card" style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: '1rem' }}>
              {editId ? 'Редактиране на инфлуенсър' : 'Нов инфлуенсър'}
            </h2>
            {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-2">
                <div>
                  <label style={labelStyle}>Пълно име *</label>
                  <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Мария Иванова" required />
                </div>
                <div>
                  <label style={labelStyle}>Потр. име за вход *</label>
                  <input value={form.username} onChange={e => setField('username', e.target.value)} placeholder="maria_style" required />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label style={labelStyle}>
                    {editId ? 'Нова парола (остави празно за без промяна)' : 'Парола (опц. — иначе инфлуенсърът ще си зададе)'}
                  </label>
                  <input
                    type="password" value={form.password}
                    onChange={e => setField('password', e.target.value)}
                    placeholder={editId ? '••••••••' : 'Остави празно за линк по мейл'}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Промокод Shopify *</label>
                  <input value={form.promo_code} onChange={e => setField('promo_code', e.target.value.toUpperCase())} placeholder="MARIA15" required style={{ textTransform: 'uppercase' }} />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label style={labelStyle}>Комисионна (%)</label>
                  <input type="number" min="0" max="100" step="0.5" value={form.commission} onChange={e => setField('commission', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Платформа</label>
                  <select value={form.platform} onChange={e => setField('platform', e.target.value)}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Профилен линк + авто-снимка */}
              <div>
                <label style={labelStyle}>Линк към профил в социалните мрежи</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={form.profile_url}
                    onChange={e => setField('profile_url', e.target.value)}
                    placeholder="https://www.instagram.com/maria_style"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={fetchAvatar}
                    disabled={avatarLoading || !form.profile_url}
                    title="Вземи снимка от профила"
                  >
                    {avatarLoading ? '⟳' : '📷 Снимка'}
                  </button>
                </div>
              </div>

              {/* Avatar — авто URL или upload от компютъра */}
              <div>
                <label style={labelStyle}>Профилна снимка</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                  {form.avatar_url ? (
                    <img
                      src={form.avatar_url}
                      alt="avatar"
                      style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: 'var(--accent-lt)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: 'var(--accent-dk)',
                    }}>{form.name?.slice(0, 2).toUpperCase() || '??'}</div>
                  )}
                  <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                    <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                      {avatarUploading ? '⟳' : '📤 От компютъра'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], 'avatar')}
                        disabled={avatarUploading}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {form.avatar_url && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setField('avatar_url', '')}
                      >Премахни</button>
                    )}
                  </div>
                </div>
                <input
                  value={form.avatar_url}
                  onChange={e => setField('avatar_url', e.target.value)}
                  placeholder="Или поставете URL директно..."
                  style={{ fontSize: 12 }}
                />
              </div>

              {/* Banner — голяма снимка на топа на dashboard-а */}
              <div>
                <label style={labelStyle}>Голяма снимка за dashboard-а (banner)</label>
                <div style={{
                  width: '100%', height: 100, borderRadius: 10,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  backgroundImage: form.banner_url ? `url(${form.banner_url})` : 'none',
                  backgroundSize: 'cover', backgroundPosition: 'center',
                  marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {!form.banner_url && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Няма снимка</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                    {bannerUploading ? '⟳ Качване...' : '📤 Качи снимка'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], 'banner')}
                      disabled={bannerUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {form.banner_url && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => setField('banner_url', '')}
                    >Премахни</button>
                  )}
                </div>
                <input
                  value={form.banner_url}
                  onChange={e => setField('banner_url', e.target.value)}
                  placeholder="Или поставете URL директно..."
                  style={{ fontSize: 12 }}
                />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Препоръчителни размери: 1600×500 px. Макс 5 MB.
                </p>
              </div>

              <div className="grid-2">
                <div>
                  <label style={labelStyle}>Мейл адрес</label>
                  <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="maria@example.com" />
                  {editId && form.email && form.email !== originalEmail && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, marginTop: 6, color: 'var(--accent-dk)' }}>
                      <input
                        type="checkbox"
                        checked={form.send_password_reset}
                        onChange={e => setField('send_password_reset', e.target.checked)}
                        style={{ width: 'auto', cursor: 'pointer' }}
                      />
                      Прати welcome мейл на новия адрес
                    </label>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.email_notifications}
                      onChange={e => setField('email_notifications', e.target.checked)}
                      style={{ width: 'auto', cursor: 'pointer' }}
                    />
                    Мейл при нова поръчка
                  </label>
                  {!form.email && form.email_notifications && (
                    <p style={{ fontSize: 11, color: 'var(--warn-dk)', marginTop: 4 }}>
                      ⚠ Добави мейл адрес за да работи нотификацията
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Бележки (само за admin)</label>
                <input value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Договор №, контакт..." />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.exclude_from_leaderboard}
                    onChange={e => setField('exclude_from_leaderboard', e.target.checked)}
                    style={{ width: 'auto', cursor: 'pointer' }}
                  />
                  🚫 Изключи от класацията
                </label>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Инфлуенсърът работи нормално, но не се показва в месечната класация (и при админ, и при инфлуенсърите).
                </p>
              </div>

              {editId && allProducts.length > 0 && (
                <div>
                  <label style={labelStyle}>🎁 Достъпни продукти за заявка</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {allProducts.filter(p => p.is_global && p.active).length > 0 && (
                      <div style={{
                        background: 'var(--bg)', padding: '8px 10px', borderRadius: 6, fontSize: 12,
                      }}>
                        <strong>Глобални</strong> (достъпни на всички):{' '}
                        {allProducts.filter(p => p.is_global && p.active).map(p => p.name).join(', ')}
                      </div>
                    )}
                    {allProducts.filter(p => !p.is_global && p.active).length === 0 && (
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        Няма индивидуални продукти. Добави такива в{' '}
                        <a href="/admin/request-products" style={{ color: 'var(--accent)' }}>🎁 Каталог</a> с „Индивидуално".
                      </p>
                    )}
                    {allProducts.filter(p => !p.is_global && p.active).map(p => (
                      <label key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '6px 10px', background: 'var(--bg)', borderRadius: 6,
                        fontSize: 13, cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={assignedProductIds.has(p.id)}
                          onChange={e => toggleProductAccess(p.id, e.target.checked)}
                          style={{ width: 'auto', cursor: 'pointer' }}
                        />
                        {p.image_url && (
                          <img src={p.image_url} alt={p.name}
                            style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
                        )}
                        <span style={{ flex: 1 }}>{p.name}</span>
                        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                          {p.request_interval_days}д · {p.free_quantity} безпл · -{p.paid_discount_pct}%
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Запазване...' : editId ? 'Обнови' : '+ Добави'}
                </button>
                {editId && (
                  <button type="button" className="btn" onClick={() => { setEditId(null); setOriginalEmail(''); setForm(emptyForm); setMsg({}); setTab('list') }}>
                    Отказ
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }
