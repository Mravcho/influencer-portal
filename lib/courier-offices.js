// Офиси и автомати на куриерите — същите списъци, които ползва middleware.bg в
// количката на магазина (couriers.middleware.bg/new/<държава>-<куриер>-offices.txt).
// Поръчките по заявки за продукти се подават на middleware-а в неговия формат:
//
//   address1 = "<До офис|До автомат> <тип>[<код>]: <име на офиса>"
//   city/zip = градът и пощенският код на офиса
//   note_attributes _mw_shipping = "<До офис|До автомат|До адрес> <куриер>"
//                   _mw_address  = address1
//
// където <тип> е куриерът, а за автоматите — "<куриер>-locker" (напр. speedy-locker).
// Така middleware-ът разпознава офиса по кода и не се налага ръчна корекция.

const BASE = 'https://couriers.middleware.bg/new'
const COUNTRY = 'bg'
const DAY = 24 * 60 * 60 * 1000

// Начин на доставка в портала → куриер в middleware-а
export const METHOD_COURIER = {
  econt_office:  'econt',
  speedy_office: 'speedy',
  boxnow:        'boxnow',
}
// Куриер за доставка до адрес (както в магазина: „До адрес speedy“)
export const ADDRESS_COURIER = 'speedy'

const TO_OFFICE  = 'До офис'
const TO_LOCKER  = 'До автомат'
const TO_ADDRESS = 'До адрес'

// "До офис speedy[877]: ..." / "До автомат boxnow-locker[2267]: ..."
const LABEL_RE = /^(?:До офис|До автомат)\s+([a-z]+(?:-locker)?)\[([^\]]+)\]:\s*/

const cache = new Map() // url → { at, data }

async function loadJson(url) {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < DAY) return hit.data
  // Списъците са до ~3 MB (над лимита на Next data cache) → пазим ги в паметта на инстанцията
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`middleware ${url} → ${res.status}`)
  const data = await res.json()
  cache.set(url, { at: Date.now(), data })
  return data
}

// Плосък списък от офисите на куриер, вече във формата на middleware-а
export async function loadOffices(courier) {
  const raw = await loadJson(`${BASE}/${COUNTRY}-${courier}-offices.txt`)
  const out = []
  for (const group of Object.values(raw || {})) {
    for (const o of group || []) {
      const locker = Number(o.isAPS) === 1
      const ctype  = locker ? `${courier}-locker` : courier
      const label  = `${locker ? TO_LOCKER : TO_OFFICE} ${ctype}[${o.code}]: ${o.name}`
      out.push({
        courier, ctype, locker,
        code:   String(o.code),
        name:   o.name,
        city:   o.city,
        cityEn: o.city_en || '',
        zip:    o.zip || '',
        label,
        search: normalize(`${o.name} ${o.city} ${o.city_en || ''} ${o.code}`),
      })
    }
  }
  return out
}

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Търсене по град / квартал / адрес / код. Всички думи от заявката трябва да се срещат.
export async function searchOffices(method, query, limit = 25) {
  const courier = METHOD_COURIER[method]
  if (!courier) return []
  const offices = await loadOffices(courier)
  const words = normalize(query).split(' ').filter(Boolean)
  if (!words.length) return []
  const hits = offices.filter(o => words.every(w => o.search.includes(w)))
  // Първо тези, чийто град започва с първата дума, после офисите пред автоматите
  const first = words[0]
  hits.sort((a, b) =>
    (normalize(b.city).startsWith(first) - normalize(a.city).startsWith(first)) ||
    (a.locker - b.locker) ||
    a.name.localeCompare(b.name, 'bg'))
  return hits.slice(0, limit).map(publicOffice)
}

export function publicOffice(o) {
  return { label: o.label, name: o.name, city: o.city, zip: o.zip, code: o.code, locker: o.locker }
}

