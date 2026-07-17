'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { bg } from 'date-fns/locale'
import { Link2, Plus, Copy, Check, Trash2, ExternalLink, BarChart3 } from 'lucide-react'
import AdminShell from '../components/AdminShell'

const TOKENS = {
  light: { cardBg: '#FFFFFF', cardBorder: '#E5E5EA', text: '#1D1D1F', muted: '#6E6E73', inputBg: '#FFFFFF', inputBorder: '#D2D2D7', chipBg: '#EFEFF1', accent: '#0F6E56', barEmpty: '#EEE' },
  dark:  { cardBg: '#14171F', cardBorder: 'rgba(255,255,255,0.06)', text: '#F5F7FA', muted: '#A1A8B8', inputBg: '#0E1118', inputBorder: 'rgba(255,255,255,0.12)', chipBg: 'rgba(255,255,255,0.06)', accent: '#A3E635', barEmpty: 'rgba(255,255,255,0.06)' },
}

function useTheme() {
  const [theme, setTheme] = useState('light')
  useEffect(() => {
    try { const s = localStorage.getItem('rf-portal-theme'); if (s === 'dark' || s === 'light') setTheme(s) } catch {}
    const onStorage = () => { try { const s = localStorage.getItem('rf-portal-theme'); if (s) setTheme(s) } catch {} }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return theme
}

function MiniBars({ daily, t, color }) {
  const max = Math.max(...daily.map((d) => d.count), 0) || 1
  const [hover, setHover] = useState(null)
  const height = 56
  return (
    <div style={{ position: 'relative' }}>
      {hover && (
        <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', background: '#202223', color: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5 }}>
          {(() => { try { return format(parseISO(hover.date), 'd MMM', { locale: bg }) } catch { return hover.date } })()}: {hover.count}
        </div>
      )}
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {daily.map((d, i) => {
          const w = 100 / daily.length
          const h = Math.max((d.count / max) * (height - 4), d.count > 0 ? 3 : 1)
          return (
            <rect key={i} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx={0.6}
              fill={d.count > 0 ? color : t.barEmpty}
              onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} />
          )
        })}
      </svg>
    </div>
  )
}

const PERIODS = [
  { key: '7', label: '7 дни', days: 7 },
  { key: '30', label: '30 дни', days: 30 },
  { key: '90', label: '90 дни', days: 90 },
]

function LinkCard({ link, t, onDelete, onCopy, copiedId }) {
  const [expanded, setExpanded] = useState(false)
  const [days, setDays] = useState('30')
  const [daily, setDaily] = useState(null)

  useEffect(() => {
    if (!expanded) return
    let alive = true
    fetch(`/api/admin/utm-links/daily?alias=${encodeURIComponent(link.alias)}&days=${days}`)
      .then((r) => r.json()).then((d) => { if (alive) setDaily(d.data || []) }).catch(() => {})
    return () => { alive = false }
  }, [expanded, days, link.alias])

  const periodClicks = useMemo(() => (daily || []).reduce((s, d) => s + d.count, 0), [daily])

  return (
    <div style={{ borderRadius: 16, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: t.accent }}>{link.alias}</span>
            {link.active === false && <span style={{ fontSize: 10, color: '#dc2626', border: '1px solid #dc2626', borderRadius: 5, padding: '1px 5px' }}>спрян</span>}
            <IconBtn t={t} title="Копирай кратък линк" active={copiedId === `s-${link.id}`} onClick={() => onCopy(link.shortUrl, `s-${link.id}`)}><Copy size={14} /></IconBtn>
            <IconBtn t={t} title="Копирай пълен UTM линк" active={copiedId === `u-${link.id}`} onClick={() => onCopy(link.full_url, `u-${link.id}`)}><ExternalLink size={14} /></IconBtn>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Chip t={t}>{link.utm_source}</Chip>
            <Chip t={t}>{link.utm_medium}</Chip>
            <span style={{ fontSize: 12, color: t.muted }}>{link.utm_campaign}</span>
          </div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 6, wordBreak: 'break-all' }}>{link.shortUrl}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: t.text }}>{link.clicks}</div>
            <div style={{ fontSize: 11, color: t.muted }}>кликове</div>
          </div>
          <button onClick={() => setExpanded((v) => !v)} title="Графика" style={iconBtnStyle(t, expanded)}><BarChart3 size={16} /></button>
          <button onClick={onDelete} title="Изтрий" style={{ ...iconBtnStyle(t, false), color: '#dc2626' }}><Trash2 size={16} /></button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${t.cardBorder}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setDays(String(p.days))} style={chipToggle(t, days === String(p.days))}>{p.label}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: t.muted }}>{periodClicks} за периода</span>
          </div>
          {daily === null ? <div style={{ fontSize: 12, color: t.muted }}>Зареждане…</div>
            : daily.every((d) => d.count === 0) ? <div style={{ fontSize: 12, color: t.muted }}>Няма кликове за периода.</div>
            : <MiniBars daily={daily} t={t} color={t.accent} />}
        </div>
      )}
    </div>
  )
}

