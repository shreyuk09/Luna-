// ───────────────────────────────────────────────────────────────────────────
// Minimal MCP client (Streamable HTTP transport) for the browser.
//
// Speaks MCP JSON-RPC directly: initialize -> notifications/initialized ->
// tools/list -> tools/call. Kept dependency-free so it bundles cleanly in Vite.
// A singleton instance holds connection state and the discovered tool list.
// ───────────────────────────────────────────────────────────────────────────
import { load, save } from './storage.js'

const DEFAULT_URL = 'http://localhost:8787/mcp'

export function getMcpConfig() {
  return load('mcp', { url: DEFAULT_URL, enabled: true })
}
export function setMcpConfig(cfg) {
  save('mcp', cfg)
}

class McpClient {
  constructor() {
    this.url = null
    this.protocolVersion = '2025-03-26'
    this.connected = false
    this.tools = []
    this.serverInfo = null
    this._id = 0
  }

  async _rpc(method, params, { notify = false } = {}) {
    const body = { jsonrpc: '2.0', method, params }
    if (!notify) body.id = ++this._id
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': this.protocolVersion,
      },
      body: JSON.stringify(body),
    })
    if (notify) return null
    if (!res.ok) throw new Error(`MCP ${method} failed (${res.status})`)
    const ct = res.headers.get('content-type') || ''
    const text = await res.text()
    let msg
    if (ct.includes('text/event-stream')) {
      const line = text.split('\n').find((l) => l.startsWith('data:'))
      msg = line ? JSON.parse(line.slice(5).trim()) : null
    } else {
      msg = text ? JSON.parse(text) : null
    }
    if (msg?.error) throw new Error(msg.error.message || 'MCP error')
    return msg?.result
  }

  async connect(url) {
    this.url = url || getMcpConfig().url
    this.connected = false
    const init = await this._rpc('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: { name: 'synapse-web', version: '1.0.0' },
    })
    this.protocolVersion = init?.protocolVersion || this.protocolVersion
    this.serverInfo = init?.serverInfo || null
    await this._rpc('notifications/initialized', {}, { notify: true }).catch(() => {})
    const list = await this._rpc('tools/list', {})
    this.tools = list?.tools || []
    this.connected = true
    return this.tools
  }

  async callTool(name, args) {
    const result = await this._rpc('tools/call', { name, arguments: args || {} })
    const text = (result?.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
    return { text, isError: !!result?.isError, raw: result }
  }

  disconnect() {
    this.connected = false
    this.tools = []
    this.serverInfo = null
  }

  // Tool list in Anthropic tool-use format.
  anthropicTools() {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description || t.title || t.name,
      input_schema: t.inputSchema || { type: 'object', properties: {} },
    }))
  }
}

export const mcp = new McpClient()
