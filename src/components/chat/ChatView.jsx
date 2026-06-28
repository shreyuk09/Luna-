import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../state/store.jsx'
import { colorByName, UNSORTED_COLOR } from '../../lib/colors.js'
import { NOTE_TYPES } from '../../lib/notePrompts.js'
import Message from './Message.jsx'
import Composer from './Composer.jsx'
import { ChevronRight, Book, Edit, ArrowDown } from '../ui/Icons.jsx'
import { createRecognizer, speak, cancelSpeak, stripMarkdown } from '../../lib/voice.js'

export default function ChatView({ onOpenTopics }) {
  const { state, actions } = useStore()
  const chat = state.chats.find((c) => c.id === state.activeChatId)
  const scrollRef = useRef(null)
  const [crumb, setCrumb] = useState(null)
  const [showJump, setShowJump] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  // color lookup per topic
  const colorMap = useMemo(() => {
    const m = {}
    chat?.topics.forEach((t) => { m[t.id] = colorByName(t.color) })
    return m
  }, [chat?.topics])
  const topicTitle = useMemo(() => {
    const m = {}
    chat?.topics.forEach((t) => { m[t.id] = t.title })
    return m
  }, [chat?.topics])

  const streaming = chat?.messages.some((m) => m.streaming)

  // auto-scroll while streaming / on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [chat?.messages])

  const scrollToBottom = () => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }
  const onScroll = () => {
    const el = scrollRef.current
    if (el) setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 240)
  }

  // ── hands-free voice conversation mode ──────────────────────────────────────
  const vmRef = useRef(false)
  useEffect(() => { vmRef.current = voiceMode }, [voiceMode])
  const lastSpoken = useRef(null)
  const listenOnce = () => {
    const rec = createRecognizer({
      lang: state.voice.lang,
      onResult: ({ final }) => { if (final) { rec.stop(); actions.sendMessage(final) } },
      onEnd: () => {}, onError: () => {},
    })
    if (rec) { try { rec.start() } catch { /* */ } }
  }
  // when a reply finishes while in voice mode → speak it, then listen again
  useEffect(() => {
    if (!voiceMode || !chat) return
    const last = chat.messages[chat.messages.length - 1]
    if (!last || last.role !== 'assistant' || last.streaming || !last.content) return
    if (lastSpoken.current === last.id) return
    lastSpoken.current = last.id
    const u = speak(stripMarkdown(last.content), state.voice)
    const after = () => { if (vmRef.current) listenOnce() }
    if (u) { u.onend = after; u.onerror = after } else after()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.messages, voiceMode])

  const toggleVoiceMode = () => {
    const next = !voiceMode
    setVoiceMode(next)
    if (next) { actions.toast('Voice mode on — speak after the reply'); lastSpoken.current = null; listenOnce() }
    else cancelSpeak()
  }

  // jump-to-topic
  useEffect(() => {
    if (!state.jumpTarget) return
    const el = document.getElementById(state.jumpTarget)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-deep/50', 'rounded-xl')
      setTimeout(() => el.classList.remove('ring-2', 'ring-deep/50', 'rounded-xl'), 1600)
    }
    actions.clearJump()
  }, [state.jumpTarget])

  // breadcrumb: track which topic is currently in view
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !chat) return
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) {
        const tid = visible.target.getAttribute('data-topic-id')
        if (tid && topicTitle[tid]) setCrumb({ id: tid, title: topicTitle[tid] })
      }
    }, { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 })
    root.querySelectorAll('[data-topic-id]').forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [chat?.messages, topicTitle])

  if (!chat) {
    return <div className="flex-1 grid place-items-center text-ink2">No chat selected. Create a new one from the left.</div>
  }

  const handleCommand = (cmd, arg) => {
    switch (cmd) {
      case '/summary':
        actions.openNotes({ sourceId: chat.id, sourceLabel: chat.title, scope: 'chat', initialType: 'summary' })
        break
      case '/notes':
        actions.openNotes({ sourceId: chat.id, sourceLabel: chat.title, scope: 'chat' })
        break
      case '/search':
        actions.setView('search')
        if (arg) window.dispatchEvent(new CustomEvent('synapse:search', { detail: arg }))
        break
      case '/branch': {
        const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant')
        if (lastAssistant) actions.branchChat(lastAssistant.id)
        else actions.toast('Nothing to branch yet')
        break
      }
      default:
        actions.toast(`Unknown command ${cmd}`)
    }
  }

  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant' && !m.streaming)
  const suggestions = lastAssistant ? buildSuggestions(chat, lastAssistant) : []

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* header / breadcrumb */}
      <div className="shrink-0 h-14 border-b border-line glass flex items-center gap-2 px-4 sm:px-6">
        <div className="min-w-0 flex items-center gap-1.5 text-sm">
          <span className="font-display font-semibold truncate max-w-[14rem]">{chat.title}</span>
          {crumb && (
            <>
              <ChevronRight size={14} className="text-ink2/70 shrink-0" />
              <span className="inline-flex items-center gap-1 text-ink2 truncate">
                <span className="w-2 h-2 rounded-full" style={{ background: (colorMap[crumb.id] || UNSORTED_COLOR).dot }} />
                {crumb.title}
              </span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => actions.openNotes({ sourceId: chat.id, sourceLabel: chat.title, scope: 'chat' })}
            className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg ring-1 ring-line hover:bg-tint">
            <Book size={15} /> Notes
          </button>
          <button onClick={onOpenTopics} className="xl:hidden text-sm px-2.5 py-1.5 rounded-lg ring-1 ring-line">Topics</button>
        </div>
      </div>

      {/* transcript */}
      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto scroll-smooth-area">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-7">
          {chat.messages.length === 0 && <EmptyState onPick={actions.sendMessage} />}
          {chat.messages.map((m) => (
            <Message key={m.id} msg={m} color={m.topicId ? colorMap[m.topicId] : null} topicTitle={m.topicId ? topicTitle[m.topicId] : null} />
          ))}

          {/* suggested follow-ups under latest answer */}
          {!streaming && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-11 animate-fade-rise">
              {suggestions.map((s) => (
                <button key={s} onClick={() => actions.sendMessage(s)}
                  className="text-sm rounded-full px-3.5 py-1.5 bg-surface ring-1 ring-line text-ink2 hover:text-accentink hover:bg-tint hover:ring-sea/45 shadow-lagoon-sm transition-all">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        {/* scroll-to-bottom button */}
        {showJump && (
          <button onClick={scrollToBottom} aria-label="Scroll to latest"
            className="absolute -top-12 left-1/2 -translate-x-1/2 z-10 grid place-items-center w-9 h-9 rounded-full bg-surface ring-1 ring-line text-ink2 hover:text-accentink shadow-lagoon hover:-translate-y-0.5 transition animate-fade-rise">
            <ArrowDown size={18} />
          </button>
        )}
        <Composer
          onSend={actions.sendMessage}
          onCreateImage={actions.generateImage}
          onCommand={handleCommand}
          streaming={streaming}
          onStop={() => { const s = chat.messages.find((m) => m.streaming); if (s) actions.stopStream(s.id) }}
          voiceMode={voiceMode}
          onToggleVoiceMode={toggleVoiceMode}
        />
      </div>
    </div>
  )
}

function EmptyState({ onPick }) {
  const ideas = ['Explain transformers like I\'m five', 'Help me plan a 3-minute demo', 'Compare REST vs GraphQL', 'Give me React performance tips']
  return (
    <div className="text-center py-20 animate-fade-rise">
      <div className="mx-auto mb-6 w-20 h-20 rounded-full orb-gradient shadow-lagoon-lg ring-1 ring-white/50 animate-float" aria-hidden="true" />
      <h2 className="text-2xl font-display font-bold"><span className="gradient-text">A calm place to think</span></h2>
      <p className="text-ink2 mt-2 mb-7 max-w-sm mx-auto">Ask anything. Luna gently organizes the conversation into topics on the right as you go.</p>
      <div className="flex flex-wrap justify-center gap-2.5 max-w-lg mx-auto">
        {ideas.map((i) => (
          <button key={i} onClick={() => onPick(i)}
            className="text-sm rounded-full px-4 py-2 bg-surface ring-1 ring-line text-ink2 hover:text-accentink hover:bg-tint hover:ring-sea/45 shadow-lagoon-sm hover:-translate-y-0.5 transition-all">
            {i}
          </button>
        ))}
      </div>
    </div>
  )
}

// Follow-up questions tailored to the exact question the user asked.
function buildSuggestions(chat, lastAssistant) {
  // the user message that prompted this answer
  const idx = chat.messages.findIndex((m) => m.id === lastAssistant.id)
  const userMsg = [...chat.messages.slice(0, idx)].reverse().find((m) => m.role === 'user')
  const q = userMsg?.content || ''
  const a = lastAssistant.content || ''
  const subject = subjectOf(q)
  const both = (q + ' ' + a).toLowerCase()
  const out = []

  if (/\bvs\b|versus|compare|comparison|difference between/i.test(q)) {
    out.push('Summarize the key differences in a table')
    if (subject) out.push(`Which is better for a beginner — and why?`)
  } else if (subject) {
    out.push(`Go deeper on ${subject}`)
    out.push(`Give a concrete example of ${subject}`)
  } else {
    out.push('Can you go deeper on that?')
    out.push('Give a concrete example')
  }

  if (/\bcode|function|api|react|\bjs\b|javascript|python|algorithm|\bsql\b|html|css|program/i.test(both)) out.push('Show me the code')
  if (/\bhow to|steps?|process|plan|build|implement|set up/i.test(both)) out.push('Turn this into step-by-step actions')
  if (subject) out.push(`What are common mistakes with ${subject}?`)
  out.push('What are the trade-offs?')

  return [...new Set(out)].slice(0, 4)
}

// Extract a short subject phrase from the user's question.
function subjectOf(q) {
  let s = (q || '').trim().replace(/[?.!]+$/, '')
  const lead = /^\s*(please\s+|can you\s+|could you\s+|give (me )?(detailed |a )?(information|info|details)?\s*(on|about)?\s*|explain( to me)?\s+|tell me about\s+|describe\s+|what(?:'s| is| are| was| were)\s+|who (?:is|was|were|are)\s+|how (?:do|does|to|can|could|should|is|are)\s+|how\s+|why (?:is|are|do|does)?\s*|when (?:is|was|did)?\s*|where (?:is|was)?\s*|define\s+|show me\s+|write\s+|create\s+|build\s+|list\s+|compare\s+)/i
  let prev
  do { prev = s; s = s.replace(lead, '') } while (s !== prev && s.length)
  s = s.replace(/\b(in detail|briefly|simply|in simple terms|step by step|for me|please)\b/gi, '')
    .replace(/\b(works?|working)\s*$/i, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ').trim()
  if (s.length < 3 || s.length > 48) return ''
  return s.split(/\s+/).slice(0, 6).join(' ')
}
