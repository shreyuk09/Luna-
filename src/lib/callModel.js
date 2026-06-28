// ───────────────────────────────────────────────────────────────────────────
// Single choke-point for every model call. Providers: 'free' (keyless Free AI
// via the built-in /ai proxy), 'gemini' (your Google API key, called direct
// from the browser), and 'mock' (fully offline grounding). Math/time are exact
// & local, facts are grounded in cited Wikipedia, and the rest goes to the model.
//
//   callModel({ system, messages, json, onToken, signal }) -> Promise<string>
//
//   system   : string system prompt
//   messages : [{ role: 'user'|'assistant', content: string }]
//   json     : when true, ask for raw JSON and skip streaming
//   onToken  : (chunk) => void   incremental tokens (ignored in json mode)
//   signal   : AbortSignal to cancel an in-flight stream
// ───────────────────────────────────────────────────────────────────────────
import { load, save } from './storage.js'
import { analyzeIntent, wikiAnswer, calcExpression, resolveEntity, lastEntityFrom, getWeather, webSearch } from './knowledge.js'

export function getSettings() {
  return load('settings', {
    provider: 'free', // 'free' (no-key AI) | 'mock' (offline) | 'gemini' (your key)
    apiKey: '',
    model: 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  })
}

export function hasLiveModel() {
  const s = getSettings()
  return (s.provider === 'gemini' || s.provider === 'custom') && !!s.apiKey
}

export function modelLabel() {
  const s = getSettings()
  if (s.provider === 'gemini' && s.apiKey) return 'Gemini'
  if (s.provider === 'custom' && s.apiKey) return (s.model || 'Custom').slice(0, 16)
  if (s.provider === 'mock') return 'Offline'
  return 'Free AI'
}

// An online model (Free AI / Gemini / Custom) is available unless we're offline.
function isOnline() {
  return getSettings().provider !== 'mock'
}

// Complete a prompt with whatever model is configured: Gemini or a Custom
// OpenAI-compatible key when set (falling back to Free AI on any error so the
// chat never dead-ends and the user's selection is kept), else the Free AI proxy.
// Once a key fails auth, remember it for the session so we don't keep retrying
// the broken key (slow) or nagging — we just use Free AI silently.
const brokenKeys = new Set()
const keyId = (s) => `${s.provider}:${(s.apiKey || '').slice(0, 10)}`
const isAuthError = (e) => /api key not valid|invalid.*key|invalid api key|unauthorized|forbidden|incorrect api key|\b400\b|\b401\b|\b403\b/i.test(e?.message || '')

async function complete(system, messages, signal) {
  const s = getSettings()
  if (s.provider === 'gemini' && s.apiKey && !brokenKeys.has(keyId(s))) {
    try { return await callGemini(s, system, messages, signal) }
    catch (e) { if (e.name === 'AbortError') throw e; if (isAuthError(e)) brokenKeys.add(keyId(s)); return await freeLLM(system, messages, signal) }
  }
  if (s.provider === 'custom' && s.apiKey && !brokenKeys.has(keyId(s))) {
    try { return await customLLM(system, messages, signal) }
    catch (e) { if (e.name === 'AbortError') throw e; if (isAuthError(e)) brokenKeys.add(keyId(s)); return await freeLLM(system, messages, signal) }
  }
  return await freeLLM(system, messages, signal)
}

export async function callModel({ system, messages, json = false, onToken, signal, task }) {
  // All providers route through callMock, which streams output and decides
  // online (Gemini / Free AI) vs offline grounding internally.
  return callMock({ system, messages, json, onToken, signal, task })
}

let modelWarned = false
function notifyModelFallback(reason) {
  if (!modelWarned && typeof window !== 'undefined') {
    modelWarned = true
    window.dispatchEvent(new CustomEvent('lagoon:model-fallback', { detail: reason }))
  }
}

