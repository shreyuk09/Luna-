// ───────────────────────────────────────────────────────────────────────────
// Knowledge grounding for the offline model.
//   • analyzeIntent(text)            — math / time / factual / advice / chat
//   • wikiAnswer(question, signal, ctx) — a targeted, cited Wikipedia answer
//   • calcExpression(s)              — safe local arithmetic
// Designed to actually answer questions: it resolves the entity, fetches the
// rich intro extract, and pulls out the specific fact (date, height, capital…),
// and resolves follow-ups like "how tall is it?" using the last entity.
// ───────────────────────────────────────────────────────────────────────────
const UA = { 'Api-User-Agent': 'LunaChat/1.0 (https://example.com; demo)' }
const WIKI = 'https://en.wikipedia.org/w/api.php'

const TZ_MAP = [
  [/kolkata|india|delhi|mumbai|bangalore|\bist\b/, 'Asia/Kolkata'],
  [/new york|nyc|eastern|\best\b/, 'America/New_York'],
  [/london|\buk\b|britain|england|\bgmt\b/, 'Europe/London'],
  [/tokyo|japan/, 'Asia/Tokyo'],
  [/los angeles|california|pacific|\bpst\b/, 'America/Los_Angeles'],
  [/sydney|australia/, 'Australia/Sydney'],
  [/paris|france|berlin|germany|\bcet\b/, 'Europe/Paris'],
  [/dubai|\buae\b|abu dhabi/, 'Asia/Dubai'],
  [/singapore/, 'Asia/Singapore'],
]
export function detectTimezone(t = '') {
  for (const [re, tz] of TZ_MAP) if (re.test(t.toLowerCase())) return tz
  return null
}