function IconBtn({ children, onClick, title, active, t }) {
  return <button onClick={onClick} title={title} style={{ ...iconBtnStyle(t, active), width: 26, height: 26, color: active ? '#16a34a' : t.muted }}>{active ? <Check size={14} /> : children}</button>
}
function iconBtnStyle(t, active) {
  return { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: active ? t.chipBg : 'transparent', color: t.muted, cursor: 'pointer' }
}
function Chip({ children, t }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: t.chipBg, color: t.text }}>{children}</span>
}
function chipToggle(t, on) {
  return { fontSize: 12, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? t.accent : t.cardBorder}`, background: on ? t.chipBg : 'transparent', color: on ? t.accent : t.muted, fontFamily: 'inherit' }
}
function field(t) {
  return { width: '100%', padding: '9px 11px', borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.text, fontSize: 14, fontFamily: 'inherit', outline: 'none' }
}

export default function AdminUtmLinks() {
  const theme = useTheme()
  const t = TOKENS[theme]
  const [links, setLinks] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({ destUrl: '', source: '', medium: '', campaign: '', term: '', content: '', utmId: '', alias: '' })

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/utm-links').then((r) => r.json()).then((d) => {
      setLinks(d.links || []); setStats(d.stats || null); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const copy = useCallback((text, id) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1800) })
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const create = async () => {
    if (!form.destUrl || !form.source || !form.medium || !form.campaign) {
      setMsg({ type: 'err', text: 'Попълни задължителните полета (*)' }); return
    }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/utm-links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setMsg({ type: 'err', text: d.error || 'Грешка' }); return }
    setForm({ destUrl: '', source: '', medium: '', campaign: '', term: '', content: '', utmId: '', alias: '' })
    setMsg({ type: 'ok', text: `Създаден: ${d.shortUrl}` })
    load()
  }

  const remove = async (link) => {
    if (!confirm(`Изтрий "${link.alias}"?`)) return
    const res = await fetch(`/api/admin/utm-links?id=${link.id}`, { method: 'DELETE' })
    if (res.ok) load(); else setMsg({ type: 'err', text: 'Грешка при изтриване' })
  }

  return (
    <AdminShell>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 40px', color: t.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Link2 size={22} color={t.accent} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>UTM Линкове</h1>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard t={t} label="Линкове" value={stats.totalLinks} />
            <StatCard t={t} label="Кликове (общо)" value={stats.totalClicks} />
            <StatCard t={t} label="Sources" value={Object.keys(stats.bySource).length} />
            <StatCard t={t} label="Кампании" value={Object.keys(stats.byCampaign).length} />
          </div>
        )}

        {/* Create form */}
        <div style={{ borderRadius: 16, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 18, marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}><Plus size={16} /> Нов линк</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input placeholder="Destination URL *" value={form.destUrl} onChange={set('destUrl')} style={field(t)} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <input placeholder="Source *" value={form.source} onChange={set('source')} style={field(t)} />
              <input placeholder="Medium *" value={form.medium} onChange={set('medium')} style={field(t)} />
              <input placeholder="Campaign *" value={form.campaign} onChange={set('campaign')} style={field(t)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <input placeholder="Term" value={form.term} onChange={set('term')} style={field(t)} />
              <input placeholder="Content" value={form.content} onChange={set('content')} style={field(t)} />
              <input placeholder="Campaign ID" value={form.utmId} onChange={set('utmId')} style={field(t)} />
            </div>
            <input placeholder="Alias (празно = автоматичен)" value={form.alias} onChange={set('alias')} style={field(t)} />
            {msg && <div style={{ fontSize: 13, color: msg.type === 'ok' ? '#16a34a' : '#dc2626', wordBreak: 'break-all' }}>{msg.text}</div>}
            <div>
              <button onClick={create} disabled={saving} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)', color: '#0B0D12', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Създаване…' : 'Създай линк'}
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        {loading ? <div style={{ color: t.muted }}>Зареждане…</div>
          : links.length === 0 ? <div style={{ color: t.muted }}>Още няма UTM линкове.</div>
          : <div style={{ display: 'grid', gap: 12 }}>
              {links.map((l) => <LinkCard key={l.id} link={l} t={t} onDelete={() => remove(l)} onCopy={copy} copiedId={copiedId} />)}
            </div>}
      </div>
    </AdminShell>
  )
}

function StatCard({ label, value, t }) {
  return (
    <div style={{ borderRadius: 14, background: t.cardBg, border: `1px solid ${t.cardBorder}`, padding: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: t.text }}>{value}</div>
      <div style={{ fontSize: 11, color: t.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 2 }}>{label}</div>
    </div>
  )
}