// ── Gemini provider (Google Generative Language API, direct browser call) ────
// Real token streaming when onToken is given, plus image/file parts (vision).
// The text the model should actually read for a message: the typed text plus,
// if a document was attached, its extracted contents inline. Used by every
// engine (Free AI / Gemini / Custom) so docs work without a key.
function effectiveText(m) {
  const txt = blockText(m.content)
  const doc = m.attachment?.text
  if (doc) {
    const head = `[Attached document: ${m.attachment.name || 'file'}]`
    return `${txt ? txt + '\n\n' : ''}${head}\n"""\n${doc}\n"""`
  }
  return txt
}

function geminiParts(m) {
  const parts = []
  const txt = effectiveText(m)
  if (txt) parts.push({ text: txt })
  if (m.attachment?.dataUrl) {
    const [meta, b64] = m.attachment.dataUrl.split(',')
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || m.attachment.mimeType || 'image/png'
    if (b64) parts.push({ inlineData: { mimeType: mime, data: b64 } })
  }
  return parts
}

async function callGemini(s, system, messages, signal, onToken) {
  const key = (s.apiKey || '').trim()
  const model = (s.model || 'gemini-2.0-flash').trim().replace(/^models\//, '')
  const base = (s.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
  const contents = messages
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: geminiParts(m) }))
    .filter((c) => c.parts.length)
  const body = { contents, generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const post = (verb, extra = '') => fetch(`${base}/models/${model}:${verb}?key=${encodeURIComponent(key)}${extra}`,
    { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const errOf = async (res) => {
    let msg = ''
    try { msg = (await res.json())?.error?.message } catch { /* */ }
    return new Error(`Gemini ${res.status}: ${msg || res.statusText || 'request failed'}`.slice(0, 240))
  }

  // 1) Try real token streaming (best UX). If the streaming endpoint is blocked
  //    (e.g. CORS) we silently fall through to the reliable non-streaming call.
  if (onToken) {
    try {
      const res = await post('streamGenerateContent', '&alt=sse')
      if (res.ok && res.body) {
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        let full = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            const tr = line.trim()
            if (!tr.startsWith('data:')) continue
            const payload = tr.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const j = JSON.parse(payload)
              const t = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join('')
              if (t) { full += t; onToken(t) }
            } catch { /* partial frame */ }
          }
        }
        if (full) return full
      }
      // not ok / empty → fall through to non-streaming below
    } catch (e) {
      if (e.name === 'AbortError') throw e
      // streaming failed (often CORS) → fall through to non-streaming
    }
  }

  // 2) Non-streaming (CORS-reliable). The source of truth for errors.
  const res = await post('generateContent')
  if (!res.ok) throw await errOf(res)
  const data = await res.json()
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join('')
  if (!text) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason
    throw new Error(`Gemini returned no text${reason ? ` (${reason})` : ''}`)
  }
  if (onToken) onToken(text) // emit once so the streamed path still fills the message
  return text
}

// ───────────────────────────────────────────────────────────────────────────
// Tool-use step. Given the conversation (Anthropic block format) and a tool
// list, returns { text, toolUses: [{id,name,input}] }. One step of the agentic
// loop — the caller executes any toolUses (via MCP) and calls again.
// ───────────────────────────────────────────────────────────────────────────
export async function callModelTools({ system, messages, tools, signal }) {
  // Tools are planned heuristically; the answer comes from the configured online
  // model (Gemini / Free AI) via chatAnswer, so MCP works with any provider.
  return mockToolStep({ system, messages, tools, signal })
}

// Mock tool reasoning: pick a tool from the user's text, or — once tool results
// are present — synthesize a final answer that cites them.
async function mockToolStep({ system, messages, tools, signal }) {
  await sleep(200, signal)
  const names = new Set((tools || []).map((t) => t.name))
  const hasResults = messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'tool_result'))

  // Only consider tool results produced AFTER the current question, so a new
  // question in an ongoing chat re-plans instead of reusing the last answer.
  const lastQuestionIdx = lastUserTextIndex(messages)
  const recent = messages.slice(lastQuestionIdx + 1)
  const results = []
  recent.forEach((m) => {
    if (Array.isArray(m.content)) m.content.forEach((c) => { if (c.type === 'tool_result') results.push(c) })
  })
  if (results.length) {
    return { text: mockFinalAnswer(userTextAt(messages, lastQuestionIdx), results), toolUses: [] }
  }

  const userText = userTextAt(messages, lastQuestionIdx)
  const priorEntity = lastEntityFrom(messages.slice(0, lastQuestionIdx))
  const plan = planMockTool(userText, names, priorEntity)
  if (plan) {
    return { text: `Let me use the **${plan.name}** tool for that.`, toolUses: [{ id: 'mock_' + plan.name, name: plan.name, input: plan.input }] }
  }
  // no tool needed — answer normally (free AI when enabled, else offline)
  return { text: await chatAnswer({ system, messages, signal }), toolUses: [] }
}

