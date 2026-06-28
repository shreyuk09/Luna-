import { useEffect, useState } from 'react'
import { useStore } from '../../state/store.jsx'
import Markdown from './Markdown.jsx'
import ConfidenceChip from './ConfidenceChip.jsx'
import ToolCall from './ToolCall.jsx'
import { speak, cancelSpeak, stripMarkdown, ttsSupported, getVoiceConfig } from '../../lib/voice.js'
import { Copy, Check, Refresh, Branch, Pin, Volume, VolumeX, FileText } from '../ui/Icons.jsx'

export function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1.5" aria-label="Luna is typing" role="status">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-2 h-2 rounded-full bg-sea animate-dot-pulse" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </div>
  )
}

export default function Message({ msg, color, topicTitle }) {
  const { actions } = useStore()
  const [copied, setCopied] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const isUser = msg.role === 'user'
  const copy = () => {
    navigator.clipboard?.writeText(msg.content)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  const toggleSpeak = () => {
    if (speaking) { cancelSpeak(); setSpeaking(false); return }
    const u = speak(stripMarkdown(msg.content), getVoiceConfig())
    if (u) { setSpeaking(true); u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false) }
  }
  useEffect(() => () => { if (speaking) cancelSpeak() }, [speaking])
  const accent = color?.border || '#45B5A6'
  const empty = !msg.content || msg.content.length < 2

  // ── User: soft seafoam pill, aligned right ────────────────────────────────
  if (isUser) {
    return (
      <div id={msg.id} data-topic-id={msg.topicId || ''} className="scroll-mt-24 animate-fade-rise group flex justify-end">
        <div className="max-w-[82%] sm:max-w-[75%]">
          {msg.attachment?.dataUrl && (
            <img src={msg.attachment.dataUrl} alt={msg.attachment.name || 'attachment'}
              className="mb-1.5 ml-auto max-h-56 rounded-2xl rounded-tr-md ring-1 ring-line object-cover" />
          )}
          {msg.attachment && !msg.attachment.dataUrl && (
            <div className="mb-1.5 ml-auto w-fit inline-flex items-center gap-2 rounded-2xl rounded-tr-md bg-surface ring-1 ring-line px-3 py-2 shadow-lagoon-sm">
              <span className="w-8 h-8 rounded-lg bg-tint grid place-items-center text-accentink shrink-0"><FileText size={16} /></span>
              <span className="text-xs text-ink max-w-[12rem] truncate">{msg.attachment.name || 'document'}</span>
            </div>
          )}
          <div className="rounded-[22px] rounded-tr-md bg-userfill text-[#16332F] px-4 py-2.5 shadow-lagoon-sm">
            <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{msg.content}</p>
          </div>
          <div className="mt-1 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
            {msg.pinned && <Pin size={13} className="text-sea mr-1" />}
            <Act onClick={copy} title="Copy message">{copied ? <Check size={14} /> : <Copy size={14} />}</Act>
            <Act onClick={() => actions.togglePin(msg.id)} title={msg.pinned ? 'Unpin' : 'Pin'}>
              <Pin size={14} className={msg.pinned ? 'text-sea' : ''} />
            </Act>
          </div>
        </div>
      </div>
    )
  }

  // ── Assistant: flowing text with a thin seagreen accent bar ───────────────
  return (
    <div id={msg.id} data-topic-id={msg.topicId || ''} className="scroll-mt-24 animate-fade-rise group">
      <div className="flex gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full orb-gradient shadow-lagoon-sm ring-1 ring-white/40" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 h-5">
            <span className="text-sm font-display font-semibold text-ink">Luna</span>
            {msg.pinned && <Pin size={13} className="text-sea" />}
            {topicTitle && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
                {topicTitle}
              </span>
            )}
          </div>

          {msg.toolCalls?.length > 0 && (
            <div className="mb-2.5 space-y-1.5">
              {msg.toolCalls.map((call) => <ToolCall key={call.id} call={call} />)}
            </div>
          )}

          <div className="pl-4 border-l-[3px] rounded-l" style={{ borderColor: accent }}>
            {msg.streaming && empty ? <TypingDots /> : <Markdown>{msg.content}</Markdown>}
          </div>

          <div className="mt-2 flex items-center gap-2 flex-wrap min-h-[24px]">
            {!msg.streaming && <ConfidenceChip confidence={msg.confidence} />}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
              {ttsSupported && !msg.streaming && (
                <Act onClick={toggleSpeak} title={speaking ? 'Stop' : 'Read aloud'}>
                  {speaking ? <VolumeX size={14} className="text-sea" /> : <Volume size={14} />}
                </Act>
              )}
              <Act onClick={copy} title="Copy answer">{copied ? <Check size={14} /> : <Copy size={14} />}</Act>
              <Act onClick={() => actions.regenerate(msg.id)} title="Regenerate"><Refresh size={14} /></Act>
              <Act onClick={() => actions.branchChat(msg.id)} title="Branch from here"><Branch size={14} /></Act>
              <Act onClick={() => actions.togglePin(msg.id)} title={msg.pinned ? 'Unpin' : 'Pin'}>
                <Pin size={14} className={msg.pinned ? 'text-sea' : ''} />
              </Act>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const Act = ({ children, ...p }) => (
  <button {...p} className="p-1.5 rounded-full text-ink2 hover:text-accentink hover:bg-tint transition">
    {children}
  </button>
)
