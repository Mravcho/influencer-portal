'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { bg } from 'date-fns/locale'
import InfluencerLeaderboard from '@/app/dashboard/components/InfluencerLeaderboard'
import PayoutWidget from '@/app/dashboard/components/PayoutWidget'
import ShareLinksWidget from '@/app/dashboard/components/ShareLinksWidget'
import CampaignCard from '@/app/dashboard/components/CampaignCard'
import ProductRequestsWidget from '@/app/dashboard/components/ProductRequestsWidget'
import AdminShell from '../../components/AdminShell'

function ymd(d) { return format(d, 'yyyy-MM-dd') }

function getTimeGreeting() {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Добро утро,'
  if (h >= 12 && h < 18) return 'Добър ден,'
  if (h >= 18 && h < 23) return 'Добър вечер,'
  return 'Здравей,'
}

function buildShortcuts() {
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const lastMonthDate  = subMonths(now, 1)
  const lastMonthStart = startOfMonth(lastMonthDate)
  const lastMonthEnd   = endOfMonth(lastMonthDate)
  return [
    { key: 'all', label: 'Всичко',     from: '', to: '' },
    { key: '7',   label: '7 дни',       days: 7 },
    { key: '30',  label: '30 дни',      days: 30 },
    { key: 'tm',  label: 'Този месец',  from: ymd(thisMonthStart), to: ymd(now) },
    { key: 'lm',  label: 'Минал месец', from: ymd(lastMonthStart), to: ymd(lastMonthEnd) },
  ]
}

