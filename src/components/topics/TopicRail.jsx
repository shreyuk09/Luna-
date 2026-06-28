import { useState } from 'react'
import { useStore } from '../../state/store.jsx'
import { colorByName } from '../../lib/colors.js'
import { Dots, Edit, Trash, Check, X, Shuffle, Refresh } from '../ui/Icons.jsx'

export default function TopicRail({ onNavigate }) {
  const { state, actions } = useStore()
  const chat = state.chats.find((c) => c.id === state.activeChatId)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [pos, setPos] = useState(null) // 'before' | 'after' | 'merge'

  if (!chat) return <div className="p-4 text-sm text-ink2">No active chat.</div>

  // base order: first message position in the transcript
  const order = new Map(chat.messages.map((m, i) => [m.id, i]))
  const byTranscript = (a, b) => {
    const fa = Math.min(...a.messageIds.map((id) => order.get(id) ?? Infinity))
    const fb = Math.min(...b.messageIds.map((id) => order.get(id) ?? Infinity))
    return fa - fb
  }
  // apply the user's custom order when present; new topics fall in by transcript
  const custom = chat.topicOrder || []
  const hasCustom = custom.length > 0
  const topics = [...chat.topics].sort((a, b) => {
    const ia = custom.indexOf(a.id)
    const ib = custom.indexOf(b.id)
    if (ia === -1 && ib === -1) return byTranscript(a, b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
  const ids = topics.map((t) => t.id)

  const jumpTo = (topic) => {
    const firstId = topic.messageIds
      .map((id) => ({ id, i: order.get(id) ?? Infinity }))
      .sort((a, b) => a.i - b.i)[0]?.id
    if (firstId) { actions.jumpTo(chat.id, firstId); onNavigate?.() }
  }

  const clearDrag = () => { setDragId(null); setOverId(null); setPos(null) }

  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) { clearDrag(); return }
    // pure reorder — dragging a topic moves it up/down to where you drop it
    const next = ids.filter((id) => id !== dragId)
    const at = next.indexOf(targetId) + (pos === 'after' ? 1 : 0)
    next.splice(at, 0, dragId)
    actions.reorderTopics(chat.id, next)
    clearDrag()
  }

  return (
    <div className="h-full flex flex-col glass">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-line/60 dark:border-white/5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <span className="gradient-text">Topic Index</span>
            <span className="text-[10px] font-semibold text-accentink bg-tint rounded-full px-1.5 py-0.5">{topics.length}</span>
          </h3>
          <p className="text-[11px] text-ink2 mt-0.5">{hasCustom ? 'Custom order' : 'Auto-segmented as you chat ✨'}</p>
        </div>
        {topics.length > 1 && (
          <div className="flex items-center gap-0.5 shrink-0">
            {hasCustom && (
              <button onClick={() => actions.resetTopicOrder(chat.id)} title="Reset to conversation order"
                className="p-1.5 rounded-md text-ink2 hover:text-accentink hover:bg-tint transition"><Refresh size={15} /></button>
            )}
            <button onClick={() => actions.shuffleTopics(chat.id, ids)} title="Shuffle order"
              className="p-1.5 rounded-md text-ink2 hover:text-accentink hover:bg-tint transition"><Shuffle size={15} /></button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-4 space-y-1.5">
        {topics.length === 0 && (
          <div className="text-center text-sm text-ink2 px-4 py-10">
            <div className="text-2xl mb-2">🗂️</div>
            Topics appear here automatically after your first exchange.
          </div>
        )}

        {topics.map((t, i) => (
          <TopicCard
            key={t.id} topic={t} index={i + 1} chat={chat} count={t.messageIds.length}
            color={colorByName(t.color)}
            isOver={overId === t.id}
            pos={overId === t.id ? pos : null}
            onJump={() => jumpTo(t)}
            onRename={(title) => actions.renameTopic(chat.id, t.id, title)}
            onDelete={() => maybeDelete(t, chat, actions)}
            onDragStart={() => setDragId(t.id)}
            onDragOver={(e) => {
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const next = (e.clientY - r.top) < r.height / 2 ? 'before' : 'after'
              setOverId(t.id); setPos(next)
            }}
            onDragLeave={() => setOverId((o) => (o === t.id ? null : o))}
            onDrop={() => onDrop(t.id)}
            onDragEnd={clearDrag}
            dragging={dragId === t.id}
          />
        ))}
      </div>

      <div className="border-t border-line px-4 py-2.5 text-[11px] text-ink2 flex items-center gap-1.5">
        <span>💡 Drag a topic to move it up or down · double-click to rename</span>
      </div>
    </div>
  )
}

function maybeDelete(topic, chat, actions) {
  if (topic.messageIds.length > 2) {
    if (!window.confirm(`Delete "${topic.title}"? Its ${topic.messageIds.length} messages will move to Unsorted.`)) return
  }
  actions.deleteTopic(chat.id, topic.id)
}

function TopicCard({ topic, index, count, color, onJump, onRename, onDelete, isOver, pos, dragging, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(topic.title)

  const commit = () => { onRename(draft); setEditing(false) }

  return (
    <div
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative rounded-xl ring-1 transition-all cursor-grab active:cursor-grabbing overflow-visible hover:-translate-y-0.5 hover:shadow-md
        ${isOver ? 'ring-sea/50' : 'ring-line hover:ring-sea/40'}
        ${dragging ? 'opacity-40 scale-95' : ''}`}
      style={{ background: color.soft, borderLeft: `3px solid ${color.dot}` }}
      onMouseLeave={() => setMenu(false)}>

      {/* reorder insertion indicators */}
      {isOver && pos === 'before' && <span className="absolute -top-1 left-1 right-1 h-0.5 rounded-full bg-sea" />}
      {isOver && pos === 'after' && <span className="absolute -bottom-1 left-1 right-1 h-0.5 rounded-full bg-sea" />}

      <div className="flex items-start gap-2 p-2.5" onClick={() => !editing && onJump()}>
        <span className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color.dot }} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
                className="flex-1 bg-surface rounded px-1.5 py-0.5 text-sm outline-none ring-1 ring-sea/45" />
              <button onClick={commit} className="text-emerald-600 p-0.5"><Check size={14} /></button>
              <button onClick={() => setEditing(false)} className="text-ink2 p-0.5"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5"
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(topic.title) }}>
              <span className="text-sm font-medium truncate">{topic.title}</span>
              {topic.locked && <span title="Locked — the segmenter won't touch this" className="text-[10px]">🔒</span>}
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button onClick={(e) => { e.stopPropagation(); onDelete() }} title="Delete topic"
              className="text-ink2 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md p-1 transition">
              <Trash size={15} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setMenu((m) => !m) }} title="More"
              className="text-ink2 hover:text-accentink hover:bg-tint rounded-md p-1 transition">
              <Dots size={16} />
            </button>
          </div>
        )}

      </div>

      {menu && (
        <div className="absolute right-2 top-9 z-30 w-36 rounded-lg bg-surface shadow-lg ring-1 ring-line py-1 text-sm animate-fade-in"
          onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setEditing(true); setDraft(topic.title); setMenu(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-tint"><Edit size={14} /> Rename</button>
        </div>
      )}
    </div>
  )
}
