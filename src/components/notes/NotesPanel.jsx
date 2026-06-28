import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../state/store.jsx'
import { NOTE_TYPES } from '../../lib/notePrompts.js'
import Markdown from '../chat/Markdown.jsx'
import FlashcardDeck from './FlashcardDeck.jsx'
import { X, Copy, Check, Save } from '../ui/Icons.jsx'

export default function NotesPanel() {
  const { state, actions } = useStore()
  const panel = state.notesPanel
  const [type, setType] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { type, content }
  const [copied, setCopied] = useState(false)

  // resolve the transcript for this source
  const { messages, label } = useMemo(() => resolveSource(state, panel), [state, panel])

  useEffect(() => {
    if (!panel) { setType(null); setResult(null); return }
    if (panel.initialType) run(panel.initialType)
    else { setType(null); setResult(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel])

  if (!panel) return null

  async function run(t) {
    setType(t); setLoading(true); setResult(null)
    try {
      const r = await actions.generateNote(panel.sourceId, label, messages, t)
      setResult(r)
    } catch (e) {
      setResult({ type: t, content: `⚠ ${e.message}` })
    }
    setLoading(false)
  }

  const copy = () => {
    const text = result?.type === 'flashcards'
      ? result.content.map((c) => `Q: ${c.q}\nA: ${c.a}`).join('\n\n')
      : String(result?.content || '')
    navigator.clipboard?.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const saveToKb = () => {
    actions.saveNote({ sourceId: panel.sourceId, sourceLabel: label, scope: panel.scope, type: result.type, content: result.content })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in" onClick={actions.closeNotes}>
      <div className="absolute inset-0 bg-[rgba(10,31,28,0.45)] backdrop-blur-sm" />
      <div className="relative h-full w-full max-w-md bg-surface shadow-xl flex flex-col animate-[slide-up_.2s_ease] sm:animate-none"
        style={{ transform: 'translateX(0)' }} onClick={(e) => e.stopPropagation()}>
        <div className="h-14 px-4 flex items-center justify-between border-b border-line">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">AI Notes</div>
            <div className="text-xs text-ink2 truncate">{panel.scope === 'topic' ? 'Topic' : 'Chat'}: {label}</div>
          </div>
          <button onClick={actions.closeNotes} className="text-ink2 hover:text-accentink p-1"><X /></button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-2 border-b border-line">
          {Object.entries(NOTE_TYPES).map(([k, v]) => (
            <button key={k} onClick={() => run(k)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 transition
                ${type === k ? 'bg-deep text-white ring-deep' : 'ring-line hover:bg-tint'}`}>
              <span>{v.icon}</span> {v.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!type && <p className="text-ink2 text-sm text-center py-10">Pick a format above to generate notes from this {panel.scope}.</p>}
          {loading && (
            <div className="flex items-center gap-2 text-ink2 text-sm py-10 justify-center">
              <span className="w-2 h-2 rounded-full bg-deep animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-deep animate-bounce" style={{ animationDelay: '.15s' }} />
              <span className="w-2 h-2 rounded-full bg-deep animate-bounce" style={{ animationDelay: '.3s' }} />
              <span className="ml-1">Generating {NOTE_TYPES[type]?.label}…</span>
            </div>
          )}
          {result && !loading && (
            result.type === 'flashcards'
              ? <FlashcardDeck cards={Array.isArray(result.content) ? result.content : []} />
              : <Markdown>{String(result.content)}</Markdown>
          )}
        </div>

        {result && !loading && (
          <div className="p-3 border-t border-line flex gap-2">
            <button onClick={copy} className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2 rounded-lg ring-1 ring-line hover:bg-tint">
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={saveToKb} className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2 rounded-lg bg-deep text-white hover:brightness-110">
              <Save size={15} /> Save to KB
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function resolveSource(state, panel) {
  if (!panel) return { messages: [], label: '' }
  if (panel.scope === 'topic') {
    const chat = state.chats.find((c) => c.id === panel.chatId)
    const topic = chat?.topics.find((t) => t.id === panel.sourceId)
    const ids = new Set(topic?.messageIds || [])
    return { messages: chat?.messages.filter((m) => ids.has(m.id)) || [], label: panel.sourceLabel }
  }
  const chat = state.chats.find((c) => c.id === panel.sourceId)
  return { messages: chat?.messages || [], label: panel.sourceLabel }
}
