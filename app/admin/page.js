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
}

export default function AdminPage() {
  const router = useRouter()
  const [influencers, setInfluencers] = useState([])
  const [tab, setTab]     = useState('list')
  const [form, setForm]   = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg]     = useState({ type: '', text: '' })
  const [syncStatus, setSyncStatus] = useState({})
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

  const load = async () => {
    const res = await fetch('/api/admin/influencers')
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    setInfluencers(await res.json())
  }

  useEffect(() => { load() }, []) // eslint-disable-line

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

    const res = await fetch('/api/admin/influencers', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }

    setMsg({ type: 'success', text: editId ? 'Инфлуенсърът е обновен.' : `${data.name} е добавен с код ${data.promo_code}.` })
    setForm(emptyForm)
    setEditId(null)
    load()
    setTimeout(() => setTab('list'), 1200)
  }

  const startEdit = (inf) => {
    setEditId(inf.id)
    setForm({
      name: inf.name, username: inf.username, password: '',
      promo_code: inf.promo_code, commission: inf.commission,
      platform: inf.platform || 'Instagram', email: inf.email || '',
      email_notifications: inf.email_notifications !== false,
      notes: inf.notes || '',
      profile_url: inf.profile_url || '',
      avatar_url:  inf.avatar_url  || '',
      banner_url:  inf.banner_url  || '',
    })
    setTab('form')
    setMsg({})
  }

  const toggleActive = async (inf) => {
    await fetch('/api/admin/influencers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inf.id, active: !inf.active }),
    })
    load()
  }

  const syncOne = async (id, full = false) => {
    const key = full ? `full_${id}` : id
    setSyncStatus(s => ({ ...s, [key]: 'syncing' }))
    const url = `/api/admin/sync?id=${id}${full ? '&full=true' : ''}`
    const res  = await fetch(url, { method: 'POST' })
    const data = await res.json()
    const result = data.results?.[0]
    setSyncStatus(s => ({ ...s, [key]: result?.error ? 'error' : 'done' }))
    if (!result?.error) load()
    setTimeout(() => setSyncStatus(s => ({ ...s, [key]: '' })), 3000)
  }

  const syncAll = async (full = false) => {
    const key = full ? 'fullAll' : 'all'
    setSyncStatus({ [key]: 'syncing' })
    await fetch(`/api/admin/sync${full ? '?full=true' : ''}`, { method: 'POST' })
    setSyncStatus({ [key]: 'done' })
    load()
    setTimeout(() => setSyncStatus({}), 3000)
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
          <button className="btn btn-sm" onClick={() => syncAll(false)} disabled={syncStatus.all === 'syncing'}>
            {syncStatus.all === 'syncing' ? '⟳ Синхронизиране...' : syncStatus.all === 'done' ? '✓ Готово' : '⟳ Sync нови'}
          </button>
          <button
            className="btn btn-sm"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
            onClick={() => { if (confirm('Ще изтрие ВСИЧКИ поръчки и ще ги вземе отново от Shopify. Продължи?')) syncAll(true) }}
            disabled={syncStatus.fullAll === 'syncing'}
            title="Изтрива поръчките от базата и ги вкарва наново с точни данни за отстъпка и доставка"
          >
            {syncStatus.fullAll === 'syncing' ? '⟳ Ре-синк...' : syncStatus.fullAll === 'done' ? '✓ Готово' : '↺ Пълен ре-синк'}
          </button>
          <button className="btn btn-sm" onClick={() => router.push('/admin/settings')} title="Брандинг настройки">⚙ Настройки</button>
          <button className="btn btn-sm btn-ghost" onClick={logout}>Изход</button>
        </div>
      </header>

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
                      <span className={`badge ${inf.active ? 'badge-green' : 'badge-gray'}`}>
                        {inf.active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => router.push(`/admin/view/${inf.id}`)} title="Виж изгледа на инфлуенсъра">👁</button>
                        <button className="btn btn-sm" onClick={() => startEdit(inf)} title="Редактиране">✎</button>
                        <button
                          className="btn btn-sm"
                          onClick={() => syncOne(inf.id, false)}
                          disabled={syncStatus[inf.id] === 'syncing'}
                          title="Sync само нови поръчки"
                        >
                          {syncStatus[inf.id] === 'syncing' ? '⟳' : syncStatus[inf.id] === 'done' ? '✓' : '⟳'}
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
                          onClick={() => { if (confirm(`Пълен ре-синк за ${inf.name}?`)) syncOne(inf.id, true) }}
                          disabled={syncStatus[`full_${inf.id}`] === 'syncing'}
                          title="Изтрива и ре-синква с точни данни за отстъпка и доставка"
                        >
                          {syncStatus[`full_${inf.id}`] === 'syncing' ? '⟳' : '↺'}
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(inf)} title={inf.active ? 'Деактивирай' : 'Активирай'}>
                          {inf.active ? '⏸' : '▶'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {influencers.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
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
              <div className=\"grid-2\">
                <div>
                  <label style={labelStyle}>Пълно име *</label>
                  <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Мария Иванова" required />
                </div>
                <div>
                  <label style={labelStyle}>Потр. име за вход *</label>
                  <input value={form.username} onChange={e => setField('username', e.target.value)} placeholder="maria_style" required />
                </div>
              </div>
              <div className=\"grid-2\">
                <div>
                  <label style={labelStyle}>{editId ? 'Нова парола (остави празно за без промяна)' : 'Парола *'}</label>
                  <input type="password" value={form.password} onChange={e => setField('password', e.target.value)} placeholder="••••••••" required={!editId} />
                </div>
                <div>
                  <label style={labelStyle}>Промокод Shopify *</label>
                  <input value={form.promo_code} onChange={e => setField('promo_code', e.target.value.toUpperCase())} placeholder="MARIA15" required style={{ textTransform: 'uppercase' }} />
                </div>
              </div>
              <div className=\"grid-2\">
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

              <div className=\"grid-2\">
                <div>
                  <label style={labelStyle}>Мейл адрес</label>
                  <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="maria@example.com" />
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
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Запазване...' : editId ? 'Обнови' : '+ Добави'}
                </button>
                {editId && (
                  <button type="button" className="btn" onClick={() => { setEditId(null); setForm(emptyForm); setMsg({}); setTab('list') }}>
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
