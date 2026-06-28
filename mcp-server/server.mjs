// ───────────────────────────────────────────────────────────────────────────
// Synapse MCP server
//
// A real Model Context Protocol server (official SDK) exposing three tools over
// the Streamable HTTP transport. Stateless + JSON responses so a browser client
// can talk to it directly. Run with:  npm start   (listens on :8787/mcp)
// ───────────────────────────────────────────────────────────────────────────
import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

const PORT = process.env.MCP_PORT || 8787

// ── tool implementations ────────────────────────────────────────────────────
function calculate(expression) {
  const expr = String(expression).trim()
  // Only allow arithmetic — never eval arbitrary code.
  if (!/^[\d+\-*/%.()^\s]+$/.test(expr)) {
    throw new Error('Only basic arithmetic is supported (digits and + - * / % ^ . ( ) ).')
  }
  const js = expr.replace(/\^/g, '**') // support ^ as exponent
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${js});`)()
  if (typeof value !== 'number' || !isFinite(value)) throw new Error('Could not evaluate that expression.')
  return value
}

function nowInfo(timezone) {
  const d = new Date()
  const opts = { dateStyle: 'full', timeStyle: 'long' }
  if (timezone) opts.timeZone = timezone
  let formatted
  try {
    formatted = new Intl.DateTimeFormat('en-US', opts).format(d)
  } catch {
    formatted = d.toString()
  }
  return { iso: d.toISOString(), formatted, timezone: timezone || 'server local' }
}

async function wikipediaAnswer(query) {
  const UA = { 'User-Agent': 'Synapse-MCP/1.0 (demo)' }
  const sUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(query)}`
  const sRes = await fetch(sUrl, { headers: UA })
  if (!sRes.ok) throw new Error(`Lookup failed (${sRes.status})`)
  const sData = await sRes.json()
  const title = sData?.query?.search?.[0]?.title
  if (!title) return null
  // Rich intro extract — contains dates, heights and other specific facts.
  const eUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&exintro&explaintext&redirects=1&format=json&titles=${encodeURIComponent(title)}`
  const eRes = await fetch(eUrl, { headers: UA })
  let extract = ''
  let url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  if (eRes.ok) {
    const page = Object.values((await eRes.json())?.query?.pages || {})[0]
    extract = (page?.extract || '').replace(/\s{2,}/g, ' ').trim()
    url = page?.fullurl || url
  }
  if (!extract) return null
  // first 3 sentences keeps the answer concise
  const sentences = (extract.match(/[^.!?]+[.!?]+/g) || [extract]).slice(0, 3).join(' ').trim()
  return { title, extract: sentences, url }
}

async function webSearch(query, limit = 3) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Synapse-MCP/1.0' } })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  const hits = (data?.query?.search || []).map((s) => ({
    title: s.title,
    snippet: s.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').trim(),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/\s/g, '_'))}`,
  }))
  return hits
}