function planMockTool(text, names, priorEntity = '') {
  const intent = analyzeIntent(text)
  if (intent.kind === 'math' && names.has('calculator')) {
    return { name: 'calculator', input: { expression: intent.expression } }
  }
  if (intent.kind === 'time' && names.has('current_datetime')) {
    return { name: 'current_datetime', input: intent.timezone ? { timezone: intent.timezone } : {} }
  }
  if (intent.kind === 'lookup') {
    const query = resolveEntity(text, priorEntity) || text
    if (names.has('wikipedia_answer')) return { name: 'wikipedia_answer', input: { query } }
    if (names.has('web_search')) return { name: 'web_search', input: { query } }
  }
  // explain / generate / chat → no tool; the model answers directly.
  return null
}

// Index of the latest user message that is an actual question (plain text or a
// text block) — i.e. not a tool_result turn.
function lastUserTextIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    if (typeof m.content === 'string') return i
    if (Array.isArray(m.content) && m.content.some((c) => c.type === 'text')) return i
  }
  return -1
}
function userTextAt(messages, idx) {
  const m = messages[idx]
  if (!m) return ''
  if (typeof m.content === 'string') return m.content
  return (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ')
}

function mockFinalAnswer(userText, results) {
  const joined = results
    .map((r) => (Array.isArray(r.content) ? r.content.map((c) => c.text).join('\n') : String(r.content || '')))
    .join('\n\n')
    .trim()
  // Tool results are already answer-shaped (extract + Source line, or a value).
  return joined || 'The tool returned no result.'
}


// ── Mock provider — deterministic, streams, understands our JSON tasks ───────
async function callMock({ system, messages, json, onToken, signal, task }) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

  if (json) {
    // Topic segmentation stays deterministic & instant.
    if (/segmenter|EXISTING_TOPICS_JSON/i.test(system)) {
      await sleep(280, signal)
      return mockJson(system, messages, lastUser)
    }
    // JSON note tasks (flashcards) — generate from the real transcript when online.
    if (isOnline()) {
      try {
        return await complete(`${system}\n\nReturn ONLY a JSON array of {"q","a"} objects (6-10 items). No prose, no code fences.`, messages, signal)
      } catch (e) { if (e.name === 'AbortError') return '' /* fall back to extractive */ }
    }
    return extractiveNote(system, lastUser)
  }

  // Notes/format tasks use the model when available; a real chat turn is routed:
  // math/time → exact local, facts → cited Wikipedia, everything else → free AI.
  const isNoteTask = task === 'note'
  let text
  if (isNoteTask) {
    if (isOnline()) {
      try { text = await complete(system, messages, signal) } catch (e) { if (e.name === 'AbortError') return ''; text = extractiveNote(system, lastUser) }
    } else text = extractiveNote(system, lastUser)
  } else {
    const out = await chatAnswer({ system, messages, signal, onToken, forceSearch: task === 'search', forceResearch: task === 'research' })
    if (out.streamed) return out.text // Gemini already streamed live tokens
    text = out.text
  }

  // Stream word-by-word for a realistic typing effect (local/free answers).
  const tokens = (text || '').match(/\S+\s*/g) || [text]
  for (const tk of tokens) {
    if (signal?.aborted) break
    onToken?.(tk)
    await sleep(8 + Math.random() * 16, signal)
  }
  return text
}

