'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Home, FileText, Wallet, Gift, Package, Users, Settings, MailOpen,
  Sun, Moon, LogOut, Crown, Activity, Link2, Menu, X,
} from 'lucide-react'

const TOKENS = {
  light: {
    pageBg:       '#F5F5F7',
    sidebarBg:    '#FAFAFC',
    sidebarBorder:'#E5E5EA',
    cardBg:       '#FFFFFF',
    cardBorder:   '#E5E5EA',
    text:         '#1D1D1F',
    muted:        '#6E6E73',
    iconMuted:    '#86868B',
    activeBg:     'rgba(52, 211, 153, 0.12)',
    activeText:   '#0F6E56',
    hoverBg:      'rgba(0, 0, 0, 0.04)',
    hoverText:    '#1D1D1F',
    barBg:        'rgba(255,255,255,0.92)',
  },
  dark: {
    pageBg:       '#0B0D12',
    sidebarBg:    '#0E1118',
    sidebarBorder:'rgba(255,255,255,0.06)',
    cardBg:       '#14171F',
    cardBorder:   'rgba(255,255,255,0.06)',
    text:         '#F5F7FA',
    muted:        '#A1A8B8',
    iconMuted:    '#A1A8B8',
    activeBg:     'rgba(52, 211, 153, 0.12)',
    activeText:   '#A3E635',
    hoverBg:      'rgba(255,255,255,0.05)',
    hoverText:    '#F5F7FA',
    barBg:        'rgba(14, 17, 24, 0.92)',
  },
}

const NAV = [
  { id: '/admin',                  label: 'Начало',          Icon: Home,     short: 'Начало' },
  { id: '/admin/influencers',      label: 'Инфлуенсъри',     Icon: Users,    short: 'Инфл.' },
  { id: '/admin/applications',     label: 'Кандидатствания', Icon: MailOpen, short: 'Заявки' },
  { id: '/admin/orders',           label: 'Поръчки',         Icon: FileText, short: 'Поръчки' },
  { id: '/admin/utm-links',        label: 'UTM Линкове',     Icon: Link2,    short: 'UTM' },
  { id: '/admin/payouts',          label: 'Изплащане',       Icon: Wallet,   short: 'Изпл.' },
  { id: '/admin/product-requests', label: 'Заявки за продукт',Icon: Gift,    short: 'Прод.' },
  { id: '/admin/request-products', label: 'Каталог',         Icon: Package,  short: 'Каталог' },
  { id: '/admin/sessions',         label: 'Сесии',           Icon: Activity, short: 'Сесии' },
  { id: '/admin/settings',         label: 'Настройки',       Icon: Settings, short: 'Настр.' },
]

const MOBILE_NAV = [
  NAV[0], NAV[1], NAV[3], NAV[4], NAV[5],
]

function NavBtn({ item, isActive, onClick, t }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        padding: '11px 14px',
        fontSize: 14,
        fontWeight: 500,
        textAlign: 'left',
        width: '100%',
        cursor: 'pointer',
        transition: 'all .15s ease',
        background: isActive ? t.activeBg : 'transparent',
        color: isActive ? t.activeText : t.iconMuted,
        border: 'none',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.background = t.hoverBg
          e.currentTarget.style.color = t.hoverText
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = t.iconMuted
        }
      }}
    >
      {isActive && (
        <span style={{
          position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
          borderTopRightRadius: 3, borderBottomRightRadius: 3,
          background: 'linear-gradient(180deg, #34D399 0%, #A3E635 100%)',
        }} aria-hidden />
      )}
      <item.Icon size={18} aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
    </button>
  )
}

