import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ── Built-in Free AI proxy ──────────────────────────────────────────────────
// Serves a same-origin POST /ai endpoint straight from the Vite dev/preview
// server, so `npm run dev` alone gives working AI answers — no separate server,
// no CORS, no MCP dependency. Runs server-side (Node), so the upstream's
// browser anti-bot token isn't required. Retries the flaky upstream.
const AD = /(\n*-{2,}\n*\*\*Support Pollinations[\s\S]*$)|(\n*🌸[\s\S]*$)|(\n*Powered by Pollinations[\s\S]*$)/i
const DEFAULT_SYS =
  "You are Luna, an expert AI assistant. Directly and fully answer exactly what the user asks. Use clear markdown (headings, bullets, tables, code blocks). Never reply with generic meta-advice or tell the user to rephrase; never fabricate facts — say so if unsure."

// Live web search (server-side DuckDuckGo HTML — no key, avoids browser CORS).
async function searchHandler(req, res, next) {
  const u = new URL(req.url || '/', 'http://x')
  if (u.pathname !== '/search') return next()
  res.setHeader('content-type', 'application/json')
  const q = u.searchParams.get('q') || ''
  if (!q) { res.end(JSON.stringify({ results: [] })); return }
  try {
    const r = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'content-type': 'application/x-www-form-urlencoded' },
      body: 'q=' + encodeURIComponent(q),
    })
    const html = await r.text()
    const results = []
    const re = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    let m
    while ((m = re.exec(html)) && results.length < 5) {
      let url = m[1]
      const ud = url.match(/uddg=([^&]+)/)
      if (ud) url = decodeURIComponent(ud[1])
      const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim()
      results.push({ title: strip(m[2]), snippet: strip(m[3]), url })
    }
    res.end(JSON.stringify({ results }))
  } catch (e) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: String(e), results: [] }))
  }
}

function aiProxyPlugin() {
  const handler = async (req, res, next) => {
    const path = (req.url || '').split('?')[0]
    if (path === '/search') return searchHandler(req, res, next)
    if (path !== '/ai' || req.method !== 'POST') return next()
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      res.setHeader('content-type', 'application/json')
      try {
        const { system, messages = [], endpoint, apiKey, model } = JSON.parse(body || '{}')
        const msgs = [
          { role: 'system', content: system || DEFAULT_SYS },
          ...messages.filter((m) => m && m.content && (m.role === 'user' || m.role === 'assistant')),
        ]

        // Custom OpenAI-compatible provider (any key/endpoint) — forwarded
        // server-side so browser CORS never blocks it.
        if (endpoint && apiKey) {
          const baseUrl = String(endpoint).replace(/\/+$/, '')
          const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`
          const cr = await fetch(url, {
            method: 'POST',
            // Send both auth styles: Bearer (OpenAI/OpenRouter/Groq/…) and
            // api-subscription-key (Sarvam). Providers ignore the one they don't use.
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, 'api-subscription-key': apiKey },
            body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: msgs, temperature: 0.7 }),
          }).catch((e) => ({ ok: false, status: 'network', text: async () => String(e) }))
          if (!cr.ok) {
            const raw = await cr.text?.().catch(() => '') || ''
            let detail = raw
            try { const j = JSON.parse(raw); detail = j?.error?.message || j?.message || raw } catch { /* keep raw */ }
            res.statusCode = 502
            res.end(JSON.stringify({ error: `Custom API ${cr.status}: ${String(detail).slice(0, 180)}` }))
            return
          }
          const cd = await cr.json()
          const content = String(cd?.choices?.[0]?.message?.content ?? cd?.content ?? '').trim()
          if (!content) { res.statusCode = 502; res.end(JSON.stringify({ error: 'Custom API returned no text' })); return }
          res.end(JSON.stringify({ content }))
          return
        }

        // Try several free models so a busy/down one doesn't fail the request.
        const freeModels = ['openai', 'openai-fast', 'mistral', 'llama']
        let content = ''
        let last = ''
        outer:
        for (const fm of freeModels) {
          for (let i = 0; i < 2; i++) {
            const r = await fetch('https://text.pollinations.ai/openai', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ model: fm, messages: msgs, private: true, referrer: 'luna-app' }),
            }).catch(() => null)
            if (r && r.ok) {
              const d = await r.json().catch(() => null)
              content = String(d?.choices?.[0]?.message?.content || '').replace(AD, '').trim()
              if (content) break outer
            }
            last = r ? r.status : 'network'
            await new Promise((s) => setTimeout(s, 500 * (i + 1)))
          }
        }
        if (!content) { res.statusCode = 502; res.end(JSON.stringify({ error: `upstream ${last}` })); return }
        res.end(JSON.stringify({ content }))
      } catch (e) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: String(e) }))
      }
    })
  }
  return {
    name: 'luna-ai-proxy',
    configureServer(server) { server.middlewares.use(handler) },
    configurePreviewServer(server) { server.middlewares.use(handler) },
  }
}

export default defineConfig({
  plugins: [react(), aiProxyPlugin()],
  // Pre-bundle these at server start so the first page load doesn't hit a
  // mid-optimization reload (the brief blank/404 some setups see on cold start).
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-markdown', 'remark-gfm', 'rehype-highlight'],
  },
})