// Route a chat turn: exact math/time, cited facts, else a real (free) AI answer.
// Route a chat turn to a real, substantive answer. Never returns meta-advice
// templates or "rephrase your question" deflections.
// Returns { text, streamed }. `streamed` true means tokens were already emitted
// to onToken (real streaming), so the caller shouldn't re-stream.
async function chatAnswer({ system, messages, signal, onToken, forceSearch, forceResearch }) {
  const idx = lastUserTextIndex(messages)
  const user = userTextAt(messages, idx)
  const priorEntity = lastEntityFrom(messages)
  const intent = analyzeIntent(user)
  const online = isOnline()
  const plain = (t) => ({ text: t, streamed: false })
  // Calls the model (Gemini streams live to onToken; Free AI returns full text).
  const model = async () => {
    const s = getSettings()
    if (s.provider === 'gemini' && s.apiKey && !brokenKeys.has(keyId(s))) {
      try { return { text: await callGemini(s, system, messages, signal, onToken), streamed: !!onToken } }
      catch (e) { if (e.name === 'AbortError') return plain(''); if (isAuthError(e)) brokenKeys.add(keyId(s)); try { return plain(await freeLLM(system, messages, signal)) } catch { return plain('') } }
    }
    if (s.provider === 'custom' && s.apiKey && !brokenKeys.has(keyId(s))) {
      try { return plain(await customLLM(system, messages, signal)) }
      catch (e) { if (e.name === 'AbortError') return plain(''); if (isAuthError(e)) brokenKeys.add(keyId(s)); try { return plain(await freeLLM(system, messages, signal)) } catch { return plain('') } }
    }
    // Free AI — if the free service is down, return '' so the caller falls
    // through to cited Wikipedia / offline grounding instead of erroring.
    try { return plain(await freeLLM(system, messages, signal)) }
    catch (e) { if (e.name === 'AbortError') return plain(''); return plain('') }
  }

  // If the user attached a document or image, answer FROM it — skip the
  // knowledge router (Wikipedia/web/math), which would ignore the attachment.
  const attached = messages[idx]?.attachment
  if (attached?.text || attached?.dataUrl) return await model()

  // Explicit "Deep research" action — gather many sources, synthesize a cited report.
  if (forceResearch) {
    const report = await deepResearch(user, system, signal)
    if (report) return plain(report)
    if (online) { const r = await model(); if (r.text) return r }
  }

  // Explicit "Web search" action — go straight to live web results.
  if (forceSearch) {
    const hits = await webSearch(user, signal)
    if (hits.length) {
      const body = hits.map((h, i) => `${i + 1}. **[${h.title}](${h.url})**\n   ${h.snippet}`).join('\n\n')
      return plain(`Here's what I found on the web just now:\n\n${body}\n\n_Live web search results — open a link to verify._`)
    }
    if (online) { const r = await model(); if (r.text) return r }
  }

  if (intent.kind === 'chat') return plain(greetingReply(user))
  if (intent.kind === 'math') {
    try { const v = calcExpression(intent.expression); return plain(`**${(intent.display || intent.expression).trim()} = ${v}**\n\n_Computed locally — exact arithmetic._`) } catch { /* fall through */ }
  }
  if (intent.kind === 'time') return plain(timeReply(intent))

  // Live weather (open-meteo, real-time, no key).
  if (intent.kind === 'weather') {
    const w = await getWeather(intent.location, signal).catch(() => null)
    if (w) return plain(`**${w.name} — ${w.temp}${w.unit}, ${w.desc}** (feels like ${w.feels}${w.unit}).\n\nWind ${w.wind} km/h · Humidity ${w.humidity}%.\n\n_Live from open-meteo._`)
    // no location resolved → let the model handle it
  }

  // Current events / time-sensitive → live web search.
  if (intent.kind === 'search') {
    const hits = await webSearch(intent.query, signal)
    if (hits.length) {
      const body = hits.map((h, i) => `${i + 1}. **[${h.title}](${h.url})**\n   ${h.snippet}`).join('\n\n')
      return plain(`Here's what I found on the web just now:\n\n${body}\n\n_Live web search results — open a link to verify._`)
    }
    if (online) { const r = await model(); if (r.text) return r }
  }

  // Pure factual lookup ("what is / who is / capital of …") → cited Wikipedia.
  if (intent.kind === 'lookup') {
    const w = await wikiReply(user, signal, priorEntity)
    if (w) return plain(w)
    if (online) { const r = await model(); if (r.text) return r }
    const w2 = await wikiReply(user, signal, priorEntity)
    return plain(w2 || offlineNote())
  }

  // Explain / teach / generate → the model; grounded Wikipedia fallback offline.
  if (online) { const r = await model(); if (r.text) return r }
  const w = await wikiReply(user, signal, priorEntity)
  return plain(w || offlineNote())
}

