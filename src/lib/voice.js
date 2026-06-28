// ───────────────────────────────────────────────────────────────────────────
// Voice assistant — thin wrappers over the browser Web Speech API.
//   • Speech-to-text  : SpeechRecognition (mic input)
//   • Text-to-speech  : speechSynthesis  (read replies aloud)
// No external deps, no API key. Degrades gracefully where unsupported
// (e.g. Firefox has TTS but no SpeechRecognition).
// ───────────────────────────────────────────────────────────────────────────
import { load, save } from './storage.js'

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const sttSupported = !!SR
export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

export function getVoiceConfig() {
  return load('voice', { autoSpeak: false, autoSend: true, voiceURI: '', rate: 1, lang: 'en-US' })
}
export function setVoiceConfig(cfg) { save('voice', cfg) }

// ── Speech recognition ──────────────────────────────────────────────────────
export function createRecognizer({ lang = 'en-US', interim = true, onResult, onEnd, onError } = {}) {
  if (!SR) return null
  const rec = new SR()
  rec.lang = lang
  rec.interimResults = interim
  rec.continuous = false
  rec.maxAlternatives = 1
  rec.onresult = (e) => {
    let final = '', live = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const txt = e.results[i][0].transcript
      if (e.results[i].isFinal) final += txt
      else live += txt
    }
    onResult?.({ final: final.trim(), interim: live.trim() })
  }
  rec.onerror = (e) => onError?.(e.error)
  rec.onend = () => onEnd?.()
  return rec
}

// ── Text to speech ──────────────────────────────────────────────────────────
export function listVoices() {
  if (!ttsSupported) return []
  return window.speechSynthesis.getVoices()
}

// Voices populate asynchronously; let callers react when they arrive.
export function onVoicesReady(cb) {
  if (!ttsSupported) return () => {}
  const handler = () => cb(listVoices())
  window.speechSynthesis.addEventListener('voiceschanged', handler)
  if (listVoices().length) cb(listVoices())
  return () => window.speechSynthesis.removeEventListener('voiceschanged', handler)
}

export function speak(text, cfg = {}) {
  if (!ttsSupported || !text) return null
  cancelSpeak()
  const u = new SpeechSynthesisUtterance(text)
  const voices = listVoices()
  const chosen = voices.find((v) => v.voiceURI === cfg.voiceURI) || voices.find((v) => /en[-_]/i.test(v.lang))
  if (chosen) { u.voice = chosen; u.lang = chosen.lang }
  else u.lang = cfg.lang || 'en-US'
  u.rate = cfg.rate || 1
  u.pitch = 1
  window.speechSynthesis.speak(u)
  return u
}

export function cancelSpeak() {
  if (ttsSupported) window.speechSynthesis.cancel()
}

// Flatten markdown into something pleasant to read aloud.
export function stripMarkdown(md = '') {
  return String(md)
    .replace(/```[\s\S]*?```/g, ' — code snippet — ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>#]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}
