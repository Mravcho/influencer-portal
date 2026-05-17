'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const emptyForm = {
  shopify_product_id:    '',
  request_interval_days: 30,
  free_quantity:         1,
  paid_discount_pct:     15,
  is_global:             true,
  active:                true,
}

export default function RequestProductsPage() {
  const router = useRouter()
  const [products, setProducts]   = useState([])
  const [form, setForm]           = useState(emptyForm)
  const [loading, setLoading]     = useState(false)
  const [msg, setMsg]             = useState({ type: '', text: '' })

  const load = async () => {
    const res = await fetch('/api/admin/request-products')
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    setProducts(await res.json())
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const extractShopifyId = (input) => {
    // Поддържа суров ID (123456789) или Shopify product URL (.../products/handle?variant=...)
    const trimmed = String(input).trim()
    if (/^\d+$/.test(trimmed)) return trimmed
    const m = trimmed.match(/\/products\/[^?#/]+/)
    if (!m) return null
    // Ако URL не е ID-based, admin трябва да паства ID-то (Shopify URLs обикновено са handle-based)
    return null
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg({})

    const id = extractShopifyId(form.shopify_product_id)
    if (!id) {
      setMsg({ type: 'error', text: 'Постави числово Shopify Product ID (от admin → Products → URL съдържа ?id=...)' })
      setLoading(false)
      return
    }

    const res = await fetch('/api/admin/request-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, shopify_product_id: id }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    setMsg({ type: 'success', text: `Добавен: ${data.name}` })
    setForm(emptyForm)
    load()
  }

  const togglePatch = async (id, patch) => {
    const res = await fetch('/api/admin/request-products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    if (res.ok) load()
  }

  const refreshFromShopify = async (id) => {
    const res = await fetch('/api/admin/request-products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, refresh_from_shopify: true }),
    })
    if (res.ok) { setMsg({ type: 'success', text: 'Обновено от Shopify' }); load() }
  }

  const remove = async (p) => {
    if (!confirm(`Изтрий "${p.name}" от каталога? Историята на заявките за него ще изчезне.`)) return
    const res = await fetch(`/api/admin/request-products?id=${p.id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => router.push('/admin')}>← Назад</button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>🎁 Каталог за заявки</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Продукти, които инфлуенсърите могат да заявяват</div>
          </div>
        </div>
      </header>

      <main className="main-container">
        {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {/* Форма за добавяне */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: '0.75rem' }}>Добави нов продукт</h2>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Shopify Product ID *</label>
              <input
                value={form.shopify_product_id}
                onChange={e => setField('shopify_product_id', e.target.value)}
                placeholder="напр. 8501234567890"
                required
              />
              <p style={hintStyle}>
                Намери го в Shopify Admin → Products → отвори продукта → URL завършва на <code>/products/8501234567890</code>
              </p>
            </div>

            <div className="grid-2">
              <div>
                <label style={labelStyle}>Интервал (дни)</label>
                <input
                  type="number" min="0"
                  value={form.request_interval_days}
                  onChange={e => setField('request_interval_days', parseInt(e.target.value) || 0)}
                />
                <p style={hintStyle}>Колко дни трябва да минат преди следваща заявка за същия продукт</p>
              </div>
              <div>
                <label style={labelStyle}>Безплатно кол-во</label>
                <input
                  type="number" min="0"
                  value={form.free_quantity}
                  onChange={e => setField('free_quantity', parseInt(e.target.value) || 0)}
                />
                <p style={hintStyle}>1 = първият брой безплатен, всеки следващ -X%</p>
              </div>
            </div>

            <div className="grid-2">
              <div>
                <label style={labelStyle}>Отстъпка за платените (%)</label>
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={form.paid_discount_pct}
                  onChange={e => setField('paid_discount_pct', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={form.is_global}
                    onChange={e => setField('is_global', e.target.checked)}
                    style={{ width: 'auto', cursor: 'pointer' }}
                  />
                  Достъпен на всички инфлуенсъри по подразбиране
                </label>
                <p style={{ ...hintStyle, marginTop: 0 }}>
                  Ако е изключено — продуктът е видим само за инфлуенсърите, на които ръчно си го дал
                </p>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: 'flex-start' }}>
              {loading ? 'Добавяне...' : '+ Добави продукт'}
            </button>
          </form>
        </div>

        {/* Списък */}
        <div className="card table-wrap">
          <table style={{ minWidth: 760 }}>
            <thead><tr>
              <th>Продукт</th>
              <th>Цена</th>
              <th>Интервал</th>
              <th>Безпл.</th>
              <th>Отстъпка</th>
              <th>Достъп</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name}
                          style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: 6, background: 'var(--bg)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                        }}>📦</div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>ID: {p.shopify_product_id}</div>
                      </div>
                    </div>
                  </td>
                  <td>{Number(p.price || 0).toFixed(2)} лв</td>
                  <td>{p.request_interval_days}д</td>
                  <td>{p.free_quantity}</td>
                  <td>{p.paid_discount_pct}%</td>
                  <td>
                    <span className={`badge ${p.is_global ? 'badge-green' : 'badge-gray'}`}>
                      {p.is_global ? 'Всички' : 'Индивидуално'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${p.active ? 'badge-green' : 'badge-gray'}`}>
                      {p.active ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => refreshFromShopify(p.id)} title="Опресни име/цена/снимка от Shopify">🔄</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => togglePatch(p.id, { active: !p.active })} title={p.active ? 'Деактивирай' : 'Активирай'}>
                        {p.active ? '⏸' : '▶'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(p)} title="Изтрий">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                  Няма добавени продукти. Започни с някой от каталога на Shopify.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }
const hintStyle  = { fontSize: 11, color: 'var(--muted)', marginTop: 4 }
