import { useState } from 'react'
import { useStore } from '../state/store.jsx'
import { timeAgo } from '../lib/storage.js'
import { Plus, Dots, Trash, Edit, X } from './ui/Icons.jsx'

export default function LeftRail({ onNavigate }) {
  const { state, actions } = useStore()
  const [menuFor, setMenuFor] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')

  const chats = [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt)

  const startRename = (c) => { setEditing(c.id); setDraft(c.title); setMenuFor(null) }
  const commit = (c) => { if (draft.trim()) actions.renameChat(c.id, draft.trim()); setEditing(null) }

  return (
    <div className="h-full flex flex-col glass">
      <div className="p-3">
        <button onClick={() => { actions.newChat(); onNavigate?.() }}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-deep text-white py-2.5 text-sm font-semibold shadow-lagoon hover:shadow-lagoon-lg hover:-translate-y-0.5 active:translate-y-0 transition-all">
          <Plus size={18} /> New chat
        </button>
      </div>

      <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-ink2">Chats</div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {chats.map((c) => {
          const active = c.id === state.activeChatId
          return (
            <div key={c.id}
              onClick={() => { actions.selectChat(c.id); onNavigate?.() }}
              className={`group relative rounded-xl px-2.5 py-2 cursor-pointer transition
                ${active ? 'bg-gradient-to-r from-sea/10 to-signature/25 ring-1 ring-sea/40 shadow-sm' : 'hover:bg-tint'}`}>
              {editing === c.id ? (
                <input autoFocus value={draft} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(c)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commit(c); if (e.key === 'Escape') setEditing(null) }}
                  className="w-full bg-transparent text-sm font-medium outline-none border-b border-sea" />
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-medium ${active ? 'text-accentink' : ''}`}>{c.title}</div>
                    <div className="text-xs text-ink2 mt-0.5 flex items-center gap-1.5">
                      <span>{timeAgo(c.updatedAt)}</span>
                      {c.topics.length > 0 && <span className="text-ink2/60">·</span>}
                      {c.topics.length > 0 && <span>{c.topics.length} topic{c.topics.length > 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id) }}
                    className="opacity-0 group-hover:opacity-100 text-ink2 hover:text-accentink p-0.5 rounded">
                    <Dots size={16} />
                  </button>
                </div>
              )}

              {menuFor === c.id && (
                <div className="absolute right-2 top-9 z-20 w-36 rounded-lg bg-surface shadow-lg ring-1 ring-line py-1 text-sm animate-fade-in"
                  onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => startRename(c)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-tint"><Edit size={14} /> Rename</button>
                  <button onClick={() => { actions.deleteChat(c.id); setMenuFor(null) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-600 hover:bg-rose-50"><Trash size={14} /> Delete</button>
                </div>
              )}
            </div>
          )
        })}
        {chats.length === 0 && <p className="text-sm text-ink2 px-3 py-6 text-center">No chats yet.</p>}
      </div>
    </div>
  )
}