// Deep research: gather sources from several angles, then have the active model
// synthesize a structured, cited report grounded ONLY in those sources. A real
// Sources list is appended so the answer is verifiably grounded (High accuracy).
async function deepResearch(query, system, signal) {
  const q = (query || '').trim()
  if (!q) return ''
  const angles = [q, `${q} overview`, `${q} latest developments`, `${q} pros and cons`, `${q} explained`]
  const sources = []
  for (const a of angles) {
    if (signal?.aborted) break
    const hits = await webSearch(a, signal).catch(() => [])
    for (const h of hits) {
      if (h?.url && !sources.some((s) => s.url === h.url)) sources.push(h)
    }
    if (sources.length >= 10) break
  }
  if (!sources.length) return '' // caller falls back to the model

  const top = sources.slice(0, 10)
  const context = top.map((h, i) => `[${i + 1}] ${h.title}\n${h.snippet}\nURL: ${h.url}`).join('\n\n')
  const researchSystem = `${system}\n\nYou are doing DEEP RESEARCH. Using ONLY the numbered web sources provided, write a thorough, well-structured report in markdown:\n- a 1–2 sentence overview\n- clear sections with ## headings\n- concrete findings as bullet points\n- a balanced view (note disagreements or gaps in the sources)\nCite inline like [1], [2] next to each claim. Do NOT invent facts beyond the sources. If the sources are thin, say so honestly.`
  const rmessages = [{ role: 'user', content: `Research question: ${q}\n\nWeb sources:\n${context}` }]

  let body = ''
  try { body = await complete(researchSystem, rmessages, signal) } catch (e) { if (e.name === 'AbortError') return ''; body = '' }
  if (!body) return ''

  const sourceList = top.map((h, i) => `${i + 1}. [${h.title}](${h.url})`).join('\n')
  return `🔬 **Deep research — ${q}**\n\n${body}\n\n---\n**Sources**\n${sourceList}\n\n_Synthesized from ${top.length} live web sources — open any link to verify._`
}

function timeReply(intent) {
  const d = new Date()
  const opts = { dateStyle: 'full', timeStyle: 'short' }
  if (intent.timezone) opts.timeZone = intent.timezone
  let f
  try { f = new Intl.DateTimeFormat('en-US', opts).format(d) } catch { f = d.toString() }
  return `It's **${f}**${intent.timezone ? ` (${intent.timezone})` : ' — your local time'}.`
}

async function wikiReply(user, signal, priorEntity) {
  let hit = null
  try { hit = await wikiAnswer(user, signal, priorEntity) } catch (e) { if (e.name === 'AbortError') return '' }
  if (!hit) return null
  const lead = hit.lead ? `**${hit.lead}**\n\n` : ''
  return `${lead}${hit.extract}\n\n**Source:** [${hit.title} — Wikipedia](${hit.url})`
}

function greetingReply(user) {
  const t = (user || '').trim()
  if (/who are you|what are you|what can you do/i.test(t)) {
    return `I'm **Luna**, an AI assistant. I answer questions across technical, academic, scientific, and general topics — explanations, definitions, comparisons, code, math, the current time, and factual lookups (with a cited source and an accuracy chip). I also organize our chat into topics and can turn it into notes or flashcards. Ask me anything.`
  }
  return `Hi! I'm **Luna** 🌊. Ask me anything — I'll explain concepts in depth, answer factual questions with a cited source, do math, or work through a problem with you. What would you like to know?`
}