export default function AdminShell({ children }) {
  const router = useRouter()
  const pathname = usePathname()

  // Мобилно меню (чекмедже с всички линкове)
  const [menuOpen, setMenuOpen] = useState(false)
  // Затваряме менюто при смяна на страница
  useEffect(() => { setMenuOpen(false) }, [pathname])

  // Тема — споделя се с инфлуенсърския dashboard през същия localStorage ключ
  const [theme, setTheme] = useState('light')
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rf-portal-theme')
      if (saved === 'dark' || saved === 'light') setTheme(saved)
    } catch {}
  }, [])
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem('rf-portal-theme', next) } catch {}
  }

  // Body фонът се сменя с темата
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = theme === 'dark' ? '#0B0D12' : '#F5F5F7'
    return () => { document.body.style.backgroundColor = prev }
  }, [theme])

  // Pending counts за badges
  const [pending, setPending] = useState({ payouts: 0, applications: 0, productRequests: 0 })
  useEffect(() => {
    const fetchPending = () => {
      Promise.all([
        fetch('/api/admin/payouts?count=pending').then(r => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 })),
        fetch('/api/admin/applications?count=pending').then(r => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 })),
        fetch('/api/admin/product-requests?count=pending').then(r => r.ok ? r.json() : { count: 0 }).catch(() => ({ count: 0 })),
      ]).then(([po, ap, pr]) => setPending({
        payouts: po.count || 0,
        applications: ap.count || 0,
        productRequests: pr.count || 0,
      }))
    }
    fetchPending()
    const id = setInterval(fetchPending, 30_000)
    return () => clearInterval(id)
  }, [])

  // Branding (за лого) — заменя default placeholder-а
  const [branding, setBranding] = useState({ logo_url: null })
  useEffect(() => {
    fetch('/api/public/branding')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setBranding(d))
      .catch(() => {})
  }, [])


  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const t = TOKENS[theme]
  const isActive = (id) => {
    if (id === '/admin') return pathname === '/admin'
    return pathname.startsWith(id)
  }
  const countFor = (id) => {
    if (id === '/admin/payouts') return pending.payouts
    if (id === '/admin/applications') return pending.applications
    if (id === '/admin/product-requests') return pending.productRequests
    return 0
  }

  return (
    <div
      className={`dashboard-shell ${theme === 'dark' ? 'theme-dark' : ''}`}
      style={{ minHeight: '100vh', background: t.pageBg, color: t.text, display: 'flex' }}
    >
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex"
        style={{
          width: 240,
          flexShrink: 0,
          flexDirection: 'column',
          background: t.sidebarBg,
          borderRight: `1px solid ${t.sidebarBorder}`,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div style={{ padding: '20px 18px 10px', display: 'flex', alignItems: 'center', gap: 10, minHeight: 60 }}>
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt="Logo"
              style={{ height: 32, maxWidth: 160, objectFit: 'contain' }}
            />
          ) : (
            <>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
                boxShadow: theme === 'dark' ? '0 0 20px rgba(52,211,153,.3)' : 'none',
              }} aria-hidden />
              <div style={{
                fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>RealFood</div>
            </>
          )}
          <span style={{
            marginLeft: 'auto',
            fontSize: 10, fontWeight: 700, padding: '2px 7px',
            borderRadius: 6,
            background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#EFEFF1',
            color: t.muted,
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}>Admin</span>
        </div>

        <nav style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }} aria-label="Админ навигация">
          {NAV.map(item => {
            const count = countFor(item.id)
            return (
              <div key={item.id} style={{ position: 'relative' }}>
                <NavBtn item={item} isActive={isActive(item.id)} onClick={() => router.push(item.id)} t={t} />
                {count > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: 10, right: 10,
                    minWidth: 18, height: 18, borderRadius: 9,
                    padding: '0 6px',
                    background: '#dc2626',
                    color: '#fff',
                    fontSize: 10, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: `2px solid ${t.sidebarBg}`,
                    lineHeight: 1,
                    pointerEvents: 'none',
                  }}>{count}</span>
                )}
              </div>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: '10px 10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavBtn
            item={{ id: '_theme', label: theme === 'dark' ? 'Светъл режим' : 'Тъмен режим', Icon: theme === 'dark' ? Sun : Moon }}
            isActive={false}
            onClick={toggleTheme}
            t={t}
          />
          <NavBtn
            item={{ id: '_logout', label: 'Изход', Icon: LogOut }}
            isActive={false}
            onClick={logout}
            t={t}
          />

          <div style={{
            marginTop: 8,
            borderRadius: 16,
            background: t.cardBg,
            border: `1px solid ${t.cardBorder}`,
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              height: 36, width: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #FCD34D 0%, #FB923C 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#0B0D12', fontWeight: 700, fontSize: 13,
            }} aria-hidden>AD</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Administrator</div>
              <div style={{
                fontSize: 11,
                color: theme === 'dark' ? '#FCD34D' : '#B45309',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Crown size={11} aria-hidden /> Управление
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Mobile top bar */}
        <div
          className="lg:hidden"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            background: t.barBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${t.sidebarBorder}`,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: `max(12px, env(safe-area-inset-top))`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {branding.logo_url ? (
              <img src={branding.logo_url} alt="Logo" style={{ height: 28, maxWidth: 140, objectFit: 'contain' }} />
            ) : (
              <>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
                }} aria-hidden />
                <span style={{
                  fontWeight: 700, letterSpacing: '-0.02em',
                  background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>RealFood</span>
              </>
            )}
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 6px',
              borderRadius: 5,
              background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#EFEFF1',
              color: t.muted,
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}>Admin</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Светъл режим' : 'Тъмен режим'}
              style={{
                padding: 8, borderRadius: 999, color: t.muted,
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Меню"
              style={{
                padding: 8, borderRadius: 999, color: t.text,
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              <Menu size={20} />
            </button>
          </div>
        </div>

        {/* Main content — съдържанието на конкретната страница */}
        <main style={{ flex: 1, paddingBottom: 80 }} className="lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="lg:hidden"
        aria-label="Админ мобилна навигация"
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          zIndex: 50,
          background: t.barBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: `1px solid ${t.sidebarBorder}`,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingTop: 6,
        }}
      >
        {MOBILE_NAV.map(item => {
          const active = isActive(item.id)
          const count = countFor(item.id)
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.id)}
              aria-label={item.label}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                padding: '8px 4px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: active ? t.activeText : t.iconMuted,
                fontFamily: 'inherit',
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                minHeight: 56,
              }}
            >
              <item.Icon size={20} aria-hidden />
              <span>{item.short}</span>
              {active && (
                <span style={{
                  position: 'absolute',
                  top: 0,
                  width: 24, height: 3,
                  borderRadius: 3,
                  background: 'linear-gradient(90deg, #34D399 0%, #A3E635 100%)',
                }} aria-hidden />
              )}
              {count > 0 && (
                <span style={{
                  position: 'absolute',
                  top: 4, right: '22%',
                  minWidth: 16, height: 16, borderRadius: 8,
                  padding: '0 5px',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 9, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                  pointerEvents: 'none',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Mobile full menu (чекмедже с всички линкове) */}
      {menuOpen && (
        <div
          className="lg:hidden"
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(84vw, 320px)',
              height: '100%',
              background: t.sidebarBg,
              borderLeft: `1px solid ${t.sidebarBorder}`,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.25)',
              paddingTop: 'env(safe-area-inset-top)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 16px 8px',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: t.muted,
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}>Меню</span>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Затвори"
                style={{ padding: 6, borderRadius: 999, color: t.text, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <nav style={{ padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }} aria-label="Всички линкове">
              {NAV.map(item => {
                const count = countFor(item.id)
                return (
                  <div key={item.id} style={{ position: 'relative' }}>
                    <NavBtn item={item} isActive={isActive(item.id)} onClick={() => { setMenuOpen(false); router.push(item.id) }} t={t} />
                    {count > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: 10, right: 10,
                        minWidth: 18, height: 18, borderRadius: 9,
                        padding: '0 6px',
                        background: '#dc2626',
                        color: '#fff',
                        fontSize: 10, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${t.sidebarBg}`,
                        lineHeight: 1,
                        pointerEvents: 'none',
                      }}>{count}</span>
                    )}
                  </div>
                )
              })}
            </nav>

            <div style={{ padding: '8px 10px 16px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${t.sidebarBorder}` }}>
              <NavBtn
                item={{ id: '_theme', label: theme === 'dark' ? 'Светъл режим' : 'Тъмен режим', Icon: theme === 'dark' ? Sun : Moon }}
                isActive={false}
                onClick={toggleTheme}
                t={t}
              />
              <NavBtn
                item={{ id: '_logout', label: 'Изход', Icon: LogOut }}
                isActive={false}
                onClick={logout}
                t={t}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