// ── MCP server definition ───────────────────────────────────────────────────
function buildServer() {
  const server = new McpServer({ name: 'synapse-tools', version: '1.0.0' })

  server.registerTool(
    'calculator',
    {
      title: 'Calculator',
      description: 'Evaluate a basic arithmetic expression, e.g. "(12.5 * 4) + 7 / 2". Returns the numeric result.',
      inputSchema: { expression: z.string().describe('Arithmetic expression using + - * / % . ( )') },
    },
    async ({ expression }) => {
      const value = calculate(expression)
      return { content: [{ type: 'text', text: `${expression} = ${value}` }] }
    },
  )

  server.registerTool(
    'current_datetime',
    {
      title: 'Current date & time',
      description: 'Get the current date and time. Optionally pass an IANA timezone like "Asia/Kolkata" or "America/New_York".',
      inputSchema: { timezone: z.string().optional().describe('IANA timezone name (optional)') },
    },
    async ({ timezone }) => {
      const info = nowInfo(timezone)
      return { content: [{ type: 'text', text: `${info.formatted} (${info.timezone})\nISO: ${info.iso}` }] }
    },
  )

  server.registerTool(
    'wikipedia_answer',
    {
      title: 'Wikipedia answer',
      description: 'Get a concise, factual answer to a question from Wikipedia, with a citation. Best for "what is / who is / when / where / how many" style questions.',
      inputSchema: { query: z.string().describe('The factual question or topic to look up') },
    },
    async ({ query }) => {
      const ans = await wikipediaAnswer(query)
      if (!ans) return { content: [{ type: 'text', text: `No reliable source found for "${query}".` }] }
      return { content: [{ type: 'text', text: `${ans.extract}\n\nSource: ${ans.title} — ${ans.url}` }] }
    },
  )

  server.registerTool(
    'web_search',
    {
      title: 'Web search',
      description: 'Search the web (Wikipedia) for up-to-date factual information. Returns the top results with titles, snippets and links.',
      inputSchema: {
        query: z.string().describe('What to search for'),
        limit: z.number().int().min(1).max(5).optional().describe('Number of results (default 3)'),
      },
    },
    async ({ query, limit }) => {
      const hits = await webSearch(query, limit || 3)
      if (!hits.length) return { content: [{ type: 'text', text: `No results for "${query}".` }] }
      const text = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   ${h.url}`).join('\n\n')
      return { content: [{ type: 'text', text }] }
    },
  )

  return server
}

// ── HTTP transport (stateless) ──────────────────────────────────────────────
const app = express()
app.use(express.json())

// CORS so the browser SPA can connect directly.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, mcp-protocol-version')
  res.header('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version')
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true, name: 'synapse-tools' }))

// ── Free AI proxy ───────────────────────────────────────────────────────────
// Browsers can't call the free LLM directly (it now requires an anti-bot token),
// but a server can. This proxies chat completions so the app gets keyless,
// no-cost answers to open-ended questions. Swap the upstream here to use a
// different provider.
app.post('/ai', async (req, res) => {
  try {
    const { messages = [], system } = req.body || {}
    const msgs = [
      { role: 'system', content: system || 'You are an expert AI assistant. Directly and fully answer exactly what the user asks — treat "explain X", "give detailed information on X", "X in DBMS", or a bare topic name as a request to teach that subject. NEVER reply with generic meta-advice ("here\'s how I\'d approach this", "clarify the goal") and NEVER tell the user to rephrase. For technical topics: definition, core concepts (define terms), a concrete example, key components/types (table or list), code/syntax where relevant, then advantages/limitations and a short summary. Use markdown headings, bullets, tables, and fenced code blocks. Match the requested depth. Never fabricate facts — say so if unsure. No filler or "as an AI" disclaimers.' },
      ...messages.filter((m) => m && m.content && (m.role === 'user' || m.role === 'assistant')),
    ]
    // The free upstream is occasionally flaky (502/429) — retry a few times.
    let r, lastStatus
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'openai', messages: msgs, private: true, referrer: 'lagoon-app' }),
      }).catch(() => null)
      if (r && r.ok) break
      lastStatus = r ? r.status : 'network'
      await new Promise((s) => setTimeout(s, 600 * (attempt + 1)))
      r = null
    }
    if (!r) return res.status(502).json({ error: `upstream ${lastStatus}` })
    const d = await r.json()
    let content = d?.choices?.[0]?.message?.content || ''
    content = content
      .replace(/\n*-{2,}\n*\*\*Support Pollinations[\s\S]*$/i, '')
      .replace(/\n*🌸[\s\S]*$/i, '')
      .replace(/\n*Powered by Pollinations[\s\S]*$/i, '')
      .trim()
    res.json({ content })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

app.post('/mcp', async (req, res) => {
  // New server+transport per request — the recommended stateless pattern.
  const server = buildServer()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  res.on('close', () => { transport.close(); server.close() })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: String(e) }, id: null })
  }
})

app.listen(PORT, () => {
  console.log(`🛠️  Synapse MCP server on http://localhost:${PORT}/mcp  (tools: calculator, current_datetime, web_search)`)
})
