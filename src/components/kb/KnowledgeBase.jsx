import { useMemo, useState } from 'react'
import { useStore } from '../../state/store.jsx'
import { NOTE_TYPES } from '../../lib/notePrompts.js'
import { timeAgo } from '../../lib/storage.js'
import Markdown from '../chat/Markdown.jsx'
import FlashcardDeck from '../notes/FlashcardDeck.jsx'
import { Search, Trash, X, Book } from '../ui/Icons.jsx'

export default function KnowledgeBase() {
  const { state, actions } = useStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  const notes = useMemo(() => {
    const query = q.trim().toLowerCase()
    return state.notes.filter((n) => {
      if (!query) return true
      const text = n.type === 'flashcards'
        ? (Array.isArray(n.content) ? n.content.map((c) => c.q + ' ' + c.a).join(' ') : '')
        : String(n.content)
      return (n.sourceLabel + ' ' + text + ' ' + NOTE_TYPES[n.type]?.label).toLowerCase().includes(query)
    })
  }, [state.notes, q])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-semibold flex items-center gap-2 mb-1">📚 Knowledge Base</h1>
        <p className="text-ink2 mb-5">Saved notes, flashcards & FAQs from your chats.</p>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 mb-5 focus-within:ring-2 focus-within:ring-sea/40">
          <Search size={18} className="text-ink2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your knowledge base…" className="flex-1 bg-transparent outline-none text-[15px]" />
        </div>

        {state.notes.length === 0 && (
          <div className="text-center py-16 text-ink2">
            <div className="text-4xl mb-3">🗃️</div>
            <p className="font-medium text-ink2">Nothing saved yet.</p>
            <p className="text-sm mt-1">Open a chat, click <span className="font-medium">Notes</span>, generate something, and hit “Save to KB”.</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {notes.map((n) => (
            <div key={n.id} className="group rounded-xl ring-1 ring-line bg-surface p-4 hover:ring-sea/45 transition cursor-pointer"
              onClick={() => setOpen(n)}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{NOTE_TYPES[n.type]?.icon}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-tint text-accentink">{NOTE_TYPES[n.type]?.label}</span>
                <button onClick={(e) => { e.stopPropagation(); actions.deleteNote(n.id) }}
                  className="ml-auto opacity-0 group-hover:opacity-100 text-ink2 hover:text-rose-500"><Trash size={15} /></button>
              </div>
              <div className="font-medium text-sm truncate">{n.sourceLabel}</div>
              <p className="text-xs text-ink2 mt-1 line-clamp-2">{preview(n)}</p>
              <div className="text-[11px] text-ink2 mt-2">{timeAgo(n.createdAt)}</div>
            </div>
          ))}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(10,31,28,0.45)] backdrop-blur-sm animate-fade-in" onClick={() => setOpen(null)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-surface shadow-xl ring-1 ring-line p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{NOTE_TYPES[open.type]?.icon}</span>
              <div className="min-w-0">
                <div className="font-semibold truncate">{open.sourceLabel}</div>
                <div className="text-xs text-ink2">{NOTE_TYPES[open.type]?.label}{open.type === 'flashcards' ? ' · study mode' : ''}</div>
              </div>
              <button onClick={() => setOpen(null)} className="ml-auto text-ink2 hover:text-accentink"><X /></button>
            </div>
            {open.type === 'flashcards'
              ? <FlashcardDeck cards={Array.isArray(open.content) ? open.content : []} />
              : <Markdown>{String(open.content)}</Markdown>}
          </div>
        </div>
      )}
    </div>
  )
}

function preview(n) {
  if (n.type === 'flashcards') return Array.isArray(n.content) ? `${n.content.length} cards · ${n.content[0]?.q || ''}` : ''
  return String(n.content).replace(/[#*`>\-\[\]]/g, '').slice(0, 120)
}
