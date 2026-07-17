'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { bg } from 'date-fns/locale'
import {
  Link2, Plus, Copy, Check, Trash2, ExternalLink, Search, TrendingUp, MousePointerClick,
} from 'lucide-react'
import AdminShell from '../components/AdminShell'

const TOKENS = {
  light: { cardBg: '#FFFFFF', cardBorder: '#E5E5EA', text: '#1D1D1F', muted: '#6E6E73', inputBg: '#FFFFFF', inputBorder: '#D2D2D7', chipBg: '#EFEFF1', accent: '#0F6E56', barEmpty: '#ECECEC', subtleBg: '#F5F5F7' },
  dark:  { cardBg: '#14171F', cardBorder: 'rgba(255,255,255,0.06)', text: '#F5F7FA', muted: '#A1A8B8', inputBg: '#0E1118', inputBorder: 'rgba(255,255,255,0.12)', chipBg: 'rgba(255,255,255,0.06)', accent: '#A3E635', barEmpty: 'rgba(255,255,255,0.06)', subtleBg: 'rgba(255,255,255,0.03)' },
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

/* ---------- one link row (readable) ---------- */
function LinkCard({ link, t, onDelete, onCopy, copiedId }) {
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
        </div>
        {/* right: clicks + actions */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: t.text, lineHeight: 1 }}>{link.clicks}</div>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>кликове общо</div>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 6 }}>{fmtDate(link.created_at)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => setOpen((v) => !v)} title="Графика по дни" style={iconBtn(t, open)}><TrendingUp size={15} /></button>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <StatCard t={t} label="Линкове" value={stats.totalLinks} sub={`${activeLinks} активни за ${days} дни`} />
        <StatCard t={t} label="Кликове (общо)" value={stats.totalClicks} sub={`${periodClicks} за ${days} дни`} />
        <StatCard t={t} label="Sources" value={Object.keys(stats.bySource).length} />
        <StatCard t={t} label="Кампании" value={Object.keys(stats.byCampaign).length} />
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

function StatCard({ label, value, sub, t }) {
  return (
    <div style={{ borderRadius: 14, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 16 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: t.text }}>{value}</div>
      <div style={{ fontSize: 11, color: t.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>{sub}</div>}
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
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)
  const [q, setQ] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/utm-links').then((r) => r.json()).then((d) => { setLinks(d.links || []); setStats(d.stats || null); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const copy = useCallback((text, id) => { navigator.clipboard.writeText(text).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1800) }) }, [])

  const remove = async (link) => {
    if (!confirm(`Изтрий "${link.label || link.alias}"? Това трие и статистиката му.`)) return
    const res = await fetch(`/api/admin/utm-links?id=${link.id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return links
    return links.filter((l) => [l.alias, l.label, l.utm_source, l.utm_medium, l.utm_campaign, l.dest_url].filter(Boolean).some((v) => v.toLowerCase().includes(s)))
  }, [links, q])

  const TABS = [{ k: 'new', label: '＋ Нов линк' }, { k: 'links', label: 'Всички линкове' }, { k: 'stats', label: 'Статистики' }]

  return (
    <AdminShell>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px', color: t.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Link2 size={22} color={t.accent} />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>UTM Линкове</h1>
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
          : links.length === 0 ? <div style={{ color: t.muted }}>Още няма UTM линкове. Създай от „Нов линк".</div>
          : <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ position: 'relative', maxWidth: 360 }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: t.muted }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търси по име, alias, source, кампания…" style={{ ...field(t), paddingLeft: 34 }} />
              </div>
              <div style={{ fontSize: 12, color: t.muted }}>{filtered.length} от {links.length} линка</div>
              {filtered.map((l) => <LinkCard key={l.id} link={l} t={t} onDelete={() => remove(l)} onCopy={copy} copiedId={copiedId} />)}
            </div>
        )}

        {tab === 'stats' && (
          loading || !stats ? <div style={{ color: t.muted }}>Зареждане…</div> : <StatsTab stats={stats} t={t} />
        )}
      </div>
    </AdminShell>
  )
}