// Honest, non-deflecting note — only reached when fully offline with no match.
// Does not ask the user to rephrase and is not meta-advice.
function offlineNote() {
  return `I couldn't reach the answer model just now — the free service may be momentarily busy. Please try again in a moment, or switch to **Gemini** in ⚙️ Settings (add your API key) for a reliable answer.`
}

// ── Free, no-key AI via the local helper server (/ai proxy) ─────────────────
// (Browsers can't reach the upstream free model directly — it now requires an
// anti-bot token — so we go through the local Node server, which can.)
// Same-origin proxy (built into the Vite server) first, then the optional
// standalone helper server as a fallback.
export function getAiEndpoints() {
  const list = ['/ai']
  try {
    const mcp = load('mcp', { url: 'http://localhost:8787/mcp' })
    list.push(mcp.url.replace(/\/mcp\/?$/, '/ai'))
  } catch { list.push('http://localhost:8787/ai') }
  return list
}

async function freeLLM(system, messages, signal) {
  const msgs = messages.map((m) => ({ role: m.role, content: effectiveText(m) })).filter((m) => m.content && m.role !== 'system')
  const payload = JSON.stringify({ system, messages: msgs })
  let lastErr
  for (const url of getAiEndpoints()) {
    try {
      const res = await fetch(url, { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: payload })
      if (!res.ok) { lastErr = new Error(`Free AI error ${res.status}`); continue }
      const txt = stripAds((await res.json())?.content || '')
      if (txt) return txt
      lastErr = new Error('Free AI returned nothing')
    } catch (e) {
      if (e.name === 'AbortError') throw e
      lastErr = e
    }
  }
  signalFreeUnavailable()
  throw lastErr || new Error('Free AI unreachable')
}

