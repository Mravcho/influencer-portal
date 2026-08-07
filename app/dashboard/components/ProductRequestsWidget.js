'use client'
import { useEffect, useState } from 'react'

const EMPTY_SHIPPING = { method: '', recipient: '', phone: '', location: '' }

export default function ProductRequestsWidget({ viewId } = {}) {
  // Когато админ гледа профил на инфлуенсър (?viewId=<id>) — заявяваме от негово име
  const qs = viewId ? `?viewId=${encodeURIComponent(viewId)}` : ''
  const [products, setProducts]                 = useState([])
  const [freeLocked, setFreeLocked]             = useState(null) // { daysRemaining, fromName }
  const [freeGate, setFreeGate]                 = useState(null) // { eligible, is_first, orders_count, clicks_count, click_threshold }
  const [shippingDefaults, setShippingDefaults] = useState(EMPTY_SHIPPING)
  const [loading, setLoading]                   = useState(true)
  const [selected, setSelected]                 = useState(null) // { product, qty, shipping }
  const [submitting, setSubmitting]             = useState(false)
  const [msg, setMsg]                           = useState({ type: '', text: '' })
  const [canRequest, setCanRequest]             = useState(true)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/dashboard/request-products${qs}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setCanRequest(data.can_request !== false)
      setProducts(data.products || [])
      setFreeGate(data.free_gate || null)
      setShippingDefaults({ ...EMPTY_SHIPPING, ...(data.shipping_defaults || {}) })
      if (data.free_locked_until) {
        setFreeLocked({
          daysRemaining: data.free_days_remaining,
          fromName:      data.free_locked_from_name,
        })
      } else {
        setFreeLocked(null)
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openRequest = (product) => {
    setSelected({ product, qty: 1, shipping: { ...shippingDefaults } })
    setMsg({})
  }

  const closeRequest = () => setSelected(null)

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    setMsg({})
    const res = await fetch(`/api/dashboard/request-products${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: selected.product.id,
        quantity:   selected.qty,
        shipping:   selected.shipping,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    setMsg({ type: 'success', text: 'Заявката е изпратена. Скоро ще получиш потвърждение.' })
    setTimeout(() => { closeRequest(); load() }, 1400)
  }

  if (loading) return null
  // Акаунтът няма право да заявява продукти (админ toggle) → не показваме widget-а
  if (!canRequest) return null

  // Втори+ безплатен продукт е заключен, докато няма поръчка или достатъчно клика
  const gateBlocked = !!(freeGate && !freeGate.eligible)

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
          🎁 Заяви продукт
        </div>

        {/* Глобален free lockout банер */}
        {freeLocked && (
          <div style={{
            background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10,
            padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#78350f',
          }}>
            ⏳ Безплатната заявка е заключена още <strong>{freeLocked.daysRemaining} дни</strong>
            {freeLocked.fromName && <> (от „{freeLocked.fromName}")</>}.
            Може да поръчваш с -% отстъпка по всяко време.
          </div>
        )}

        {/* Гейт: втори безплатен продукт изисква поръчка или трафик */}
        {gateBlocked && !freeLocked && (
          <div style={{
            background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10,
            padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#3730a3',
          }}>
            🔒 Вторият безплатен продукт се отключва при <strong>поне 1 поръчка</strong> или{' '}
            <strong>{freeGate.click_threshold} клика</strong> на твоя линк.
            Засега имаш <strong>{freeGate.clicks_count}/{freeGate.click_threshold} клика</strong>.
            Дотогава може да поръчаш продукт с -% отстъпка.
          </div>
        )}

        {products.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0 4px' }}>
            В момента няма достъпни продукти за заявка. Свържи се с админ ако очакваш да виждаш такива.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {products.map(p => (
            <div key={p.id} style={{
              background: 'var(--bg)', borderRadius: 12, padding: 12,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} style={{
                  width: '100%', aspectRatio: '1 / 1', borderRadius: 8,
                  objectFit: 'cover', background: '#fff',
                }} />
              ) : (
                <div style={{
                  width: '100%', aspectRatio: '1 / 1', borderRadius: 8,
                  background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                }}>📦</div>
              )}
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {p.free_quantity > 0 && !freeLocked && !gateBlocked && (
                  <>{p.free_quantity} бр. безпл. · </>
                )}
                над безпл.: -{p.paid_discount_pct}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Заключва безпл. за {p.request_interval_days}д
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => openRequest(p)}>
                Заяви
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modal за избор на количество */}
      {selected && (
        <RequestModal
          product={selected.product}
          qty={selected.qty}
          setQty={q => setSelected(s => ({ ...s, qty: q }))}
          shipping={selected.shipping}
          setShipping={patch => setSelected(s => ({ ...s, shipping: { ...s.shipping, ...patch } }))}
          onClose={closeRequest}
          onSubmit={submit}
          submitting={submitting}
          msg={msg}
          freeLocked={freeLocked}
          gateBlocked={gateBlocked}
          freeGate={freeGate}
        />
      )}
    </>
  )
}

const SHIPPING_OPTIONS = [
  { value: 'econt_office',  label: '📦 Еконт офис' },
  { value: 'speedy_office', label: '🚚 Спиди офис' },
  { value: 'boxnow',        label: '📮 BoxNow' },
  { value: 'address',       label: '🏠 Адрес' },
]

const LOCATION_PLACEHOLDER = {
  econt_office:  'Град, офис (напр. София, Младост 1, офис 5567)',
  speedy_office: 'Град, офис (напр. София, офис 87)',
  boxnow:        'Локация (напр. София, BoxNow Mall of Sofia)',
  address:       'Пълен адрес: град, кв., улица, №, ап.',
}

function RequestModal({ product, qty, setQty, shipping, setShipping, onClose, onSubmit, submitting, msg, freeLocked, gateBlocked, freeGate }) {
  const freeBlocked = !!freeLocked || !!gateBlocked
  const freeQty   = freeBlocked ? 0 : Math.min(qty, product.free_quantity)
  const paidQty   = qty - freeQty
  const unitPaid  = Number(product.price) * (1 - Number(product.paid_discount_pct) / 100)
  const paidTotal = Math.round(paidQty * unitPaid * 100) / 100
  const formValid = shipping.method && shipping.recipient?.trim() && shipping.phone?.trim() && shipping.location?.trim()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 16,
        // Отстъп отдолу за safe-area — да не се крият бутоните на мобилен
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 420, width: '100%', margin: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {product.image_url && (
            <img src={product.image_url} alt={product.name}
              style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{product.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Каталожна цена: {Number(product.price).toFixed(2)} €
            </div>
          </div>
        </div>

        {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>
          Количество
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button
            className="btn btn-sm"
            onClick={() => setQty(Math.max(1, qty - 1))}
            disabled={qty <= 1}
          >−</button>
          <input
            type="number" min="1" value={qty}
            onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: 70, textAlign: 'center' }}
          />
          <button className="btn btn-sm" onClick={() => setQty(qty + 1)}>+</button>
        </div>

        <div style={{
          background: 'var(--bg)', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>
              Безплатно
              {freeLocked && (
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
                  (свободно след {freeLocked.daysRemaining}д)
                </span>
              )}
              {gateBlocked && !freeLocked && (
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
                  (нужна поръчка или {freeGate?.click_threshold} клика)
                </span>
              )}
            </span>
            <span style={{ fontWeight: 600 }}>{freeQty} бр.</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Платено (с -{product.paid_discount_pct}%)</span>
            <span style={{ fontWeight: 600 }}>
              {paidQty} бр. × {unitPaid.toFixed(2)} €
            </span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            paddingTop: 6, marginTop: 6, borderTop: '1px solid var(--border)',
            fontSize: 14, fontWeight: 700,
          }}>
            <span>Общо за плащане</span>
            <span style={{ color: paidTotal > 0 ? 'var(--accent-dk)' : 'var(--muted)' }}>
              {paidTotal.toFixed(2)} €
            </span>
          </div>
        </div>

        {/* Доставка */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
            Доставка
          </div>

          <label style={modalLabel}>Начин на доставка *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {SHIPPING_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setShipping({ method: opt.value })}
                style={{
                  padding: '8px 10px', borderRadius: 8, fontSize: 12,
                  cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${shipping.method === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: shipping.method === opt.value ? 'var(--accent-lt)' : 'var(--bg)',
                  color: shipping.method === opt.value ? 'var(--accent-dk)' : 'var(--text)',
                  fontWeight: shipping.method === opt.value ? 600 : 400,
                  fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label style={modalLabel}>Получател *</label>
          <input
            type="text" placeholder="Име и фамилия"
            value={shipping.recipient || ''}
            onChange={e => setShipping({ recipient: e.target.value })}
            style={{ marginBottom: 8 }}
          />

          <label style={modalLabel}>Телефон *</label>
          <input
            type="tel" placeholder="+359 88 ..."
            value={shipping.phone || ''}
            onChange={e => setShipping({ phone: e.target.value })}
            style={{ marginBottom: 8 }}
          />

          <label style={modalLabel}>
            {shipping.method === 'address' ? 'Адрес *' : 'Офис / локация *'}
          </label>
          <input
            type="text"
            placeholder={LOCATION_PLACEHOLDER[shipping.method] || 'Първо избери начин на доставка'}
            value={shipping.location || ''}
            onChange={e => setShipping({ location: e.target.value })}
            disabled={!shipping.method}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={submitting} style={{ flex: 1 }}>
            Отказ
          </button>
          <button
            className="btn btn-primary"
            onClick={onSubmit}
            disabled={submitting || !formValid}
            style={{ flex: 2 }}
          >
            {submitting ? 'Изпращане...' : 'Потвърди заявката'}
          </button>
        </div>
      </div>
    </div>
  )
}

const modalLabel = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }
