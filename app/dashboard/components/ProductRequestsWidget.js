'use client'
import { useEffect, useState } from 'react'

export default function ProductRequestsWidget() {
  const [products, setProducts]                 = useState([])
  const [freeLocked, setFreeLocked]             = useState(null) // { daysRemaining, fromName }
  const [loading, setLoading]                   = useState(true)
  const [selected, setSelected]                 = useState(null) // { product, qty }
  const [submitting, setSubmitting]             = useState(false)
  const [msg, setMsg]                           = useState({ type: '', text: '' })

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/dashboard/request-products')
    if (res.ok) {
      const data = await res.json()
      setProducts(data.products || [])
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
    setSelected({ product, qty: 1 })
    setMsg({})
  }

  const closeRequest = () => setSelected(null)

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    setMsg({})
    const res = await fetch('/api/dashboard/request-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: selected.product.id, quantity: selected.qty }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    setMsg({ type: 'success', text: 'Заявката е изпратена. Скоро ще получиш потвърждение.' })
    setTimeout(() => { closeRequest(); load() }, 1400)
  }

  if (loading) return null

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
                {p.free_quantity > 0 && !freeLocked && (
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
          onClose={closeRequest}
          onSubmit={submit}
          submitting={submitting}
          msg={msg}
          freeLocked={freeLocked}
        />
      )}
    </>
  )
}

function RequestModal({ product, qty, setQty, onClose, onSubmit, submitting, msg, freeLocked }) {
  const freeQty   = freeLocked ? 0 : Math.min(qty, product.free_quantity)
  const paidQty   = qty - freeQty
  const unitPaid  = Number(product.price) * (1 - Number(product.paid_discount_pct) / 100)
  const paidTotal = Math.round(paidQty * unitPaid * 100) / 100

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 420, width: '100%', margin: 0 }}
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

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={submitting} style={{ flex: 1 }}>
            Отказ
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={submitting} style={{ flex: 2 }}>
            {submitting ? 'Изпращане...' : 'Потвърди заявката'}
          </button>
        </div>
      </div>
    </div>
  )
}