// Custom OpenAI-compatible provider (any key/endpoint) — routed through the
// local /ai proxy server-side so browser CORS never blocks it. Supports vision.
function oaContent(m) {
  const txt = effectiveText(m)
  if (m.attachment?.dataUrl) {
    return [...(txt ? [{ type: 'text', text: txt }] : []), { type: 'image_url', image_url: { url: m.attachment.dataUrl } }]
  }
  return txt
}
async function customLLM(system, messages, signal) {
  const s = getSettings()
  const msgs = messages
    .map((m) => ({ role: m.role === 'model' ? 'assistant' : m.role, content: oaContent(m) }))
    .filter((m) => (typeof m.content === 'string' ? m.content : m.content.length) && m.role !== 'system')
  const res = await fetch('/ai', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system, messages: msgs, endpoint: s.baseUrl, apiKey: s.apiKey, model: s.model }),
  }).catch((e) => { if (e.name === 'AbortError') throw e; throw new Error('Custom API: server unreachable') })
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Custom API error ${res.status}`)
  const txt = stripAds((await res.json())?.content || '')
  if (!txt) throw new Error('Custom API returned no text')
  return txt
}

let freeWarned = false
function signalFreeUnavailable() {
  if (!freeWarned && typeof window !== 'undefined') {
    freeWarned = true
    window.dispatchEvent(new CustomEvent('lagoon:free-unavailable'))
  }
}

function blockText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((c) => (c.type === 'text' ? c.text : c.type === 'tool_result' ? `Tool result: ${typeof c.content === 'string' ? c.content : ''}` : '')).join(' ').trim()
  }
  return ''
}

function stripAds(t) {
  return String(t)
    .replace(/\n*-{2,}\n*\*\*Support Pollinations[\s\S]*$/i, '')
    .replace(/\n*🌸[\s\S]*$/i, '')
    .replace(/\n*\*\*Ad\*\*[\s\S]*$/i, '')
    .replace(/\n*Powered by Pollinations[\s\S]*$/i, '')
    .trim()
}

// ── Extractive notes from the real transcript ───────────────────────────────
// Used when no model is available (offline) or the free server is unreachable,
// so the Notes always reflect the actual conversation — never a generic template.
function parseTurns(t) {
  return String(t).split(/\n\n(?=User:|Assistant:)/)
    .map((s) => { const m = s.match(/^\s*(User|Assistant):\s*([\s\S]*)$/); return m ? { role: m[1].toLowerCase(), text: m[2].trim() } : null })
    .filter(Boolean)
}
const firstSent = (s = '', n = 2) => (String(s).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [String(s)]).slice(0, n).join(' ').trim() || String(s).slice(0, 200)
const cleanQ = (q = '') => q.replace(/\s+/g, ' ').replace(/[?.!]+$/, '').trim()

function extractiveNote(system, transcript) {
  const turns = parseTurns(transcript)
  const asst = turns.filter((t) => t.role === 'assistant' && t.text)
  const pairs = []
  turns.forEach((t, i) => {
    if (t.role === 'user') {
      const a = turns.slice(i + 1).find((x) => x.role === 'assistant')
      if (a) pairs.push({ q: t.text, a: a.text })
    }
  })

  if (/flashcard/i.test(system)) {
    const cards = pairs.slice(0, 10).map((p) => ({ q: cleanQ(p.q), a: firstSent(p.a, 2) }))
    return JSON.stringify(cards.length ? cards : [{ q: 'What was this chat about?', a: firstSent(asst[0]?.text || transcript, 2) }])
  }
  if (/faq/i.test(system)) {
    return pairs.slice(0, 6).map((p) => `**Q: ${cleanQ(p.q)}?**\nA: ${firstSent(p.a, 2)}`).join('\n\n') || 'No questions in this chat yet.'
  }
  if (/key.?points/i.test(system)) {
    return (asst.length ? asst : [{ text: transcript }]).map((t) => `- ${firstSent(t.text, 1)}`).join('\n')
  }
  if (/action items/i.test(system)) {
    const acts = []
    asst.forEach((t) => (t.text.match(/[^.!?]*\b(should|need to|must|next step|recommend|make sure|try|consider|start by|remember to)\b[^.!?]*[.!?]/gi) || []).forEach((s) => acts.push(s.trim())))
    const uniq = [...new Set(acts)].slice(0, 8)
    return (uniq.length ? uniq : ['Review the key points from this chat']).map((a) => `- [ ] ${a.replace(/^[-*]\s*/, '')}`).join('\n')
  }
  if (/exam notes/i.test(system)) {
    const facts = asst.map((t) => `- ${firstSent(t.text, 1)}`).join('\n')
    const qs = pairs.slice(0, 5).map((p) => `- ${cleanQ(p.q)}?`).join('\n')
    return `## Exam Notes\n\n**Key facts**\n${facts || '- (none yet)'}\n\n**Likely questions**\n${qs || '- (none yet)'}`
  }
  // summary
  const topics = pairs.map((p) => cleanQ(p.q)).slice(0, 4).join('; ')
  const body = asst.map((t) => firstSent(t.text, 2)).join(' ')
  return `This conversation covered ${topics || 'the topics discussed'}.\n\n${body || transcript.slice(0, 300)}`.trim()
}

function mockJson(system, messages, lastUser) {
  // Topic segmentation task.
  if (/segmenter|EXISTING_TOPICS_JSON/i.test(system)) {
    let existing = []
    try {
      const m = system.match(/EXISTING_TOPICS_JSON:\s*(\[[\s\S]*?\])/)
      if (m) existing = JSON.parse(m[1])
    } catch { /* ignore */ }
    // The exchange arrives as "User: ...\n\nAssistant: ...". Name from the user turn.
    const userTurn = (lastUser.match(/User:\s*([\s\S]*?)(?:\n\nAssistant:|$)/i)?.[1] || lastUser).trim()
    const title = guessTopic(userTurn)
    const key = title.toLowerCase().split(' ')[0]
    const match = existing.find(
      (t) => !t.title?.toLowerCase().includes('unsorted') &&
        (similar(t.title, title) || (key && t.title?.toLowerCase().includes(key)) || (t.title && userTurn.toLowerCase().includes(t.title.toLowerCase().split(' ')[0])))
    )
    if (match) {
      return JSON.stringify({ topicId: match.id, summaryOneLine: oneLine(userTurn) })
    }
    return JSON.stringify({ topicId: 'new', title, summaryOneLine: oneLine(userTurn) })
  }

  // Notes generation tasks return markdown wrapped per format; here just echo.
  return JSON.stringify({ content: mockReply(system, lastUser) })
}

