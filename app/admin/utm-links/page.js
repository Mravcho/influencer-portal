'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { bg } from 'date-fns/locale'
import {
  Link2, Plus, Copy, Check, Trash2, ExternalLink, Search, TrendingUp, MousePointerClick,
  ChevronDown, ChevronUp, Info, AlertTriangle, ShoppingBag,
} from 'lucide-react'
import AdminShell from '../components/AdminShell'

const TOKENS = {
  light: { cardBg: '#FFFFFF', cardBorder: '#E5E5EA', text: '#1D1D1F', muted: '#6E6E73', inputBg: '#FFFFFF', inputBorder: '#D2D2D7', chipBg: '#EFEFF1', accent: '#0F6E56', accent2: '#2563EB', warn: '#B45309', barEmpty: '#ECECEC', subtleBg: '#F5F5F7' },
  dark:  { cardBg: '#14171F', cardBorder: 'rgba(255,255,255,0.06)', text: '#F5F7FA', muted: '#A1A8B8', inputBg: '#0E1118', inputBorder: 'rgba(255,255,255,0.12)', chipBg: 'rgba(255,255,255,0.06)', accent: '#A3E635', accent2: '#60A5FA', warn: '#FBBF24', barEmpty: 'rgba(255,255,255,0.06)', subtleBg: 'rgba(255,255,255,0.03)' },
}

const PERIODS = [{ k: '7', d: 7 }, { k: '30', d: 30 }, { k: '90', d: 90 }]

function useTheme() {
  const [theme, setTheme] = useState('light')
  useEffect(() => {
    const read = () => { try { const s = localStorage.getItem('rf-portal-theme'); if (s === 'dark' || s === 'light') setTheme(s) } catch {} }
    read(); window.addEventListener('storage', read)
    return () => window.removeEventListener('storage', read)
  }, [])
  return theme
}

// realfood.bg/pages/x?utm... → "realfood.bg/pages/x"
function prettyDest(url) {
  try { const u = new URL(url); return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) } catch { return url }
}
function fmtDate(s) { try { return format(parseISO(s), 'd MMM yyyy', { locale: bg }) } catch { return s || '' } }

function MiniBars({ daily, color, empty, height = 54 }) {
  const max = Math.max(...daily.map((d) => d.count), 0) || 1
  const [hover, setHover] = useState(null)
  return (
    <div style={{ position: 'relative' }}>
      {hover && (
        <div style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', background: '#202223', color: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5 }}>
          {fmtDate(hover.date)}: {hover.count}
        </div>
      )}
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {daily.map((d, i) => {
          const w = 100 / daily.length
          const h = Math.max((d.count / max) * (height - 3), d.count > 0 ? 2.5 : 0.8)
          return <rect key={i} x={i * w + w * 0.12} y={height - h} width={w * 0.76} height={h} rx={0.6}
            fill={d.count > 0 ? color : empty} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} />
        })}
      </svg>
    </div>
  )
}

