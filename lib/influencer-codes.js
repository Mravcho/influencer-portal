import { supabaseAdmin } from './supabase'
import { shopifyGraphQL } from './shopify'
import { buildShopifyDiscountUrl } from './share-links'

// Кодовете на инфлуенсъра:
//   promo_code — основният (5%), винаги активен
//   boost_code — 10% кодът (ИМЕ10); активен в Shopify само докато е включен
//                „10% период“ (branding.boost_active) — тогава той се показва и
//                линковете водят към него
//   old_codes  — предишни кодове (при ръчна смяна на кода)
// Поръчките по всички тях се засичат към инфлуенсъра.

// „Има я“ се помни завинаги; „няма я“ — само минута (виж lib/product-payment.js)
const probes = {}
async function columnExists(table, column) {
  const key = `${table}.${column}`
  const hit = probes[key]
  if (hit && (hit.ok || Date.now() - hit.at < 60 * 1000)) return hit.ok
  const { error } = await supabaseAdmin.from(table).select(column).limit(1)
  probes[key] = { ok: !error, at: Date.now() }
  if (error) console.warn(`${key} липсва — пусни миграцията в supabase/`)
  return !error
}
export const oldCodesSupported = () => columnExists('influencers', 'old_codes')
export async function boostSupported() {
  return (await columnExists('influencers', 'boost_code')) && (await columnExists('branding', 'boost_active'))
}

// Включен ли е 10% периодът
export async function isBoostActive() {
  if (!(await boostSupported())) return false
  const { data } = await supabaseAdmin.from('branding').select('boost_active').eq('id', 1).maybeSingle()
  return data?.boost_active === true
}

const up = c => String(c || '').trim().toUpperCase()

// Кодът, който клиентите получават в момента (показва се и в профила)
export function activeCodeOf(influencer, boostOn) {
  return (boostOn && influencer?.boost_code) ? up(influencer.boost_code) : (influencer?.promo_code ? up(influencer.promo_code) : null)
}

// Колоните за кодовете, които съществуват в базата (за .select)
export async function codeColumns() {
  const cols = []
  if (await oldCodesSupported()) cols.push('old_codes')
  if (await boostSupported()) cols.push('boost_code')
  return cols
}

// Всички кодове на инфлуенсъра. Ако boost_code/old_codes не са заредени в
// обекта, ги дочита от базата.
export async function codesOf(influencer) {
  let { old_codes: old, boost_code: boost } = influencer || {}
  const cols = await codeColumns()
  const missing = cols.filter(c => influencer?.[c] === undefined)
  if (missing.length && influencer?.id) {
    const { data } = await supabaseAdmin.from('influencers').select(missing.join(', ')).eq('id', influencer.id).maybeSingle()
    if (data) { old = old ?? data.old_codes; boost = boost ?? data.boost_code }
  }
  return [...new Set([influencer?.promo_code, boost, ...(old || [])].filter(Boolean).map(up))]
}

// Активните инфлуенсъри, на които принадлежи някой от кодовете в поръчката.
// Към всеки се връща matchedCode — кодът, с който е направена поръчката.
export async function findInfluencersByCodes(codes, columns) {
  const list = [...new Set((codes || []).map(up).filter(Boolean))]
  if (!list.length) return []
  const extra = await codeColumns()
  const cols = [columns, ...extra].join(', ')
  const base = () => supabaseAdmin.from('influencers').select(cols).eq('active', true)

  const queries = [base().in('promo_code', list)]
  if (extra.includes('boost_code')) queries.push(base().in('boost_code', list))
  if (extra.includes('old_codes'))  queries.push(base().overlaps('old_codes', list))

  const byId = new Map()
  for (const { data, error } of await Promise.all(queries)) {
    if (error) throw error
    for (const r of data || []) if (!byId.has(r.id)) byId.set(r.id, r)
  }
  return [...byId.values()].map(r => {
    const mine = [r.promo_code, r.boost_code, ...(r.old_codes || [])].filter(Boolean).map(up)
    return { ...r, matchedCode: list.find(c => mine.includes(c)) || up(r.promo_code) }
  })
}

// Включва/изключва 10% кодовете на всички в Shopify и записва състоянието.
// Изключен код в Shopify = клиентът не може да го ползва в количката.
export async function setBoostActive(on) {
  if (!(await boostSupported())) throw new Error('Първо пусни supabase/migration_boost_code.sql')
  const { data: list, error } = await supabaseAdmin
    .from('influencers').select('id, name, boost_code').not('boost_code', 'is', null)
  if (error) throw error

  const results = []
  for (const inf of list || []) {
    try {
      await setCodeEnabled(inf.boost_code, on)
      results.push({ name: inf.name, code: inf.boost_code, ok: true })
    } catch (err) {
      results.push({ name: inf.name, code: inf.boost_code, ok: false, error: err.message })
    }
  }
  const { error: saveErr } = await supabaseAdmin
    .from('branding').upsert({ id: 1, boost_active: on, updated_at: new Date().toISOString() })
  if (saveErr) throw saveErr
  return results
}