// Намира офиса по записания в заявката текст. Точно съвпадение по кода, ако текстът
// е във формата на middleware-а; иначе — най-доброто предложение по думите (за стари
// заявки, писани на ръка), което админът потвърждава.
export async function resolveOffice(method, location) {
  const courier = METHOD_COURIER[method]
  if (!courier) return { ok: false, reason: 'unknown_method' }
  const offices = await loadOffices(courier)
  const m = String(location || '').match(LABEL_RE)
  if (m) {
    const [, ctype, code] = m
    const o = offices.find(x => x.ctype === ctype && x.code === code)
    if (o) return { ok: true, office: o }
  }
  // Предложение: думите от текста (без кратки и без „офис“, „град“ …)
  const STOP = new Set(['офис', 'град', 'гр', 'кв', 'ул', 'бул', 'жк', 'до', 'автомат', 'boxnow', 'box', 'now', 'speedy', 'econt', 'спиди', 'еконт', 'бокс', 'нау'])
  const words = normalize(location).split(' ').filter(w => w.length >= 3 && !STOP.has(w))
  let best = null, bestScore = 0
  for (const o of offices) {
    let score = 0
    for (const w of words) if (o.search.includes(w)) score += w.length
    // Номерът на офиса, ако е написан, тежи най-много
    if (words.includes(o.code)) score += 20
    if (score > bestScore) { best = o; bestScore = score }
  }
  return { ok: false, reason: 'not_selected', suggestion: best && bestScore >= 6 ? publicOffice(best) : null }
}

// Град и пощенски код от свободно написан адрес (за доставка до адрес)
export async function resolveCity(text) {
  const raw = await loadJson(`${BASE}/${COUNTRY}-${ADDRESS_COURIER}-cities.txt`)
  const norm = ` ${normalize(text)} `
  const zipInText = (String(text || '').match(/\b\d{4}\b/) || [])[0] || null
  let best = null
  for (const [cityName, byZip] of Object.entries(raw || {})) {
    const n = normalize(cityName)
    if (!n || !norm.includes(` ${n} `)) continue
    const zips = Object.keys(byZip || {})
    if (!best || n.length > best.n.length) {
      // Написаният пощенски код е по-точен (напр. 1715 за Младост), иначе — основният за града
      best = { n, city: cityName, zip: zipInText || zips[0] || '' }
    }
  }
  return best ? { city: best.city, zip: best.zip } : null
}

// Всичко нужно за Shopify поръчката — адрес + бележките за middleware-а.
// Връща { ok, address1, city, zip, noteAttributes, error? }
export async function buildMiddlewareShipping(method, location) {
  if (method === 'address') {
    const full = String(location || '').trim()
    const place = await resolveCity(full)
    if (!place) return { ok: false, error: 'city_not_found' }
    // Както в поръчките от количката: в address1 е само улицата, градът и кодът са отделно
    const street = stripPlace(full, place) || full
    return {
      ok: true,
      address1: street,
      city: place.city,
      zip: place.zip,
      noteAttributes: [
        { name: '_mw_shipping', value: `${TO_ADDRESS} ${ADDRESS_COURIER}` },
        { name: '_mw_address',  value: street },
      ],
    }
  }
  const r = await resolveOffice(method, location)
  if (!r.ok) return { ok: false, error: 'office_not_selected', suggestion: r.suggestion || null }
  const o = r.office
  return {
    ok: true,
    address1: o.label,
    city: o.city,
    zip: o.zip,
    noteAttributes: [
      { name: '_mw_shipping', value: `${o.locker ? TO_LOCKER : TO_OFFICE} ${o.courier}` },
      { name: '_mw_address',  value: o.label },
    ],
  }
}

// Маха града и пощенския код от свободно написания адрес → остава улицата
function stripPlace(text, place) {
  const esc = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let t = ` ${text} `
  if (place.zip) t = t.replace(new RegExp(`(^|[\\s,])${esc(place.zip)}(?=[\\s,]|$)`), '$1')
  if (place.city) t = t.replace(new RegExp(`(^|[\\s,])(?:гр\\.?\\s*|град\\s+)?${esc(place.city)}(?=[\\s,]|$)`, 'i'), '$1')
  return t.replace(/\s*,\s*(,\s*)+/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ')
}