/* ---------- shared small UI ---------- */
function Chip({ children, t, tone }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: t.chipBg, color: tone || t.text, whiteSpace: 'nowrap' }}>{children}</span>
}
function iconBtn(t, active) {
  return { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: active ? t.chipBg : 'transparent', color: active ? '#16a34a' : t.muted, cursor: 'pointer' }
}
function field(t) {
  return { width: '100%', padding: '9px 11px', borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
}
function CopyBtn({ text, id, copiedId, onCopy, t, title, children }) {
  const done = copiedId === id
  return <button title={title} onClick={() => onCopy(text, id)} style={iconBtn(t, done)}>{done ? <Check size={14} /> : children}</button>
}
function chipToggle(t, on) {
  return { fontSize: 12, padding: '4px 11px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? t.accent : t.cardBorder}`, background: on ? t.chipBg : 'transparent', color: on ? t.accent : t.muted, fontFamily: 'inherit' }
}

/* ---------- orders: two ways of counting ---------- */
// Всяка поръчка се брои по два начина (виж lib/utm-attribution.js). Цветът на
// числото съвпада с цвета на колоната в обяснението най-горе.
// Кутия с надпис и икона отгоре — за да личи от пръв поглед кое число е
// кликове и кое поръчки.
function StatTile({ t, icon, title, children, style }) {
  return (
    <div style={{ borderRadius: 12, background: t.subtleBg, border: `1px solid ${t.cardBorder}`, padding: '10px 14px 12px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: t.text, marginBottom: 10 }}>
        {icon}{title}
      </div>
      {children}
    </div>
  )
}

function ClicksTile({ link, t }) {
  return (
    <StatTile t={t} title="Кликове" icon={<MousePointerClick size={14} color={t.muted} />} style={{ flex: '1 1 118px' }}>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: t.text }}>{link.clicks}</div>
      <div style={{ fontSize: 11, color: t.muted, marginTop: 5 }}>общо върху линка</div>
    </StatTile>
  )
}

function OrderStat({ value, label, color, revenue, conversion, voided, t, divider }) {
  const has = typeof value === 'number'
  return (
    <div style={divider ? { borderLeft: `1px solid ${t.cardBorder}`, paddingLeft: 14 } : { paddingRight: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.text, whiteSpace: 'nowrap', marginBottom: 5 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, marginRight: 6 }} />
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: has && value > 0 ? color : t.muted }}>
        {has ? value : '—'}
      </div>
      <div style={{ fontSize: 11, color: t.muted, marginTop: 5, lineHeight: 1.45, whiteSpace: 'nowrap' }}>
        {!has ? 'чака миграция' : value > 0 ? (
          <>
            {Number(revenue || 0).toFixed(2)} € приход
            {conversion != null && <><br />{conversion}% от кликовете</>}
          </>
        ) : 'няма поръчки'}
        {voided > 0 && <><br />+{voided} {voided === 1 ? 'анулирана' : 'анулирани'}</>}
      </div>
    </div>
  )
}