async function setCodeEnabled(code, on) {
  const node = await gql(`query($c: String!) { codeDiscountNodeByCode(code: $c) { id } }`, { c: code })
  const id = node?.codeDiscountNodeByCode?.id
  if (!id) throw new Error('кодът го няма в Shopify')
  const m = on ? 'discountCodeActivate' : 'discountCodeDeactivate'
  const res = await gql(`mutation($id: ID!) { ${m}(id: $id) { userErrors { message } } }`, { id })
  const errs = res?.[m]?.userErrors || []
  if (errs.length) throw new Error(errs.map(e => e.message).join('; '))
}

// ---------------------------------------------------------------------------
// Преминаване към нов код: REALNETI5 → REALNETI10 (същите продукти/колекции и
// условия като стария, само с нова отстъпка). Старият остава активен в Shopify
// и продължава да се засича.
// ---------------------------------------------------------------------------

export function newCodeFor(promoCode, pct) {
  const base = up(promoCode).replace(/\d+$/, '')
  return base ? `${base}${pct}` : null
}

const DISCOUNT_FIELDS = `
  id
  codeDiscount {
    __typename
    ... on DiscountCodeBasic {
      title endsAt appliesOncePerCustomer usageLimit
      combinesWith { orderDiscounts productDiscounts shippingDiscounts }
      context { __typename }
      minimumRequirement {
        __typename
        ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } }
        ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
      }
      customerGets {
        appliesOnOneTimePurchase appliesOnSubscription
        value { __typename ... on DiscountPercentage { percentage } }
        items {
          __typename
          ... on DiscountCollections { collections(first: 100) { nodes { id } pageInfo { hasNextPage } } }
          ... on DiscountProducts {
            products(first: 100) { nodes { id } pageInfo { hasNextPage } }
            productVariants(first: 100) { nodes { id } pageInfo { hasNextPage } }
          }
        }
      }
    }
  }`

// При много кодове наведнъж Shopify понякога връща THROTTLED — изчакваме и пак
async function gql(query, variables) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await shopifyGraphQL(query, variables)
    } catch (err) {
      if (attempt >= 4 || !/THROTTLED|429/.test(err.message || '')) throw err
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
}

async function lookupDiscount(code) {
  const data = await gql(
    `query($c: String!) { codeDiscountNodeByCode(code: $c) { ${DISCOUNT_FIELDS} } }`, { c: code })
  return data?.codeDiscountNodeByCode || null
}

async function codeTaken(code) {
  const data = await gql(
    `query($c: String!) { codeDiscountNodeByCode(code: $c) { id } }`, { c: code })
  return !!data?.codeDiscountNodeByCode
}

// Превежда стария Shopify код във вход за discountCodeBasicCreate.
// Връща { input } или { error } при условия, които не копираме автоматично.
function cloneInput(node, { code, title, pct }) {
  const d = node?.codeDiscount
  if (d?.__typename !== 'DiscountCodeBasic') return { error: 'старият код не е обикновена процентна отстъпка' }
  if (d.context?.__typename && d.context.__typename !== 'DiscountBuyerSelectionAll') {
    return { error: 'старият код важи само за определени клиенти' }
  }
  const cg = d.customerGets || {}
  if (cg.value?.__typename && cg.value.__typename !== 'DiscountPercentage') {
    return { error: 'старият код е с фиксирана сума, не с процент' }
  }

  let items
  const it = cg.items || {}
  if (it.__typename === 'DiscountCollections') {
    if (it.collections.pageInfo.hasNextPage) return { error: 'твърде много колекции' }
    if (!it.collections.nodes.length) return { error: 'основният код не е закачен за нито една колекция (колекцията е изтрита в Shopify)' }
    items = { collections: { add: it.collections.nodes.map(n => n.id) } }
  } else if (it.__typename === 'DiscountProducts') {
    if (it.products.pageInfo.hasNextPage || it.productVariants.pageInfo.hasNextPage) return { error: 'твърде много продукти' }
    if (!it.products.nodes.length && !it.productVariants.nodes.length) return { error: 'основният код не е закачен за нито един продукт' }
    items = { products: {
      productsToAdd:        it.products.nodes.map(n => n.id),
      productVariantsToAdd: it.productVariants.nodes.map(n => n.id),
    } }
  } else {
    items = { all: true }
  }

  const mr = d.minimumRequirement
  let minimumRequirement = null
  if (mr?.__typename === 'DiscountMinimumSubtotal') {
    minimumRequirement = { subtotal: { greaterThanOrEqualToSubtotal: mr.greaterThanOrEqualToSubtotal.amount } }
  } else if (mr?.__typename === 'DiscountMinimumQuantity') {
    minimumRequirement = { quantity: { greaterThanOrEqualToQuantity: String(mr.greaterThanOrEqualToQuantity) } }
  }

  return { input: {
    title,
    code,
    startsAt:               new Date().toISOString(),
    endsAt:                 d.endsAt || null,
    appliesOncePerCustomer: !!d.appliesOncePerCustomer,
    usageLimit:             d.usageLimit ?? null,
    combinesWith:           d.combinesWith,
    context:                { all: 'ALL' },
    ...(minimumRequirement ? { minimumRequirement } : {}),
    customerGets: {
      value: { percentage: pct / 100 },
      items,
      appliesOnOneTimePurchase: cg.appliesOnOneTimePurchase !== false,
      appliesOnSubscription:    !!cg.appliesOnSubscription,
    },
  } }
}