export default function AdminInfluencerView() {
  const router = useRouter()
  const { id } = useParams()

  const [influencer, setInfluencer] = useState(null)
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [activity, setActivity]     = useState(null)
  const [activeShortcut, setActiveShortcut] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  const shortcuts = useMemo(() => buildShortcuts(), [])

  useEffect(() => {
    fetch('/api/admin/influencers')
      .then(r => r.json())
      .then(list => {
        const found = list.find(i => i.id === id)
        if (!found) { router.push('/admin'); return }
        setInfluencer(found)
      })
      .catch(() => router.push('/admin'))
  }, [id, router])

  const load = useCallback(async ({ days, from, to }) => {
    if (!id) return
    setLoading(true)
    const params = new URLSearchParams({ viewId: id })
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    if (!from && !to && days) params.set('days', String(days))
    const res = await fetch(`/api/dashboard/orders?${params.toString()}`, { cache: 'no-store' })
    if (res.status === 401 || res.status === 403) { router.push('/admin'); return }
    const json = await res.json()
    setData(json)
    setLoading(false)
  }, [id, router])

  useEffect(() => { if (id) load({ days: 0 }) }, [load, id])

  useEffect(() => {
    if (!id) return
    fetch(`/api/admin/influencers/${id}/activity`)
      .then(r => r.ok ? r.json() : null)
      .then(setActivity)
      .catch(() => {})
  }, [id])

  const applyShortcut = (sc) => {
    setActiveShortcut(sc.key)
    if (sc.days) {
      setFrom(''); setTo('')
      load({ days: sc.days })
    } else {
      setFrom(sc.from); setTo(sc.to)
      load({ from: sc.from, to: sc.to })
    }
  }

  const applyCustom = () => {
    if (!from && !to) return
    setActiveShortcut('custom')
    load({ from, to })
  }

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMM yyyy', { locale: bg }) } catch { return iso }
  }
  const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`

  if (!influencer || (loading && !data)) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Зареждане...</p>
    </div>
  )

  const { orders = [], stats = {}, topProducts = [], commission = influencer?.commission || 0, bannerUrl = null, currentMonth = {} } = data || {}
  const campaignOrders = orders.filter(o => o.campaign_id)
  const heroBanner = bannerUrl || influencer?.banner_url || null
  const monthLabel = format(new Date(), 'LLLL', { locale: bg })

  return (
    <AdminShell>
      <div className="main-container">
        {/* Малък контекстен ред: на кой инфлуенсър гледаш + back бутон + Admin badge */}
        <div style={{
          marginBottom: 16, paddingTop: 8,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <button
            onClick={() => router.push('/admin/influencers')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', fontSize: 13, padding: '4px 8px', borderRadius: 8,
              fontFamily: 'inherit',
            }}
          >← Към инфлуенсърите</button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>/</span>
          {influencer.avatar_url ? (
            <img src={influencer.avatar_url} alt={influencer.name}
              style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #FCD34D 0%, #FB923C 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#0B0D12', flexShrink: 0,
            }}>{influencer.name?.slice(0, 2).toUpperCase()}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{influencer.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              <strong>{influencer.promo_code}</strong>
              {' · '}
              {influencer.profile_url ? (
                <a href={influencer.profile_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                  {influencer.platform}
                </a>
              ) : influencer.platform}
            </div>
          </div>
          <span style={{
            marginLeft: 'auto',
            fontSize: 10, fontWeight: 700, padding: '3px 10px',
            background: 'rgba(251, 191, 36, 0.15)',
            color: '#B45309',
            borderRadius: 999,
            border: '1px solid rgba(251, 191, 36, 0.35)',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}>👁 Admin изглед</span>
        </div>

        {/* Общи условия — кога ги е приел + линк към самия файл */}
        <div style={{
          marginBottom: 16, padding: '10px 14px',
          background: 'var(--card-bg, #fff)', border: '1px solid var(--border)',
          borderRadius: 10, display: 'flex', alignItems: 'center',
          gap: 10, flexWrap: 'wrap', fontSize: 12,
        }}>
          <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted)' }}>
            Общи условия
          </strong>
          {influencer.terms_accepted_at ? (
            <span style={{ color: influencer.terms_outdated ? '#92400e' : '#166534', fontWeight: 600 }}>
              {influencer.terms_outdated ? '⚠' : '✓'} Приети на{' '}
              {new Date(influencer.terms_accepted_at).toLocaleString('bg-BG', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })} ч.
              {influencer.terms_outdated && ' (след това е качена нова версия — предстои ново приемане)'}
            </span>
          ) : (
            <span style={{ color: '#991b1b', fontWeight: 600 }}>✕ Още не са приети</span>
          )}
          <a
            href="/terms" target="_blank" rel="noopener noreferrer"
            style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 600 }}
          >📄 Отвори файла</a>
        </div>

        {/* Активна кампания на инфлуенсъра — най-отгоре, 1:1 с неговия изглед */}
        <CampaignCard viewId={id} />

        {campaignOrders.length > 0 && (
          <div className="card table-cards" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
              🛒 Поръчки от кампанията
            </div>
            <table style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>№</th><th>Дата</th><th>Продукти</th><th>Обща сума</th><th>Продукти с код</th><th>Комисионна</th><th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {campaignOrders.map(order => {
                  const fullPrice = parseFloat(order.commissionable_revenue || 0)
                  const paid      = parseFloat(order.total_price || 0)
                  const rate      = order.commission_pct != null ? Number(order.commission_pct) : commission
                  const comm      = fullPrice * (rate / 100)
                  return (
                    <tr key={order.id}>
                      <td data-label="№" style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{order.shopify_order_id}</td>
                      <td data-label="Дата" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(order.created_at_shopify)}</td>
                      <td data-label="Продукти">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(order.line_items || []).map((item, i) => (
                            <span key={i} className={`product-chip ${item.discounted ? 'discounted' : ''}`}>
                              {item.image_url
                                ? <img src={item.image_url} alt="" className="product-thumb" style={{ width: 22, height: 22 }} />
                                : <span className="product-thumb-placeholder" style={{ width: 22, height: 22, fontSize: 9 }}>{item.title?.slice(0, 1).toUpperCase()}</span>}
                              <span>{item.quantity}× {item.title}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td data-label="Обща сума" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(paid)}</td>
                      <td data-label="Продукти с код" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(fullPrice)}</td>
                      <td data-label="Комисионна" style={{ fontWeight: 700, color: 'var(--accent-dk)', whiteSpace: 'nowrap' }}>{fmtEur(comm)}</td>
                      <td data-label="Статус" style={{ whiteSpace: 'nowrap' }}>
                        {order.voided ? '❌ Анулирана' : order.financial_status === 'paid' ? '✅ Платена' : '⏳ Чакаща'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <section>
        {/* Hero — magazine-cover (същия като в инфлуенсърския dashboard) */}
        <div className={`hero-card ${heroBanner ? 'has-banner' : ''}`}
          style={heroBanner ? {
            backgroundImage: `linear-gradient(135deg, rgba(15, 110, 86, .85) 0%, rgba(13, 77, 63, .92) 60%, rgba(8, 35, 28, .95) 100%), url(${heroBanner})`,
          } : undefined}
        >
          {!heroBanner && (
            <>
              <div className="hero-blob hero-blob-1" />
              <div className="hero-blob hero-blob-2" />
              <div className="hero-blob hero-blob-3" />
            </>
          )}

          <div className="hero-inner">
            <div className="hero-top">
              <div className="hero-greeting">
                <div className="hero-time-greet">{getTimeGreeting()}</div>
                <div className="hero-name">{(influencer.name || '').split(/\s+/)[0]}</div>
                <div className="hero-date">{format(new Date(), 'EEEE, d MMMM', { locale: bg })}</div>
              </div>

              <div className="hero-avatar-wrap">
                {influencer.avatar_url ? (
                  <img src={influencer.avatar_url} alt={influencer.name} className="hero-avatar" />
                ) : (
                  <div className="hero-avatar hero-avatar-placeholder">
                    {influencer.name?.slice(0, 2).toUpperCase() || '??'}
                  </div>
                )}
              </div>
            </div>

            <div className="hero-amount-section">
              <div className="hero-amount-label">Очаквана комисионна за {monthLabel}</div>
              <div className="hero-amount">{fmtEur(currentMonth.commission || 0)}</div>
            </div>

            <div className="hero-stats">
              <div className="hero-stat">
                <div className="hero-stat-icon">📦</div>
                <div className="hero-stat-body">
                  <div className="hero-stat-value">{currentMonth.orders || 0}</div>
                  <div className="hero-stat-label">{currentMonth.orders === 1 ? 'поръчка' : 'поръчки'}</div>
                </div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-icon">%</div>
                <div className="hero-stat-body">
                  <div className="hero-stat-value">{commission}%</div>
                  <div className="hero-stat-label">комисионна</div>
                </div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-icon">💚</div>
                <div className="hero-stat-body">
                  <div className="hero-stat-value">{fmtEur(currentMonth.savings || 0).replace(' €', '')}</div>
                  <div className="hero-stat-label">спестено от клиентите</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Текущи активни заявки на инфлуенсъра */}
        {activity && (activity.productRequests.length > 0 || activity.payoutRequests.length > 0) && (
          <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                🔔 Активни заявки от този инфлуенсър
              </div>
              {activity.pendingProductCount > 0 && (
                <span style={{
                  background: '#fef3c7', color: '#92400e',
                  padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                }}>
                  🎁 {activity.pendingProductCount} нов{activity.pendingProductCount === 1 ? 'а заявка' : 'и заявки'} за продукт
                </span>
              )}
              {activity.pendingPayoutCount > 0 && (
                <span style={{
                  background: '#fef3c7', color: '#92400e',
                  padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                }}>
                  💰 {activity.pendingPayoutCount} нов{activity.pendingPayoutCount === 1 ? 'а заявка' : 'и заявки'} за изплащане
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {/* Продукти */}
              {activity.productRequests.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🎁 За продукт</div>
                  {activity.productRequests.map(r => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: 8, background: 'var(--bg)', borderRadius: 8, marginBottom: 6,
                    }}>
                      {r.product?.image_url ? (
                        <img src={r.product.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📦</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.product?.name || '?'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {r.quantity} бр. · {fmtDate(r.requested_at)}
                          {r.paid_total > 0 && <> · {fmtEur(r.paid_total)}</>}
                        </div>
                      </div>
                      <span className={`badge ${r.status === 'pending' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: 10 }}>
                        {r.status === 'pending' ? 'Чака' : 'В Shopify'}
                      </span>
                    </div>
                  ))}
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => router.push('/admin/product-requests')}
                    style={{ marginTop: 4 }}
                  >Виж всички →</button>
                </div>
              )}

              {/* Изплащания */}
              {activity.payoutRequests.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>💰 За изплащане</div>
                  {activity.payoutRequests.map(r => (
                    <div key={r.id} style={{
                      padding: 8, background: 'var(--bg)', borderRadius: 8, marginBottom: 6,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-dk)' }}>
                          {fmtEur(r.amount)}
                        </span>
                        <span className="badge badge-amber" style={{ fontSize: 10 }}>Чака</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {fmtDate(r.requested_at)}
                        {r.notes && <> · „{r.notes}"</>}
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => router.push('/admin/payouts')}
                    style={{ marginTop: 4 }}
                  >Виж всички →</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Заяви продукт — от името на инфлуенсъра (1:1 с неговия изглед) */}
        <ProductRequestsWidget viewId={id} />

        {/* Payouts — веднага под главната карта */}
        <PayoutWidget viewId={id} />

        {/* Date filters */}
        <div className="card" style={{ marginBottom: '1rem', padding: '14px' }}>
          <div className="filter-row">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 4 }}>
              Период:
            </div>
            {shortcuts.map(sc => (
              <button key={sc.key} className={`chip ${activeShortcut === sc.key ? 'active' : ''}`} onClick={() => applyShortcut(sc)}>
                {sc.label}
              </button>
            ))}
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
            <button className={`chip ${activeShortcut === 'custom' ? 'active' : ''}`} onClick={applyCustom} disabled={!from && !to}>
              Приложи
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          {[
            { label: 'Поръчки',     value: stats.totalOrders || 0,             sub: `с код ${influencer.promo_code}` },
            { label: 'Общ приход',  value: fmtEur(stats.totalRevenue || 0),    sub: 'платено от клиентите' },
            { label: 'Комисионна',  value: fmtEur(stats.totalCommission || 0),
              sub: (stats.campaignCommission || 0) > 0
                ? `редовна ${fmtEur(stats.regularCommission || 0)} · кампания ${fmtEur(stats.campaignCommission || 0)}`
                : `${commission}% от пълната цена` },
            { label: 'Ср. поръчка', value: fmtEur(stats.avgOrderValue || 0),   sub: 'средна стойност' },
          ].map(m => (
            <div key={m.label} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-value">{m.value}</div>
              <div className="metric-sub">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Share links (read-only за admin view) */}
        <ShareLinksWidget viewId={id} />

        {/* Leaderboard — както го вижда инфлуенсърът */}
        <InfluencerLeaderboard viewId={id} />

        {/* Top products */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
            Топ продукти (с отстъпка)
          </div>
          {topProducts.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Няма данни</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {topProducts.map((p, i) => (
              <div key={i} style={{ background: 'var(--bg)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.title} style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 8, objectFit: 'cover', background: '#fff' }} />
                ) : (
                  <div style={{
                    width: '100%', aspectRatio: '1 / 1', borderRadius: 8,
                    background: 'var(--accent-lt)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 700, color: 'var(--accent-dk)',
                  }}>{p.title?.slice(0, 2).toUpperCase()}</div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {p.quantity} бр. · {fmtEur(p.revenue)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* История на заявките за продукти */}
        {activity && activity.productHistory && activity.productHistory.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
              📜 История на заявките за продукти
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activity.productHistory.map(r => {
                const badge = (
                  r.status === 'fulfilled'       ? { bg: '#d1fae5', color: '#065f46', label: 'Доставена' } :
                  r.status === 'cancelled'       ? { bg: '#fee2e2', color: '#991b1b', label: 'Отказана'  } :
                  r.status === 'sent_to_shopify' ? { bg: '#dbeafe', color: '#1e40af', label: 'В Shopify' } :
                                                   { bg: '#fef3c7', color: '#92400e', label: 'Чакаща'    }
                )
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: 8, background: 'var(--bg)', borderRadius: 8,
                  }}>
                    {r.product?.image_url ? (
                      <img src={r.product.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📦</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.product?.name || '?'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {fmtDate(r.requested_at)} · {r.quantity} бр.
                        {' '}({r.free_quantity} безпл + {r.paid_quantity} плат)
                        {r.paid_total > 0 && <> · {fmtEur(r.paid_total)}</>}
                        {r.fulfilled_at && <> · ✓ {fmtDate(r.fulfilled_at)}</>}
                      </div>
                    </div>
                    <span style={{
                      background: badge.bg, color: badge.color,
                      padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>{badge.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* История на заявките за изплащане */}
        {activity && activity.payoutHistory && activity.payoutHistory.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
              💰 История на заявките за изплащане
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activity.payoutHistory.map(r => {
                const badge = (
                  r.status === 'paid'      ? { bg: '#d1fae5', color: '#065f46', label: 'Платена'  } :
                  r.status === 'approved'  ? { bg: '#dbeafe', color: '#1e40af', label: 'Одобрена' } :
                  r.status === 'rejected'  ? { bg: '#fee2e2', color: '#991b1b', label: 'Отказана' } :
                                             { bg: '#fef3c7', color: '#92400e', label: 'Чакаща'   }
                )
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: 8, background: 'var(--bg)', borderRadius: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-dk)' }}>
                        {fmtEur(r.amount)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {fmtDate(r.requested_at)}
                        {r.processed_at && <> · обработена: {fmtDate(r.processed_at)}</>}
                        {r.notes && <> · „{r.notes}"</>}
                      </div>
                    </div>
                    <span style={{
                      background: badge.bg, color: badge.color,
                      padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>{badge.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Orders table */}
        <div className="card table-cards">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
            Поръчки (анонимизирани — без лични данни)
          </div>
          <table style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Продукти</th>
                <th title="Сума, която клиентът е платил след отстъпката">Обща сума</th>
                <th title="Пълна цена на продуктите с приложен промокод">Продукти с код</th>
                <th title="Колко клиентът е спестил чрез промокода">Отстъпка за клиента</th>
                <th>Доставка</th>
                <th>Комисионна</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                  Няма поръчки за избрания период
                </td></tr>
              )}
              {orders.map(order => {
                const fullPrice = parseFloat(order.commissionable_revenue || 0)
                const savings   = parseFloat(order.total_savings || 0)
                const paid      = parseFloat(order.total_price || 0)
                const shipping  = parseFloat(order.shipping_total || 0)
                const rate      = order.commission_pct != null ? Number(order.commission_pct) : commission
                const comm      = fullPrice * (rate / 100)

                return (
                  <tr key={order.id}>
                    <td data-label="№" style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {order.shopify_order_id}
                      {order.campaign_id && (
                        <span style={{
                          display: 'inline-block', marginLeft: 6, padding: '1px 6px', borderRadius: 8,
                          background: '#eef2ff', color: '#3730a3', fontSize: 9, fontWeight: 700, verticalAlign: 'middle',
                        }}>КАМПАНИЯ</span>
                      )}
                    </td>
                    <td data-label="Дата" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(order.created_at_shopify)}</td>
                    <td data-label="Продукти">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(order.line_items || []).map((item, i) => (
                          <span key={i} className={`product-chip ${item.discounted ? 'discounted' : ''}`}>
                            {item.image_url ? (
                              <img src={item.image_url} alt="" className="product-thumb" style={{ width: 22, height: 22 }} />
                            ) : (
                              <span className="product-thumb-placeholder" style={{ width: 22, height: 22, fontSize: 9 }}>
                                {item.title?.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span>{item.quantity}× {item.title}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td data-label="Обща сума" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(paid)}</td>
                    <td data-label="Продукти с код" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(fullPrice)}</td>
                    <td data-label="Отстъпка" style={{ color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {savings > 0 ? `−${fmtEur(savings)}` : '—'}
                    </td>
                    <td data-label="Доставка" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {shipping > 0 ? fmtEur(shipping) : '—'}
                    </td>
                    <td data-label="Комисионна" style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {fmtEur(comm)}
                    </td>
                    <td data-label="Статус">
                      <OrderStatusBadge order={order} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </section>
      </div>
    </AdminShell>
  )
}

function OrderStatusBadge({ order }) {
  const fin = order.financial_status
  const ful = order.fulfillment_status
  if (fin === 'refunded') return <span className="badge badge-gray">Рефундирана</span>
  if (fin === 'partially_refunded') return <span className="badge badge-gray">Част. рефунд</span>
  if (fin === 'voided') return <span className="badge badge-gray">Отказана</span>
  if (ful === 'fulfilled') return <span className="badge badge-green">Изпълнена</span>
  return <span className="badge badge-amber">В изчакване</span>
}
