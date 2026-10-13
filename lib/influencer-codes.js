import { supabaseAdmin } from './supabase'
import { shopifyGraphQL } from './shopify'
import { buildShopifyDiscountUrl } from './share-links'

// Един инфлуенсър може да има няколко промокода: текущия (influencers.promo_code)
// и предишните (influencers.old_codes) — напр. REALNETI10 и стария REALNETI5.
// Поръчките по всички тях се засичат към него; навсякъде се показва текущият.

// „Има я“ се помни завинаги; „няма я“ — само минута (виж lib/product-payment.js)
let probe = null
export async function oldCodesSupported() {
  if (probe && (probe.ok || Date.now() - probe.at < 60 * 1000)) return probe.ok
  const { error } = await supabaseAdmin.from('influencers').select('old_codes').limit(1)
  probe = { ok: !error, at: Date.now() }
  if (error) console.warn('influencers.old_codes липсва — пусни supabase/migration_old_codes.sql')
  return !error
}

const up = c => String(c || '').trim().toUpperCase()

// Всички кодове на инфлуенсъра — текущият първи. Ако old_codes не е зареден
// в обекта, го дочита от базата.
export async function codesOf(influencer) {
  let old = influencer?.old_codes
  if (!Array.isArray(old) && influencer?.id && await oldCodesSupported()) {
    const { data } = await supabaseAdmin.from('influencers').select('old_codes').eq('id', influencer.id).maybeSingle()
    old = data?.old_codes
  }
  return [...new Set([influencer?.promo_code, ...(old || [])].filter(Boolean).map(up))]
}

// Активните инфлуенсъри, на които принадлежи някой от кодовете в поръчката.
// Към всеки се връща matchedCode — кодът, с който е направена поръчката.
export async function findInfluencersByCodes(codes, columns) {
  const list = [...new Set((codes || []).map(up).filter(Boolean))]
  if (!list.length) return []
  const withOld = await oldCodesSupported()
  const cols = withOld ? `${columns}, old_codes` : columns

  const { data: byCurrent, error } = await supabaseAdmin
    .from('influencers').select(cols).eq('active', true).in('promo_code', list)
  if (error) throw error
  let rows = byCurrent || []
  if (withOld) {
    const { data: byOld, error: oldErr } = await supabaseAdmin
      .from('influencers').select(cols).eq('active', true).overlaps('old_codes', list)
    if (oldErr) throw oldErr
    const seen = new Set(rows.map(r => r.id))
    rows = rows.concat((byOld || []).filter(r => !seen.has(r.id)))
  }
  return rows.map(r => {
    const mine = [r.promo_code, ...(r.old_codes || [])].map(up)
    return { ...r, matchedCode: list.find(c => mine.includes(c)) || up(r.promo_code) }
  })
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
    items = { collections: { add: it.collections.nodes.map(n => n.id) } }
  } else if (it.__typename === 'DiscountProducts') {
    if (it.products.pageInfo.hasNextPage || it.productVariants.pageInfo.hasNextPage) return { error: 'твърде много продукти' }
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
//   ready | already (вече е на новия код) | taken (новият код е зает) |
//   missing (старият код го няма в Shopify) | unsupported (специални условия) | no_code
export async function planCodeUpgrade(inf, pct) {
  const current = up(inf.promo_code)
  if (!current) return { status: 'no_code' }
  const next = newCodeFor(current, pct)
  if (!next) return { status: 'unsupported', reason: 'кодът е само от цифри' }
  if (/[^\x20-\x7E]/.test(next)) return { status: 'unsupported', next, reason: 'кодът съдържа кирилица — поправи го в профила' }
  if (next === current) return { status: 'already', next }

  const old = await lookupDiscount(current)
  if (!old) return { status: 'missing', next }
  const shape = cloneInput(old, { code: next, title: next, pct })
  if (shape.error) return { status: 'unsupported', next, reason: shape.error }
  if (await codeTaken(next)) return { status: 'taken', next }

  const oldPct = old.codeDiscount?.customerGets?.value?.percentage
  return { status: 'ready', next, oldPct: oldPct != null ? Math.round(oldPct * 1000) / 10 : null }
}

// Създава новия код в Shopify и го прави текущ; старият отива в old_codes.
// Кратките линкове: добавя /r/<новия код> като основен, старият продължава да работи.
export async function upgradeInfluencerCode(inf, pct) {
  if (!(await oldCodesSupported())) throw new Error('Първо пусни supabase/migration_old_codes.sql')
  const plan = await planCodeUpgrade(inf, pct)
  if (plan.status !== 'ready') return plan

  const current = up(inf.promo_code)
  const old = await lookupDiscount(current)
  // Заглавие като на стария код, с новия процент („RealNeti5“ → „RealNeti10“)
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

  const { data: row, error: readErr } = await supabaseAdmin
    .from('influencers').select('old_codes').eq('id', inf.id).single()
  const oldCodes = [...new Set([...(row?.old_codes || []), current].map(up))]
  const { error: updErr } = readErr ? { error: readErr } : await supabaseAdmin
    .from('influencers')
    .update({ promo_code: plan.next, old_codes: oldCodes })
    .eq('id', inf.id)
    .eq('promo_code', inf.promo_code) // ако някой е сменил кода междувременно — не презаписваме
  if (updErr) {
    // Без запис в портала новият код не се засича — махаме го от Shopify
    await shopifyGraphQL(`mutation($id: ID!) { discountCodeDelete(id: $id) { userErrors { message } } }`, { id: nodeId })
      .catch(() => {})
    throw new Error(`Записът в базата не мина: ${updErr.message}`)
  }

  // Нов основен кратък линк /r/<нов код>; старият /r/<стар код> остава и вече води към новия код
  try {
    const shortCode = plan.next.toLowerCase()
    const { data: taken } = await supabaseAdmin.from('share_links').select('id').eq('short_code', shortCode).maybeSingle()
    if (!taken) {
      await supabaseAdmin.from('share_links').update({ is_default: false }).eq('influencer_id', inf.id).eq('is_default', true)
      await supabaseAdmin.from('share_links').insert({
        influencer_id: inf.id,
        short_code:    shortCode,
        target_url:    buildShopifyDiscountUrl(plan.next, inf.platform), // информационно — целта се строи динамично в /r/[code]
        label:         'Кратък линк за споделяне в соц. мрежи',
        is_default:    true,
      })
    }
  } catch (err) {
    console.error('share link for new code failed:', err.message)
  }

  return { status: 'done', next: plan.next, old: current }
}
