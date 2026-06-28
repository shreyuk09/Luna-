import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../state/store.jsx'
import { Send, Stop, Mic, Paperclip, Waveform, X, FileText, Image, Globe, Compass } from '../ui/Icons.jsx'
import { createRecognizer, sttSupported, ttsSupported, cancelSpeak } from '../../lib/voice.js'
import { readAttachment, prettySize } from '../../lib/docs.js'

export const SLASH_COMMANDS = [
  { cmd: '/summary', desc: 'Summarize this chat into notes' },
  { cmd: '/notes', desc: 'Open the AI notes panel' },
  { cmd: '/search', desc: 'Search across all chats' },
  { cmd: '/branch', desc: 'Branch a new chat from the last reply' },
]

export default function Composer({ onSend, onCreateImage, onCommand, streaming, onStop, voiceMode, onToggleVoiceMode }) {
  const { state, actions } = useStore()
  const [text, setText] = useState('')
  const [ripples, setRipples] = useState([])
  const [listening, setListening] = useState(false)
  const [attachment, setAttachment] = useState(null) // { name, mimeType, kind, dataUrl?|text?, size }
  const [reading, setReading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mode, setMode] = useState(null) // null | 'image' | 'web' | 'research'
  const taRef = useRef(null)
  const fileRef = useRef(null)
  const menuRef = useRef(null)
  const rid = useRef(0)
  const recogRef = useRef(null)

  // close the "+" menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const h = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const pickFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setReading(true)
    try {
      const att = await readAttachment(f)
      setAttachment({ ...att, size: f.size })
    } catch (err) {
      actions.toast(err?.message || 'Couldn’t read that file')
    } finally {
      setReading(false)
    }
  }
  const baseRef = useRef('')

  // ── voice input (speech-to-text) ─────────────────────────────────────────
  const stopListening = () => { recogRef.current?.stop() }
  const toggleMic = () => {
    if (listening) { stopListening(); return }
    cancelSpeak() // barge-in: stop any read-aloud
    baseRef.current = text ? text.trim() + ' ' : ''
    const rec = createRecognizer({
      lang: state.voice.lang,
      onResult: ({ final, interim }) => {
        setText(baseRef.current + (final || interim))
        if (final) {
          const out = (baseRef.current + final).trim()
          recogRef.current?.stop()
          if (state.voice.autoSend && out) {
            setText('')
            if (out.startsWith('/')) { const [c, ...r] = out.split(' '); onCommand(c.toLowerCase(), r.join(' ').trim()) }
            else onSend(out)
          }
        }
      },
      onEnd: () => { setListening(false); recogRef.current = null },
      onError: (err) => { setListening(false); if (err === 'not-allowed') actions.toast('Microphone permission was blocked') },
    })
    if (!rec) { actions.toast('Voice input is not supported in this browser'); return }
    recogRef.current = rec
    setListening(true)
    try { rec.start() } catch { /* already started */ }
  }
  useEffect(() => () => recogRef.current?.abort?.(), [])

  const showMenu = text.startsWith('/')
  const filtered = showMenu ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(text.split(' ')[0].toLowerCase())) : []
  const [hi, setHi] = useState(0)
  useEffect(() => { setHi(0) }, [text])

  const autosize = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }
  useEffect(autosize, [text])

  const submit = (e) => {
    if (e) {
      const id = ++rid.current
      setRipples((r) => [...r, { id }])
      setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 650)
    }
    const v = text.trim()
    if (!v && !attachment) return
    if (mode === 'image') {
      if (!v) { actions.toast('Describe the image you want to create'); return }
      onCreateImage?.(v)
      setText(''); setMode(null)
      return
    }
    if (v.startsWith('/')) {
      const [cmd, ...rest] = v.split(' ')
      onCommand(cmd.toLowerCase(), rest.join(' ').trim())
    } else {
      const fallback = attachment?.kind === 'doc' ? 'Summarize this document and pull out the key points.' : 'What’s in this image?'
      onSend(v || fallback, attachment, { web: mode === 'web', research: mode === 'research' })
    }
    setText('')
    setAttachment(null)
    // Web search stays on until dismissed (✕ on the pill); other modes are one-shot.
    if (mode !== 'web') setMode(null)
  }

  const pickCommand = (c) => {
    if (c.cmd === '/search' || c.cmd === '/branch') setText(c.cmd + ' ')
    else { onCommand(c.cmd, ''); setText('') }
    taRef.current?.focus()
  }

  const onKey = (e) => {
    if (showMenu && filtered.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % filtered.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Tab') { e.preventDefault(); pickCommand(filtered[hi]); return }
      if (e.key === 'Enter' && text.trim() === filtered[hi].cmd) { e.preventDefault(); pickCommand(filtered[hi]); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="relative px-4 sm:px-6 pb-5 pt-2">
      {/* ambient floating orbs behind the composer — calm, low opacity */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 overflow-hidden">
        <span className="ambient-orb absolute left-[12%] bottom-2 w-24 h-24 rounded-full bg-signature/30 blur-2xl animate-float" />
        <span className="ambient-orb absolute right-[18%] bottom-6 w-32 h-32 rounded-full bg-sea/15 blur-3xl animate-float-slow" />
        <span className="ambient-orb absolute left-[55%] bottom-0 w-20 h-20 rounded-full bg-signature/20 blur-2xl animate-float" style={{ animationDelay: '4s' }} />
      </div>

      {showMenu && filtered.length > 0 && (
        <div className="absolute bottom-full left-4 sm:left-6 mb-2 w-72 rounded-2xl glass shadow-lagoon ring-1 ring-line overflow-hidden animate-fade-rise z-10">
          {filtered.map((c, i) => (
            <button key={c.cmd} onMouseEnter={() => setHi(i)} onClick={() => pickCommand(c)}
              className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2 ${i === hi ? 'bg-tint' : ''}`}>
              <span className="font-mono text-sm text-accentink font-semibold">{c.cmd}</span>
              <span className="text-xs text-ink2">{c.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative max-w-3xl mx-auto">
        {/* active mode pill — Create image / Web search */}
        {mode && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-tint ring-1 ring-sea/40 text-accentink px-3 py-1 text-xs font-medium animate-fade-rise">
            {mode === 'image' ? <Image size={13} /> : mode === 'research' ? <Compass size={13} /> : <Globe size={13} />}
            {mode === 'image' ? 'Create image' : mode === 'research' ? 'Deep research' : 'Web search'}
            <button onClick={() => setMode(null)} className="ml-0.5 hover:text-rose-500"><X size={12} /></button>
          </div>
        )}
        {/* attachment preview — image thumbnail or document chip */}
        {attachment && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-xl bg-surface ring-1 ring-line p-1.5 pr-2 shadow-lagoon-sm animate-fade-rise">
            {attachment.dataUrl ? (
              <img src={attachment.dataUrl} alt="attachment" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <span className="w-10 h-10 rounded-lg bg-tint grid place-items-center text-accentink shrink-0"><FileText size={18} /></span>
            )}
            <div className="min-w-0">
              <div className="text-xs text-ink max-w-[12rem] truncate">{attachment.name}</div>
              <div className="text-[10px] text-ink2">
                {attachment.kind === 'doc' ? 'Document — Luna will read its text' : 'Image'}
                {attachment.size ? ' · ' + prettySize(attachment.size) : ''}
              </div>
            </div>
            <button onClick={() => setAttachment(null)} className="text-ink2 hover:text-rose-500 p-0.5"><X size={14} /></button>
          </div>
        )}
        <input ref={fileRef} type="file" hidden onChange={pickFile}
          accept="image/*,application/pdf,.pdf,text/*,.txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.yaml,.yml,.toml,.ini,.xml,.html,.htm,.css,.scss,.js,.jsx,.mjs,.ts,.tsx,.py,.java,.kt,.c,.h,.cpp,.cc,.cs,.rb,.go,.rs,.php,.swift,.sh,.sql,.log,.conf,.tex,.srt,.vtt" />
        <div className={`flex items-end gap-1.5 rounded-[26px] bg-surface ring-1 px-3 py-2 shadow-lagoon transition ${listening ? 'ring-sea/60 animate-breathe' : 'ring-line focus-within:ring-sea/50 focus-within:animate-breathe'}`}>
          {/* "+" menu: add files, create image, web search */}
          <div className="relative shrink-0" ref={menuRef}>
            <button onClick={() => setMenuOpen((o) => !o)} disabled={reading} aria-label="Add files, create image, or web search" aria-expanded={menuOpen}
              className={`grid place-items-center w-11 h-11 rounded-full transition ${reading ? 'text-sea animate-breathe' : menuOpen ? 'bg-tint text-accentink' : 'text-ink2 hover:text-accentink hover:bg-tint'}`}>
              <Paperclip size={18} />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl glass shadow-lagoon ring-1 ring-line overflow-hidden animate-fade-rise z-20 p-1">
                <button onClick={() => { setMenuOpen(false); setMode(null); fileRef.current?.click() }}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-xl hover:bg-tint transition">
                  <Paperclip size={18} className="text-accentink shrink-0" />
                  <span className="text-sm font-medium text-ink">Add photos &amp; files</span>
                </button>
                <button onClick={() => { setMenuOpen(false); setAttachment(null); setMode('image'); taRef.current?.focus() }}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-xl hover:bg-tint transition">
                  <Image size={18} className="text-accentink shrink-0" />
                  <span className="text-sm font-medium text-ink">Create image</span>
                  <span className="text-xs text-ink2 ml-auto">Visualize anything</span>
                </button>
                <button onClick={() => { setMenuOpen(false); setMode('web'); taRef.current?.focus() }}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-xl hover:bg-tint transition">
                  <Globe size={18} className="text-accentink shrink-0" />
                  <span className="text-sm font-medium text-ink">Web search</span>
                  <span className="text-xs text-ink2 ml-auto">Real-time info</span>
                </button>
                <button onClick={() => { setMenuOpen(false); setAttachment(null); setMode('research'); taRef.current?.focus() }}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-xl hover:bg-tint transition">
                  <Compass size={18} className="text-accentink shrink-0" />
                  <span className="text-sm font-medium text-ink">Deep research</span>
                  <span className="text-xs text-ink2 ml-auto">Multi-source report</span>
                </button>
              </div>
            )}
          </div>
          {/* voice input */}
          {sttSupported && (
            <button onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak your message'} aria-pressed={listening}
              className={`shrink-0 grid place-items-center w-11 h-11 rounded-full transition ${listening ? 'bg-sea text-white shadow-lagoon animate-breathe' : 'text-ink2 hover:text-accentink hover:bg-tint'}`}>
              <Mic size={18} />
            </button>
          )}
          <textarea ref={taRef} rows={1} value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
            aria-label="Message Luna"
            placeholder={listening ? 'Listening… speak now' : mode === 'image' ? 'Describe the image to create…' : mode === 'web' ? 'Search the web for…' : mode === 'research' ? 'Enter a topic to research deeply…' : "Share what's on your mind…  (try /summary or /search)"}
            className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-relaxed max-h-48 py-2 px-2 text-ink placeholder:text-ink2/70" />
          {/* hands-free voice conversation mode */}
          {sttSupported && ttsSupported && (
            <button onClick={onToggleVoiceMode} aria-label="Voice conversation mode" aria-pressed={voiceMode} title="Hands-free voice mode"
              className={`shrink-0 grid place-items-center w-11 h-11 rounded-full transition ${voiceMode ? 'bg-sea text-white shadow-lagoon' : 'text-ink2 hover:text-accentink hover:bg-tint'}`}>
              <Waveform size={18} />
            </button>
          )}
          {streaming ? (
            <button onClick={onStop} aria-label="Stop generating"
              className="shrink-0 grid place-items-center w-11 h-11 rounded-full bg-tint text-accentink hover:brightness-95 transition">
              <Stop size={17} />
            </button>
          ) : (
            <button onClick={submit} disabled={!text.trim() && !attachment} aria-label="Send message"
              className="relative shrink-0 grid place-items-center w-11 h-11 rounded-full bg-deep text-white overflow-hidden shadow-lagoon disabled:opacity-40 disabled:shadow-none enabled:hover:brightness-110 active:scale-95 transition">
              {ripples.map((r) => (
                <span key={r.id} className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-white/40 animate-ripple" />
              ))}
              <Send size={17} className="relative -ml-0.5" />
            </button>
          )}
        </div>
        <p className="text-[11px] text-ink2/80 text-center mt-2.5">Luna can make mistakes — take a breath and verify what matters. Confidence chips are gentle signposting.</p>
      </div>
    </div>
  )
}