const GREETING = /^\s*(hi+|hey+|hello+|yo|sup|howdy|thanks|thank you|thx|ty|ok(ay)?|cool|nice|great|good (morning|afternoon|evening|night)|how are you|how's it going|who are you|what are you|what can you do|help)\s*[!.?]*$/i
// Pure factual lookups → cited Wikipedia. Everything else is taught by the model.
const LOOKUP_CUE = /^\s*(who|whom|whose|when|where|which)\b|\b(what (is|are|was|were)|who (is|was|were|invented|discovered|wrote|painted|created|founded)|capital of|population of|currency of|meaning of|definition of|how many|how much|how tall|how high|how old|how far|how long|height of|length of|inventor of|define)\b/i

export function analyzeIntent(text = '') {
  const t = text.trim()
  if (!t) return { kind: 'chat' }

  // "X% of Y" → percentage (before generic math, which would read % as modulo)
  const pct = t.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s*(\d+(?:\.\d+)?)/i)
  if (pct) return { kind: 'math', expression: `(${pct[1]}/100)*${pct[2]}`, display: `${pct[1]}% of ${pct[2]}` }

  // arithmetic
  const expr = t.replace(/[^-+*/%.()^\d\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/\d\s*[-+*/%^]\s*\(?\s*\d/.test(expr) && t.length < 60) {
    const words = t.replace(/calculate|compute|what'?s?|whats|how much|how many|is|the|result|of|equals?|plus|minus|times|divided|by|multiplied|add|sum/gi, '').replace(/[\d\s+\-*/%.()^]/g, '')
    if (words.replace(/[^a-z]/gi, '').length < 3) return { kind: 'math', expression: expr }
  }

  if (/\b(what time|current time|time right now|what'?s the time|today'?s date|what'?s the date|what day is)\b/i.test(t) ||
      (/\b(time|date|day)\b/i.test(t) && /\b(now|today|current|right now)\b/i.test(t))) {
    return { kind: 'time', timezone: detectTimezone(t) }
  }

  // Live weather (no key, open-meteo).
  if (/\b(weather|temperature|forecast|how (hot|cold)|is it raining|will it rain)\b/i.test(t)) {
    const loc = (t.match(/\b(?:in|at|for)\s+([A-Za-z .,'-]+?)\s*(?:today|now|right now|tomorrow|tonight)?\s*\??$/i)?.[1] || '').trim()
    return { kind: 'weather', location: loc }
  }
  // Current events / time-sensitive → live web search.
  if (/\b(latest|breaking|today'?s|currently|right now|this week|this year|recent(ly)?|news|who won|final score|stock price|share price|price of|cost of|release date|when (is|does)|how much (is|does))\b/i.test(t)) {
    return { kind: 'search', query: t }
  }

  if (GREETING.test(t)) return { kind: 'chat' }

  // Short, explicit factual lookup → cited Wikipedia.
  const wordCount = t.split(/\s+/).length
  const bareEntity = wordCount <= 2 && /^[a-z0-9 .'’-]+$/i.test(t) && !/^(why|how|the|a|an)\b/i.test(t)
  if (LOOKUP_CUE.test(t) || bareEntity) return { kind: 'lookup', question: t }

  // Everything else — "explain X", "give detailed information on X", "X in DBMS",
  // "compare A and B", "write …" — is a real request to be answered/taught.
  return { kind: 'generate', question: t }
}

// ── Question → {leadType, searchQuery, needsEntity} ─────────────────────────
const PRONOUN = /\b(it|its|it's|that|this|they|them|those|these|he|she|him|her|his|hers|their|theirs)\b/i

function classify(question, priorEntity) {
  const q = question.trim().replace(/[?!.]+$/, '')
  let m

  if ((m = q.match(/capital of (?:the )?(.+)/i))) return { leadType: 'capital', searchQuery: `capital of ${m[1]}`, entity: m[1] }
  if ((m = q.match(/population of (?:the )?(.+)/i))) return { leadType: 'population', searchQuery: `${m[1]} population`, entity: m[1] }
  if ((m = q.match(/(?:who (?:invented|discovered|created|founded|built|wrote|painted|composed|directed)|inventor of|invention of) (?:the )?(.+)/i)))
    return { leadType: 'who', searchQuery: m[1], entity: m[1] }

  const entity = resolveEntity(q, priorEntity)
  if (/\b(how long|length of|how far)\b/i.test(q)) return { leadType: 'length', searchQuery: entity, entity }
  if (/\b(how tall|how high|height of|tall is)\b/i.test(q)) return { leadType: 'height', searchQuery: entity, entity }
  if (/\b(born|birth|birthday|date of birth)\b/i.test(q)) return { leadType: 'born', searchQuery: entity, entity }
  if (/\b(die|died|death|passed away)\b/i.test(q)) return { leadType: 'died', searchQuery: entity, entity }
  if (/\b(founded|established|built|created|when.*(made|start))\b/i.test(q)) return { leadType: 'founded', searchQuery: entity, entity }
  if (/\b(population|how many people)\b/i.test(q)) return { leadType: 'population', searchQuery: entity, entity }
  return { leadType: 'define', searchQuery: entity || q, entity }
}

// Strip question scaffolding to the core entity; resolve pronouns to context.
export function resolveEntity(question, priorEntity = '') {
  let s = question.trim().replace(/[?!.]+$/, '')
  if (PRONOUN.test(s) && priorEntity) {
    // "how tall is it" → use the previous subject
    return priorEntity
  }
  s = s
    .replace(/^\s*(who|whom|whose|what|whats|what's|when|where|why|which|how (many|much|tall|high|old|far|big|long|wide|deep)|how|is|are|was|were|did|does|do|can you|could you|please|tell me about|tell me|give me|name|list|explain|describe|define|the|a|an)\b\s*/gi, '')
    .replace(/^\s*(invented|invention of|discovered|created|founded|built)\b\s*/gi, '')
    .replace(/\b(born|birth|birthday|die|died|death|height|tall|high|population|invented|inventor|discovered|founded|established|located|situated|mean|means|meaning)\b\s*$/gi, '')
    .replace(/^\s*(the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s && priorEntity) return priorEntity
  return s
}

// ── Live Wikipedia answer ────────────────────────────────────────────────────
export async function wikiAnswer(question, signal, priorEntity = '') {
  const { leadType, searchQuery } = classify(question, priorEntity)
  const page = await fetchIntro(searchQuery, signal)
  if (!page) return null
  const lead = extractLead(page.extract, leadType, page.title)
  const body = firstSentences(page.extract, lead ? 2 : 3)
  return { title: page.title, entity: page.title, lead, extract: body, url: page.url }
}

async function fetchIntro(query, signal) {
  const q = (query || '').trim()
  if (!q) return null
  // 1) resolve best title
  const sUrl = `${WIKI}?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${encodeURIComponent(q)}`
  const sRes = await fetch(sUrl, { signal, headers: UA })
  if (!sRes.ok) return null
  const sData = await sRes.json()
  const title = sData?.query?.search?.[0]?.title
  if (!title) return null
  // 2) rich intro extract (contains dates, heights, etc.)
  const eUrl = `${WIKI}?action=query&prop=extracts|info&inprop=url&exintro&explaintext&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`
  const eRes = await fetch(eUrl, { signal, headers: UA })
  if (!eRes.ok) return null
  const eData = await eRes.json()
  const pages = eData?.query?.pages || {}
  const page = Object.values(pages)[0]
  const extract = (page?.extract || '').replace(/\([^)]*[ɐ-ʯͰ-ϿÀ-ɏ][^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim()
  if (!extract) return null
  return { title: page.title || title, extract, url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` }
}

function firstSentences(text, n) {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [text]
  return parts.slice(0, n).join(' ').trim()
}

function extractLead(extract, leadType, title) {
  const t = extract
  const yearParen = t.match(/\(([^)]*\b\d{3,4}\b[^)]*)\)/)
  const dates = yearParen ? yearParen[1].split(/–|—|-|\bto\b/).map((s) => s.trim()) : []
  switch (leadType) {
    case 'born':
      if (dates[0] && /\d{3,4}/.test(dates[0])) return `${title} was born on ${dates[0].replace(/^born\s*/i, '')}.`
      break
    case 'died':
      if (dates[1] && /\d{3,4}/.test(dates[1])) return `${title} died on ${dates[1]}.`
      break
    case 'height': {
      const h = t.match(/\b(\d[\d,]*(?:\.\d+)?)\s*(metres|meters|m|ft|feet|kilometres|kilometers|km)\b/i)
      if (h) return `${title} is ${h[1]} ${h[2]} tall.`
      break
    }
    case 'length': {
      const l = t.match(/\b(\d[\d,]*(?:\.\d+)?)\s*(kilometres|kilometers|km|miles|mi|metres|meters|m)\b/i)
      if (l) return `${title} is about ${l[1]} ${l[2]} long.`
      break
    }
    case 'capital': {
      const c = t.match(/capital[^.]*?\bis\s+([A-Z][A-Za-z.'\- ]+?)[.,(]/) || t.match(/^[^.]*?\bis\s+([A-Z][A-Za-z.'\- ]+?)[.,(]/)
      if (c) return `The capital is ${c[1].trim()}.`
      break
    }
    case 'population': {
      const p = t.match(/population[^.]*?\b(?:of|is|was|about|approximately|over|around)?\s*([\d][\d,]{2,}(?:\.\d+)?\s*(?:million|billion)?)/i)
      if (p) return `Population: ${p[1].trim()}.`
      break
    }
    case 'founded': {
      const f = t.match(/\b(?:built|founded|established|constructed|completed|created|opened)[^.]*?\b(\d{3,4})\b/i)
      if (f) return `${title}: ${f[0].trim()}.`
      break
    }
    case 'who': {
      const w = t.match(/\b(?:by|named after|attributed to|credited to|developed by|invented by|designed by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,2})/)
      if (w) return `${w[1]} — ${title}.`
      break
    }
    default:
      break
  }
  return null
}

// ── Live weather (open-meteo, CORS-enabled, no key) ─────────────────────────
export const WEATHER_CODES = { 0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog', 51: 'light drizzle', 53: 'drizzle', 55: 'dense drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'rain showers', 81: 'rain showers', 82: 'violent showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorm', 96: 'thunderstorm w/ hail', 99: 'thunderstorm w/ hail' }

export async function getWeather(location, signal) {
  const place = (location || '').trim()
  if (!place) return null
  const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`, { signal }).then((r) => r.json()).catch(() => null)
  const top = g?.results?.[0]
  if (!top) return null
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${top.latitude}&longitude=${top.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m`, { signal }).then((r) => r.json()).catch(() => null)
  const c = w?.current
  if (!c) return null
  return {
    name: `${top.name}${top.country ? ', ' + top.country : ''}`,
    temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature),
    desc: WEATHER_CODES[c.weather_code] || 'unknown', wind: c.wind_speed_10m, humidity: c.relative_humidity_2m,
    unit: w.current_units?.temperature_2m || '°C',
  }
}

// ── Live web search via the same-origin /search proxy ───────────────────────
export async function webSearch(query, signal) {
  try {
    const r = await fetch(`/search?q=${encodeURIComponent(query)}`, { signal })
    if (!r.ok) return []
    return (await r.json())?.results || []
  } catch { return [] }
}

export function calcExpression(raw) {
  const expr = String(raw).trim()
  if (!/^[\d+\-*/%.()^\s]+$/.test(expr)) throw new Error('not arithmetic')
  // eslint-disable-next-line no-new-func
  const v = Function(`"use strict"; return (${expr.replace(/\^/g, '**')});`)()
  if (typeof v !== 'number' || !isFinite(v)) throw new Error('bad expression')
  return Math.round(v * 1e10) / 1e10
}

// Find the most recent grounded subject (a cited Wikipedia title) in history.
export function lastEntityFrom(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const c = typeof m.content === 'string' ? m.content : ''
    const hit = c.match(/\[([^\]]+?)\s*—\s*Wikipedia\]/) || c.match(/\[([^\]]+?)\]\(https?:\/\/[^)]*wikipedia/)
    if (hit) return hit[1].trim()
  }
  return ''
}
