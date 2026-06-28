import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../state/store.jsx'
import { Search } from '../ui/Icons.jsx'

export default function SearchView() {
  const { state, actions } = useStore()
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  // allow /search <query> to deep-link here
  useEffect(() => {
    const h = (e) => { setQ(e.detail || ''); inputRef.current?.focus() }
    window.addEventListener('synapse:search', h)
    return () => window.removeEventListener('synapse:search', h)
  }, [])

  const results = useMemo(() => searchAll(state.chats, q), [state.chats, q])
  const total = results.reduce((n, r) => n + r.hits.length, 0)

  const open = (chatId, messageId) => {
    if (messageId) actions.jumpTo(chatId, messageId)
    else { actions.selectChat(chatId); actions.setView('chat') }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-semibold flex items-center gap-2 mb-1">🔎 Smart Search</h1>
        <p className="text-ink2 mb-5">Search across every chat. e.g. “Show all discussions about React.”</p>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-sea/40">
          <Search size={18} className="text-ink2" />
          <input ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages, titles, topics…"
            className="flex-1 bg-transparent outline-none text-[15px]" />
          {q && <button onClick={() => setQ('')} className="text-xs text-ink2 hover:text-accentink">Clear</button>}
        </div>

        {q && <p className="text-xs text-ink2 mt-2">{total} match{total !== 1 ? 'es' : ''} in {results.length} chat{results.length !== 1 ? 's' : ''}</p>}

        <div className="mt-5 space-y-5">
          {q && results.length === 0 && <p className="text-ink2 text-center py-10">No matches found.</p>}
          {results.map((r) => (
            <div key={r.chat.id}>
              <button onClick={() => open(r.chat.id)} className="font-semibold text-sm hover:text-accentink dark:hover:text-sea mb-1.5">
                {r.chat.title}
                <span className="ml-2 text-xs font-normal text-ink2">{r.hits.length} hit{r.hits.length > 1 ? 's' : ''}</span>
              </button>
              <div className="space-y-1.5">
                {r.hits.map((h, i) => (
                  <button key={i} onClick={() => open(r.chat.id, h.messageId)}
                    className="block w-full text-left rounded-lg ring-1 ring-line hover:ring-sea/45 bg-surface px-3 py-2 transition">
                    <span className="text-[11px] uppercase tracking-wide text-ink2">{h.kind}</span>
                    <p className="text-sm mt-0.5" dangerouslySetInnerHTML={{ __html: h.snippet }} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {!q && (
          <div className="mt-6 flex flex-wrap gap-2">
            {['React', 'AWS', 'resume', 'hackathon'].map((s) => (
              <button key={s} onClick={() => setQ(s)} className="text-sm rounded-full px-3 py-1.5 ring-1 ring-line hover:bg-tint">{s}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Keyword / substring search across titles, topics, and message bodies.
function searchAll(chats, query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/).filter(Boolean)
  const match = (text) => terms.every((t) => text.toLowerCase().includes(t)) || text.toLowerCase().includes(q)

  const out = []
  for (const chat of chats) {
    const hits = []
    if (match(chat.title)) hits.push({ kind: 'Chat title', snippet: highlight(chat.title, terms) })
    for (const t of chat.topics) {
      if (match(t.title) || (t.summary && match(t.summary)))
        hits.push({ kind: 'Topic', snippet: highlight(t.title + (t.summary ? ' — ' + t.summary : ''), terms), messageId: firstMsgOfTopic(chat, t) })
    }
    for (const m of chat.messages) {
      if (match(m.content))
        hits.push({ kind: m.role === 'user' ? 'You' : 'Synapse', snippet: snippetAround(m.content, terms), messageId: m.id })
    }
    if (hits.length) out.push({ chat, hits: hits.slice(0, 6) })
  }
  return out
}

function firstMsgOfTopic(chat, topic) {
  const order = new Map(chat.messages.map((m, i) => [m.id, i]))
  return topic.messageIds.map((id) => ({ id, i: order.get(id) ?? Infinity })).sort((a, b) => a.i - b.i)[0]?.id
}

function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) }
function highlight(text, terms) {
  let safe = escapeHtml(text)
  for (const t of terms) {
    if (!t) continue
    safe = safe.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark class="bg-signature/60 rounded px-0.5">$1</mark>')
  }
  return safe
}
function snippetAround(text, terms) {
  const lower = text.toLowerCase()
  let idx = -1
  for (const t of terms) { const i = lower.indexOf(t); if (i >= 0 && (idx < 0 || i < idx)) idx = i }
  if (idx < 0) idx = 0
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + 100)
  return (start > 0 ? '…' : '') + highlight(text.slice(start, end), terms) + (end < text.length ? '…' : '')
}