// Какво ще стане с инфлуенсъра (без промени). status:
//   ready | already (вече има 10% код) | taken (новият код е зает) |
//   missing (основният код го няма в Shopify) | unsupported (специални условия) | no_code
export async function planCodeUpgrade(inf, pct) {
  const current = up(inf.promo_code)
  if (!current) return { status: 'no_code' }
  if (inf.boost_code) return { status: 'already', next: up(inf.boost_code) }
  const next = newCodeFor(current, pct)
  if (!next) return { status: 'unsupported', reason: 'кодът е само от цифри' }
  if (/[^\x20-\x7E]/.test(next)) return { status: 'unsupported', next, reason: 'кодът съдържа кирилица — поправи го в профила' }
  if (next === current) return { status: 'already', next, reason: 'основният код вече е с този процент' }

  const old = await lookupDiscount(current)
  if (!old) return { status: 'missing', next }
  const shape = cloneInput(old, { code: next, title: next, pct })
  if (shape.error) return { status: 'unsupported', next, reason: shape.error }
  if (await codeTaken(next)) return { status: 'taken', next }

  const oldPct = old.codeDiscount?.customerGets?.value?.percentage
  return { status: 'ready', next, oldPct: oldPct != null ? Math.round(oldPct * 1000) / 10 : null }
}

// Създава 10% кода в Shopify (копие на основния, само с новата отстъпка) и го
// записва като boost_code. Ако 10% периодът не е включен — кодът веднага се
// изключва в Shopify, за да не може да се ползва.
export async function upgradeInfluencerCode(inf, pct) {
  if (!(await boostSupported())) throw new Error('Първо пусни supabase/migration_boost_code.sql')
  const plan = await planCodeUpgrade(inf, pct)
  if (plan.status !== 'ready') return plan

  const current = up(inf.promo_code)
  const old = await lookupDiscount(current)
  // Заглавие като на основния код, с новия процент („RealNeti5“ → „RealNeti10“)
  const oldTitle = old?.codeDiscount?.title || ''
  const title = /\d+$/.test(oldTitle) ? oldTitle.replace(/\d+$/, String(pct)) : `Influencer ${plan.next} — ${inf.name}`
  const { input, error } = cloneInput(old, { code: plan.next, title, pct })
  if (error) return { status: 'unsupported', next: plan.next, reason: error }

  const created = await gql(`
    mutation($d: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $d) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`, { d: input })
  const res = created?.discountCodeBasicCreate
  if (res?.userErrors?.length) throw new Error(`Shopify: ${res.userErrors.map(e => e.message).join('; ')}`)
  const nodeId = res?.codeDiscountNode?.id
  if (!nodeId) throw new Error('Shopify не върна новия код')

  const removeNew = () => gql(`mutation($id: ID!) { discountCodeDelete(id: $id) { userErrors { message } } }`, { id: nodeId }).catch(() => {})

  const boostOn = await isBoostActive()
  if (!boostOn) {
    const off = await gql(`mutation($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { message } } }`, { id: nodeId })
    if (off?.discountCodeDeactivate?.userErrors?.length) {
      await removeNew()
      throw new Error(`Кодът не можа да се изключи: ${off.discountCodeDeactivate.userErrors.map(e => e.message).join('; ')}`)
    }
  }

  const { data: saved, error: updErr } = await supabaseAdmin
    .from('influencers')
    .update({ boost_code: plan.next })
    .eq('id', inf.id)
    .is('boost_code', null) // ако междувременно е създаден — не презаписваме
    .select('id')
  if (updErr || !saved?.length) {
    // Без запис в портала кодът не се засича — махаме го от Shopify
    await removeNew()
    throw new Error(`Записът в базата не мина${updErr ? `: ${updErr.message}` : ''}`)
  }

  // Кратък линк /r/<10% код>; показва се на инфлуенсъра, докато 10% периодът е включен
  try {
    const shortCode = plan.next.toLowerCase()
    const { data: taken } = await supabaseAdmin.from('share_links').select('id').eq('short_code', shortCode).maybeSingle()
    if (!taken) {
      await supabaseAdmin.from('share_links').insert({
        influencer_id: inf.id,
        short_code:    shortCode,
        target_url:    buildShopifyDiscountUrl(plan.next, inf.platform), // информационно — целта се строи динамично в /r/[code]
        label:         'Кратък линк за споделяне в соц. мрежи',
        is_default:    false,
      })
    }
  } catch (err) {
    console.error('share link for boost code failed:', err.message)
  }

  return { status: 'done', next: plan.next, active: boostOn }
}