function mockReply(system, user) {
  if (/flashcard/i.test(system)) {
    return JSON.stringify([
      { q: 'What is the core idea discussed?', a: deriveAnswer(user) },
      { q: 'Why does it matter?', a: 'Because it directly affects the outcome and trade-offs of the approach.' },
      { q: 'One concrete example?', a: 'See the worked example covered in the conversation above.' },
    ])
  }
  if (/faq/i.test(system)) {
    return [
      '**Q: What was the main question?**',
      `A: ${oneLine(user)}`,
      '',
      '**Q: What is the short answer?**',
      `A: ${deriveAnswer(user)}`,
      '',
      '**Q: Where can I learn more?**',
      'A: Review the linked topics in the right rail of this chat.',
    ].join('\n')
  }
  if (/key.?points/i.test(system)) {
    return ['- ' + deriveAnswer(user), '- Trade-offs were weighed before deciding.', '- Next step is to validate with a quick prototype.'].join('\n')
  }
  if (/action items/i.test(system)) {
    return ['- [ ] Draft the first version', '- [ ] Get feedback from one teammate', '- [ ] Ship a minimal demo'].join('\n')
  }
  if (/exam notes/i.test(system)) {
    return ['## Exam Notes', '', '**Definition.** ' + oneLine(user), '', '**Must remember:** the three steps and why each matters.', '', '**Likely question:** explain the trade-off in your own words.'].join('\n')
  }
  if (/summar/i.test(system)) {
    return 'In short: ' + deriveAnswer(user) + ' The discussion covered the motivation, the main approach, and the immediate next step.'
  }

  // Default conversational reply.
  return [
    `Great question. Here's how I'd think about **${guessTopic(user).toLowerCase()}**:`,
    '',
    `1. **Start simple.** ${deriveAnswer(user)}`,
    '2. **Then iterate.** Add the next-most-valuable piece only once the basics feel right.',
    '3. **Keep it observable.** Make progress visible so you can demo it at any moment.',
    '',
    'Here is a tiny snippet to make it concrete:',
    '',
    '```js',
    'function next(step) {',
    '  // pick the smallest change that moves the demo forward',
    '  return step + 1',
    '}',
    '```',
    '',
    '_Note: this is a local mock reply. Add an API key in Settings (gear icon) to use a real model._',
  ].join('\n')
}

// ── tiny helpers ────────────────────────────────────────────────────────────
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'how', 'do', 'i', 'can', 'what', 'is', 'are', 'in', 'on', 'for', 'my', 'me', 'you', 'about', 'with', 'should', 'best', 'good', 'give', 'tips', 'tell', 'want', 'need', 'help', 'make', 'explain', 'some', 'any', 'great', 'please', 'show', 'get', 'into', 'this', 'that', 'would', 'could', 'like', 'more'])

function guessTopic(text) {
  const words = (text.toLowerCase().match(/[a-z][a-z+#.]{2,}/g) || []).filter((w) => !STOP.has(w))
  if (!words.length) return 'General Discussion'
  // Prefer the most distinctive words (longer, earlier) but keep original order.
  const ranked = [...words].map((w, i) => ({ w, i, score: w.length - i * 0.5 }))
    .sort((a, b) => b.score - a.score).slice(0, 2)
    .sort((a, b) => a.i - b.i).map((x) => x.w)
  return ranked.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}
const oneLine = (t) => (t.length > 80 ? t.slice(0, 77).trim() + '…' : t || 'Open discussion')
const deriveAnswer = (t) => `Focus first on the essence of "${oneLine(t)}" before adding complexity.`
const similar = (a = '', b = '') => a.toLowerCase().split(' ')[0] === b.toLowerCase().split(' ')[0]
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
  })