function OrdersTile({ link, t, lastClickSupported }) {
  const first = link.orders ?? 0
  const last = link.ordersLastClick ?? 0
  const both = link.ordersBoth ?? 0
  const parts = []
  if (lastClickSupported && (first > 0 || last > 0)) {
    parts.push(`${both} и в двете`)
    if (first - both > 0) parts.push(`${first - both} само първо влизане`)
    if (last - both > 0) parts.push(`${last - both} само последен клик`)
  }
  const foot = { fontSize: 11, color: t.muted, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${t.cardBorder}`, lineHeight: 1.4 }
  return (
    <StatTile t={t} title="Поръчки" icon={<ShoppingBag size={14} color={t.muted} />} style={{ flex: '1 1 300px', maxWidth: 380 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <OrderStat t={t} value={first} label="първо влизане" color={t.accent}
          revenue={link.ordersRevenue} conversion={link.conversion} voided={link.ordersVoided} />
        <OrderStat t={t} divider value={lastClickSupported ? last : null} label="последен клик" color={t.accent2}
          revenue={link.ordersLastClickRevenue} conversion={link.conversionLastClick} voided={link.ordersLastClickVoided} />
      </div>
      {parts.length > 0 && <div style={foot}>{parts.join(' · ')}</div>}
      {lastClickSupported && link.sharedUtmWith > 0 && (
        <div style={{ ...foot, display: 'flex', gap: 6, color: t.warn }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Още {link.sharedUtmWith} {link.sharedUtmWith === 1 ? 'линк е' : 'линка са'} със същите UTM параметри. Shopify не ги
            различава, затова последен клик се брои само когато и първото влизане е през този линк.
          </span>
        </div>
      )}
    </StatTile>
  )
}

function ExplainColumn({ t, color, title, source, counts, misses }) {
  const row = { fontSize: 12, lineHeight: 1.45, color: t.text, marginTop: 8 }
  const tag = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: t.muted, marginBottom: 1 }
  return (
    <div style={{ borderRadius: 12, background: t.subtleBg, padding: 14, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      <div style={row}><span style={tag}>Какво брои</span>{counts}</div>
      <div style={row}><span style={tag}>Откъде идва</span>{source}</div>
      <div style={row}><span style={tag}>Какво изпуска</span>{misses}</div>
    </div>
  )
}

function AttributionExplainer({ t, lastClickSupported }) {
  const [open, setOpen] = useState(true)
  useEffect(() => { try { if (localStorage.getItem('rf-utm-explainer') === 'closed') setOpen(false) } catch {} }, [])
  const toggle = () => setOpen((v) => {
    try { localStorage.setItem('rf-utm-explainer', v ? 'closed' : 'open') } catch {}
    return !v
  })
  return (
    <div style={{ borderRadius: 14, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 16 }}>
      <button onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0, border: 'none', background: 'transparent', color: t.text, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <Info size={16} color={t.muted} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>Защо всеки линк има две числа за поръчки?</span>
        <span style={{ marginLeft: 'auto', color: t.muted, display: 'inline-flex' }}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>
      {open && (
        <>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 8, lineHeight: 1.5 }}>
            Една и съща поръчка може да се припише на линк по два начина. И двата са верни, но отговарят на
            различен въпрос — затова числата рядко съвпадат.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
            <ExplainColumn t={t} color={t.accent} title="Първо влизане"
              counts="Поръчки на клиенти, които са влезли в сайта за пръв път именно през този линк."
              source="От полето „landing site“ на поръчката в Shopify — първата страница, на която е кацнал клиентът. Shopify я помни около 2 седмици, а нашият линк оставя в нея своя код (_ref)."
              misses="Клиент, който вече е идвал наскоро — от имейл, реклама или директно — и чак после е кликнал линка. За Shopify първото му влизане е онова, по-старото." />
            <ExplainColumn t={t} color={t.accent2} title="Последен клик (както в Shopify)"
              counts="Поръчки, при които последното посещение преди покупката е било през този линк."
              source="От „Conversion summary“ на поръчката в Shopify — по UTM параметрите на линка (source, medium, campaign, content, term). Това е числото, което показват и отчетите на Shopify по UTM."
              misses="Клиент, който е кликнал линка, но после се е върнал директно в сайта и тогава е поръчал. Последното му посещение е без UTM." />
          </div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 12, lineHeight: 1.5 }}>
            Под числата на всеки линк пише колко поръчки се броят <b style={{ color: t.text }}>и в двете</b> и колко само в едното.
            Последният клик излиза 10–20 минути след поръчката (толкова му трябва на Shopify) и се обновява на всеки час;
            „Обнови поръчките“ го прави веднага.
          </div>
          {!lastClickSupported && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: 10, borderRadius: 10, background: 'rgba(245,158,11,0.12)', color: t.warn, fontSize: 12, lineHeight: 1.45 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Числото „последен клик“ още не е включено. Пусни <b>supabase/migration_utm_orders_last_click.sql</b> в
                Supabase (SQL Editor) и натисни „Обнови поръчките“.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------- one link row (readable) ---------- */
function LinkCard({ link, t, onDelete, onCopy, copiedId, lastClickSupported }) {
  const [days, setDays] = useState('30')
  const [daily, setDaily] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    fetch(`/api/admin/utm-links/daily?alias=${encodeURIComponent(link.alias)}&days=${days}`)
      .then((r) => r.json()).then((d) => { if (alive) setDaily(d.data || []) }).catch(() => {})
    return () => { alive = false }
  }, [open, days, link.alias])

  const periodClicks = useMemo(() => (daily || []).reduce((s, d) => s + d.count, 0), [daily])

  return (
    <div style={{ borderRadius: 14, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        {/* left: identity */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{link.label || link.utm_campaign}</span>
            {link.active === false && <Chip t={t} tone="#dc2626">спрян</Chip>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Chip t={t}>src: {link.utm_source}</Chip>
            <Chip t={t}>med: {link.utm_medium}</Chip>
            <Chip t={t}>camp: {link.utm_campaign}</Chip>
            {link.utm_term && <Chip t={t}>term: {link.utm_term}</Chip>}
            {link.utm_content && <Chip t={t}>content: {link.utm_content}</Chip>}
          </div>
          {/* short link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: t.accent, wordBreak: 'break-all' }}>{link.shortUrl}</span>
            <CopyBtn text={link.shortUrl} id={`s-${link.id}`} copiedId={copiedId} onCopy={onCopy} t={t} title="Копирай кратък линк"><Copy size={13} /></CopyBtn>
          </div>
          {/* destination (readable) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: t.muted }}>
            <ExternalLink size={12} />
            <span style={{ wordBreak: 'break-all' }}>{prettyDest(link.dest_url)}</span>
            <CopyBtn text={link.full_url} id={`u-${link.id}`} copiedId={copiedId} onCopy={onCopy} t={t} title="Копирай пълен UTM линк"><Copy size={12} /></CopyBtn>
          </div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 8 }}>създаден на {fmtDate(link.created_at)}</div>
        </div>
        {/* right: кликове | поръчки (по двата начина) | действия */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 440px', maxWidth: 560, marginLeft: 'auto' }}>
          <ClicksTile link={link} t={t} />
          <OrdersTile link={link} t={t} lastClickSupported={lastClickSupported} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => setOpen((v) => !v)} title="Графика на кликовете по дни" style={iconBtn(t, open)}><TrendingUp size={15} /></button>
            <button onClick={onDelete} title="Изтрий" style={{ ...iconBtn(t, false), color: '#dc2626' }}><Trash2 size={15} /></button>
          </div>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${t.cardBorder}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            {PERIODS.map((p) => <button key={p.k} onClick={() => setDays(String(p.d))} style={chipToggle(t, days === String(p.d))}>{p.d} дни</button>)}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: t.muted }}><b style={{ color: t.text }}>{periodClicks}</b> за периода</span>
          </div>
          {daily === null ? <div style={{ fontSize: 12, color: t.muted }}>Зареждане…</div>
            : daily.every((d) => d.count === 0) ? <div style={{ fontSize: 12, color: t.muted }}>Няма кликове за периода.</div>
            : <MiniBars daily={daily} color={t.accent} empty={t.barEmpty} />}
        </div>
      )}
    </div>
  )
}

/* ---------- stats tab ---------- */
function Breakdown({ title, data, t, total }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const max = Math.max(...entries.map(([, v]) => v), 1)
  if (!entries.length) return null
  return (
    <div style={{ borderRadius: 14, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {entries.map(([k, v]) => (
          <div key={k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
              <span style={{ color: t.text, wordBreak: 'break-all' }}>{k}</span>
              <span style={{ color: t.muted }}>{v}{total ? ` · ${Math.round((v / total) * 100)}%` : ''}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: t.barEmpty, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(v / max) * 100}%`, background: t.accent, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatsTab({ stats, t }) {
  const [days, setDays] = useState('30')
  const [allData, setAllData] = useState(null)

  useEffect(() => {
    let alive = true
    setAllData(null)
    fetch(`/api/admin/utm-links/daily?days=${days}`).then((r) => r.json())
      .then((d) => { if (alive) setAllData(d.allData || []) }).catch(() => {})
    return () => { alive = false }
  }, [days])

  const { combined, activeLinks, periodClicks } = useMemo(() => {
    if (!allData) return { combined: [], activeLinks: 0, periodClicks: 0 }
    const map = {}
    let active = 0, clicks = 0
    for (const ld of allData) {
      const sum = ld.data.reduce((s, x) => s + x.count, 0)
      if (sum > 0) active++
      clicks += sum
      for (const x of ld.data) map[x.date] = (map[x.date] || 0) + x.count
    }
    const combined = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
    return { combined, activeLinks: active, periodClicks: clicks }
  }, [allData])

  const maxTop = Math.max(...(stats.topLinks || []).map((l) => l.clicks), 1)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <AttributionExplainer t={t} lastClickSupported={!!stats.lastClickSupported} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard t={t} icon={<Link2 size={14} />} label="Линкове" value={stats.totalLinks} sub={`${activeLinks} активни за ${days} дни`} />
        <StatCard t={t} icon={<MousePointerClick size={14} />} label="Кликове" value={stats.totalClicks} sub={`общо · ${periodClicks} за ${days} дни`} />
        <StatCard
          t={t}
          color={t.accent}
          icon={<ShoppingBag size={14} />}
          label="Поръчки · първо влизане"
          value={stats.totalOrders ?? 0}
          sub={`${Number(stats.totalRevenue || 0).toFixed(2)} € без анулирани${stats.totalClicks > 0 ? ` · ${Math.round(((stats.totalOrders || 0) / stats.totalClicks) * 1000) / 10}% от кликовете` : ''}`}
        />
        <StatCard
          t={t}
          color={t.accent2}
          icon={<ShoppingBag size={14} />}
          label="Поръчки · последен клик"
          value={stats.lastClickSupported ? (stats.totalOrdersLastClick ?? 0) : '—'}
          sub={stats.lastClickSupported
            ? `${Number(stats.totalRevenueLastClick || 0).toFixed(2)} € без анулирани · както в Shopify`
            : 'чака миграция в Supabase'}
        />
      </div>

      <div style={{ borderRadius: 14, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Кликове по дни · всички линкове</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PERIODS.map((p) => <button key={p.k} onClick={() => setDays(String(p.d))} style={chipToggle(t, days === String(p.d))}>{p.d} дни</button>)}
          </div>
        </div>
        {allData === null ? <div style={{ fontSize: 13, color: t.muted }}>Зареждане…</div>
          : combined.every((d) => d.count === 0) ? <div style={{ fontSize: 13, color: t.muted }}>Няма кликове за периода.</div>
          : <MiniBars daily={combined} color={t.accent} empty={t.barEmpty} height={90} />}
      </div>

      <div style={{ borderRadius: 14, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Топ линкове</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {(stats.topLinks || []).filter((l) => l.clicks > 0).map((l) => (
            <div key={l.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                <span style={{ fontWeight: 600 }}>{l.label || l.utm_campaign} <span style={{ color: t.muted, fontWeight: 400 }}>· {l.utm_source}</span></span>
                <span style={{ color: t.muted }}>{l.clicks}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: t.barEmpty, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(l.clicks / maxTop) * 100}%`, background: 'linear-gradient(90deg,#34D399,#A3E635)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <Breakdown title="По source" data={stats.bySource} t={t} total={stats.totalClicks} />
        <Breakdown title="По medium" data={stats.byMedium} t={t} total={stats.totalClicks} />
        <Breakdown title="По кампания" data={stats.byCampaign} t={t} total={stats.totalClicks} />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, t, color, icon }) {
  return (
    <div style={{ borderRadius: 14, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
        {icon}
        {color && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: t.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: t.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

/* ---------- new-link form ---------- */
function NewLinkTab({ t, onCreated }) {
  const [f, setF] = useState({ destUrl: '', source: '', medium: '', campaign: '', term: '', content: '', utmId: '', alias: '', label: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const preview = useMemo(() => {
    if (!f.destUrl || !f.source || !f.medium || !f.campaign) return null
    try {
      const u = new URL(f.destUrl)
      u.searchParams.set('utm_source', f.source); u.searchParams.set('utm_medium', f.medium); u.searchParams.set('utm_campaign', f.campaign)
      if (f.term) u.searchParams.set('utm_term', f.term); if (f.content) u.searchParams.set('utm_content', f.content); if (f.utmId) u.searchParams.set('utm_id', f.utmId)
      return u.toString()
    } catch { return null }
  }, [f])

  const create = async () => {
    if (!f.destUrl || !f.source || !f.medium || !f.campaign) { setMsg({ e: 1, t: 'Попълни задължителните полета (*)' }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/utm-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setMsg({ e: 1, t: d.error || 'Грешка' }); return }
    setF({ destUrl: '', source: '', medium: '', campaign: '', term: '', content: '', utmId: '', alias: '', label: '' })
    setMsg({ e: 0, t: `Създаден: ${d.shortUrl}` })
    onCreated()
  }

  return (
    <div style={{ borderRadius: 16, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 20, maxWidth: 640 }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <input placeholder="Destination URL *  (напр. https://realfood.bg/pages/...)" value={f.destUrl} onChange={set('destUrl')} style={field(t)} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <input placeholder="Source *" value={f.source} onChange={set('source')} style={field(t)} />
          <input placeholder="Medium *" value={f.medium} onChange={set('medium')} style={field(t)} />
          <input placeholder="Campaign *" value={f.campaign} onChange={set('campaign')} style={field(t)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <input placeholder="Term" value={f.term} onChange={set('term')} style={field(t)} />
          <input placeholder="Content" value={f.content} onChange={set('content')} style={field(t)} />
          <input placeholder="Campaign ID" value={f.utmId} onChange={set('utmId')} style={field(t)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input placeholder="Име/етикет (по избор)" value={f.label} onChange={set('label')} style={field(t)} />
          <input placeholder="Alias (празно = автоматичен)" value={f.alias} onChange={set('alias')} style={field(t)} />
        </div>
        {preview && (
          <div style={{ background: t.subtleBg, borderRadius: 10, padding: 12, fontSize: 12, color: t.muted, wordBreak: 'break-all' }}>
            <div style={{ marginBottom: 4, color: t.text, fontWeight: 600 }}>Преглед на UTM линка:</div>{preview}
          </div>
        )}
        {msg && <div style={{ fontSize: 13, color: msg.e ? '#dc2626' : '#16a34a', wordBreak: 'break-all' }}>{msg.t}</div>}
        <div>
          <button onClick={create} disabled={saving} style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#34D399,#A3E635)', color: '#0B0D12', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Създаване…' : 'Създай линк'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- page ---------- */
export default function AdminUtmLinks() {
  const theme = useTheme()
  const t = TOKENS[theme]
  const [tab, setTab] = useState('links')
  const [links, setLinks] = useState([])
  const [stats, setStats] = useState(null)
  const lastClickSupported = !!stats?.lastClickSupported
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)
  const [q, setQ] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/utm-links').then((r) => r.json()).then((d) => { setLinks(d.links || []); setStats(d.stats || null); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const copy = useCallback((text, id) => { navigator.clipboard.writeText(text).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1800) }) }, [])

  // Сверява поръчките с Shopify: обхожда поръчките в магазина и записва онези,
  // дошли през наш линк — по първо влизане и по последен клик. Cron-ът прави
  // същото на всеки час за последните 2 дни и веднъж дневно за 30.
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const scanOrders = async (days) => {
    setScanning(true); setScanMsg('')
    try {
      const res = await fetch(`/api/admin/utm-orders?days=${days}`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      setScanMsg(res.ok
        ? [
            `Проверени ${d.scanned} поръчки`,
            `първо влизане: ${d.matched}`,
            d.lastClickSupported ? `последен клик: ${d.lastClickMatched}` : null,
            d.lastClickPending ? `${d.lastClickPending} още се обработват в Shopify` : null,
            d.lastClickTruncated ? 'последният клик не стигна до най-старите — пусни пак' : null,
            d.lastClickError ? `последен клик — грешка: ${d.lastClickError}` : null,
          ].filter(Boolean).join(' · ')
        : `Грешка: ${d.error || res.status}`)
      if (res.ok) load()
    } catch (e) {
      setScanMsg(`Грешка: ${e.message}`)
    }
    setScanning(false)
  }

  const remove = async (link) => {
    if (!confirm(`Изтрий "${link.label || link.alias}"? Това трие и статистиката му.`)) return
    const res = await fetch(`/api/admin/utm-links?id=${link.id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  // Кампанийните линкове (campaign_id != null) са в отделен таб, за да не удължават общия списък
  const regularLinks  = useMemo(() => links.filter((l) => !l.campaign_id), [links])
  const campaignLinks = useMemo(() => links.filter((l) => l.campaign_id), [links])
  const matchSearch = useCallback((list) => {
    const s = q.trim().toLowerCase()
    if (!s) return list
    return list.filter((l) => [l.alias, l.label, l.utm_source, l.utm_medium, l.utm_campaign, l.dest_url].filter(Boolean).some((v) => v.toLowerCase().includes(s)))
  }, [q])
  const filteredRegular  = useMemo(() => matchSearch(regularLinks), [matchSearch, regularLinks])
  const filteredCampaign = useMemo(() => matchSearch(campaignLinks), [matchSearch, campaignLinks])

  const TABS = [
    { k: 'new', label: '＋ Нов линк' },
    { k: 'links', label: 'Линкове' },
    { k: 'campaigns', label: `Кампании${campaignLinks.length ? ` (${campaignLinks.length})` : ''}` },
    { k: 'stats', label: 'Статистики' },
  ]

  return (
    <AdminShell>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px', color: t.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <Link2 size={22} color={t.accent} />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>UTM Линкове</h1>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <button
              onClick={() => scanOrders(30)}
              disabled={scanning}
              title="Сверява поръчките от последните 30 дни с Shopify"
              style={{
                padding: '8px 14px', borderRadius: 10, cursor: scanning ? 'wait' : 'pointer',
                border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.text,
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600, opacity: scanning ? 0.6 : 1,
              }}
            >{scanning ? '⟳ Проверявам…' : '🔄 Обнови поръчките'}</button>
            <button
              onClick={() => scanOrders(0)}
              disabled={scanning}
              title="Обхожда всички поръчки в магазина (по-бавно)"
              style={{
                marginLeft: 6, padding: '8px 12px', borderRadius: 10, cursor: scanning ? 'wait' : 'pointer',
                border: 'none', background: 'transparent', color: t.muted,
                fontFamily: 'inherit', fontSize: 12, textDecoration: 'underline', opacity: scanning ? 0.6 : 1,
              }}
            >от началото</button>
            {scanMsg && <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>{scanMsg}</div>}
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${t.cardBorder}`, marginBottom: 20 }}>
          {TABS.map((x) => (
            <button key={x.k} onClick={() => setTab(x.k)} style={{
              padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 14, fontWeight: tab === x.k ? 700 : 500, color: tab === x.k ? t.accent : t.muted,
              borderBottom: tab === x.k ? `2px solid ${t.accent}` : '2px solid transparent', marginBottom: -2,
            }}>{x.label}</button>
          ))}
        </div>

        {tab === 'new' && <NewLinkTab t={t} onCreated={() => { load(); setTab('links') }} />}

        {tab === 'links' && (
          loading ? <div style={{ color: t.muted }}>Зареждане…</div>
          : regularLinks.length === 0 ? <div style={{ color: t.muted }}>Още няма маркетинг UTM линкове. Създай от „Нов линк".</div>
          : <div style={{ display: 'grid', gap: 12 }}>
              <AttributionExplainer t={t} lastClickSupported={lastClickSupported} />
              <div style={{ position: 'relative', maxWidth: 360 }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: t.muted }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търси по име, alias, source, кампания…" style={{ ...field(t), paddingLeft: 34 }} />
              </div>
              <div style={{ fontSize: 12, color: t.muted }}>{filteredRegular.length} от {regularLinks.length} линка</div>
              {filteredRegular.map((l) => <LinkCard key={l.id} link={l} t={t} onDelete={() => remove(l)} onCopy={copy} copiedId={copiedId} lastClickSupported={lastClickSupported} />)}
            </div>
        )}

        {tab === 'campaigns' && (
          loading ? <div style={{ color: t.muted }}>Зареждане…</div>
          : campaignLinks.length === 0 ? <div style={{ color: t.muted }}>Още няма кампанийни линкове. Създай кампания и „Генерирай линкове за всички".</div>
          : <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 12, color: t.muted }}>
                Личните линкове на инфлуенсърите от кампании. Управляват се от раздел „Кампании".
              </div>
              <AttributionExplainer t={t} lastClickSupported={lastClickSupported} />
              <div style={{ position: 'relative', maxWidth: 360 }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: t.muted }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търси по инфлуенсър, alias, кампания…" style={{ ...field(t), paddingLeft: 34 }} />
              </div>
              <div style={{ fontSize: 12, color: t.muted }}>{filteredCampaign.length} от {campaignLinks.length} линка</div>
              {filteredCampaign.map((l) => <LinkCard key={l.id} link={l} t={t} onDelete={() => remove(l)} onCopy={copy} copiedId={copiedId} lastClickSupported={lastClickSupported} />)}
            </div>
        )}

        {tab === 'stats' && (
          loading || !stats ? <div style={{ color: t.muted }}>Зареждане…</div> : <StatsTab stats={stats} t={t} />
        )}
      </div>
    </AdminShell>
  )
}
