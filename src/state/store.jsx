import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback } from 'react'
import { uid } from '../lib/id.js'
import { load, save } from '../lib/storage.js'
import { nextColor } from '../lib/colors.js'
import { callModel, callModelTools, hasLiveModel } from '../lib/callModel.js'
import { deriveConfidence } from '../lib/confidence.js'
import { NOTE_TYPES, transcriptText } from '../lib/notePrompts.js'
import { mcp, getMcpConfig } from '../lib/mcpClient.js'
import { getVoiceConfig, setVoiceConfig, speak, cancelSpeak, stripMarkdown, ttsSupported } from '../lib/voice.js'
import { CHAT_SYSTEM, AGENT_SYSTEM } from '../lib/persona.js'

const StoreCtx = createContext(null)
export const useStore = () => useContext(StoreCtx)

// ── seed data so the app looks alive on first load ──────────────────────────
function seed() {
  const now = Date.now()
  const day = 86400000
  const mk = (title, createdAt, msgs) => {
    const id = uid('c_')
    const topics = []
    const messages = msgs.map(([role, content], i) => ({
      id: uid('m_'), role, content, createdAt: createdAt + i * 1000, topicId: null, pinned: false,
      confidence: role === 'assistant' ? deriveConfidence(content) : null,
    }))
    return { id, title, createdAt, updatedAt: createdAt + msgs.length * 1000, messages, topics }
  }
  const c1 = mk('Hackathon Ideas', now - 2 * 3600000, [
    ['user', 'What are some strong hackathon project ideas around AI chat?'],
    ['assistant', 'A few directions: a **topic-indexed chatbot** that auto-organizes long conversations, a study companion that turns chats into flashcards, and a research agent with citations. The topic index is the most visually demoable.'],
    ['user', 'How would the topic index actually work?'],
    ['assistant', 'After each exchange, a lightweight agent assigns the messages to an existing topic or spins up a new one, then renders them as clickable anchors with color accents.'],
  ])
  const c2 = mk('Resume Building', now - 5 * 3600000, [
    ['user', 'Tips for a strong software engineering resume?'],
    ['assistant', 'Lead with impact and metrics, keep it to one page, and tailor the top third to the role. Use action verbs and quantify outcomes.'],
  ])
  const c3 = mk('React Project', now - 32 * day, [
    ['user', 'How should I structure a medium React app?'],
    ['assistant', 'Group by feature, keep shared UI in a components folder, and put cross-cutting state in a single store. Avoid premature abstraction.'],
  ])
  const c4 = mk('AWS Course Notes', now - 40 * day, [
    ['user', 'Summarize the core AWS compute services.'],
    ['assistant', 'EC2 for virtual machines, Lambda for serverless functions, ECS/EKS for containers, and Fargate for serverless containers. Pick based on control vs. operational overhead.'],
  ])
  return [c1, c2, c3, c4]
}

// ── initial state ───────────────────────────────────────────────────────────
function initState() {
  const persisted = load('state', null)
  const theme = load('theme', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const mcpState = { ...getMcpConfig(), connected: false, tools: [], error: null, connecting: false }
  const voice = getVoiceConfig()
  if (persisted?.chats?.length) {
    return { ...persisted, theme, view: 'chat', toasts: [], notesPanel: null, settingsOpen: false, mcp: mcpState, voice }
  }
  const chats = seed()
  return {
    chats,
    notes: [],
    activeChatId: chats[0].id,
    view: 'chat',
    theme,
    toasts: [],
    notesPanel: null,   // { sourceId, sourceLabel } when open
    settingsOpen: false,
    jumpTarget: null,   // messageId to scroll to
    mcp: mcpState,      // { url, enabled, connected, connecting, tools[], error }
    voice,              // { autoSpeak, autoSend, voiceURI, rate, lang }
  }
}

// ── reducer ─────────────────────────────────────────────────────────────────
function reducer(state, a) {
  switch (a.type) {
    case 'SET_VIEW':
      return { ...state, view: a.view }
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark' }
    case 'SELECT_CHAT':
      return { ...state, activeChatId: a.id, view: 'chat' }
    case 'NEW_CHAT': {
      const chat = { id: a.id, title: 'New chat', createdAt: a.now, updatedAt: a.now, messages: [], topics: [] }
      return { ...state, chats: [chat, ...state.chats], activeChatId: chat.id, view: 'chat' }
    }
    case 'DELETE_CHAT': {
      const chats = state.chats.filter((c) => c.id !== a.id)
      const activeChatId = state.activeChatId === a.id ? chats[0]?.id ?? null : state.activeChatId
      return { ...state, chats, activeChatId }
    }
    case 'PATCH_CHAT':
      return { ...state, chats: state.chats.map((c) => (c.id === a.id ? a.fn(c) : c)) }
    case 'JUMP':
      return { ...state, jumpTarget: a.messageId, view: 'chat', activeChatId: a.chatId ?? state.activeChatId }
    case 'CLEAR_JUMP':
      return { ...state, jumpTarget: null }
    case 'ADD_NOTE':
      return { ...state, notes: [a.note, ...state.notes] }
    case 'DELETE_NOTE':
      return { ...state, notes: state.notes.filter((n) => n.id !== a.id) }
    case 'OPEN_NOTES':
      return { ...state, notesPanel: a.payload }
    case 'CLOSE_NOTES':
      return { ...state, notesPanel: null }
    case 'SET_SETTINGS_OPEN':
      return { ...state, settingsOpen: a.open }
    case 'SET_MCP':
      return { ...state, mcp: { ...state.mcp, ...a.patch } }
    case 'SET_VOICE':
      return { ...state, voice: { ...state.voice, ...a.patch } }
    case 'REPLACE_DATA': {
      const activeOk = a.chats.some((c) => c.id === state.activeChatId)
      return { ...state, chats: a.chats, notes: a.notes ?? state.notes, activeChatId: activeOk ? state.activeChatId : a.chats[0]?.id ?? null }
    }
    case 'PUSH_TOAST':
      return { ...state, toasts: [...state.toasts, a.toast] }
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== a.id) }
    default:
      return state
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const ref = useRef(state)
  ref.current = state

  // persistence
  useEffect(() => { save('theme', state.theme) }, [state.theme])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark')
  }, [state.theme])
  useEffect(() => {
    const { chats, notes, activeChatId } = state
    save('state', { chats, notes, activeChatId })
  }, [state.chats, state.notes, state.activeChatId])

  // ── real-time sync across open tabs/windows (BroadcastChannel) ──────────────
  const syncRef = useRef(null)
  const applyingRemote = useRef(false)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel('luna-sync')
    syncRef.current = ch
    ch.onmessage = (e) => {
      if (e.data?.type !== 'state') return
      applyingRemote.current = true
      dispatch({ type: 'REPLACE_DATA', chats: e.data.chats, notes: e.data.notes })
    }
    return () => ch.close()
  }, [])
  useEffect(() => {
    if (applyingRemote.current) { applyingRemote.current = false; return }
    // don't broadcast mid-stream (avoids clobbering other tabs token-by-token)
    if (state.chats.some((c) => c.messages.some((m) => m.streaming))) return
    syncRef.current?.postMessage({ type: 'state', chats: state.chats, notes: state.notes })
  }, [state.chats, state.notes])

  // ── chat helpers ──────────────────────────────────────────────────────────
  const patchChat = useCallback((id, fn) => dispatch({ type: 'PATCH_CHAT', id, fn }), [])
  const getChat = (id) => ref.current.chats.find((c) => c.id === id)

  const toast = useCallback((message, opts = {}) => {
    const id = uid('t_')
    dispatch({ type: 'PUSH_TOAST', toast: { id, message, ...opts } })
    if (!opts.sticky) setTimeout(() => dispatch({ type: 'DISMISS_TOAST', id }), opts.duration || 4000)
    return id
  }, [])
  const dismissToast = useCallback((id) => dispatch({ type: 'DISMISS_TOAST', id }), [])

  // ── MCP connection ──────────────────────────────────────────────────────────
  const mcpConnect = useCallback(async (url) => {
    const target = url || ref.current.mcp.url
    dispatch({ type: 'SET_MCP', patch: { connecting: true, error: null, url: target } })
    try {
      const tools = await mcp.connect(target)
      dispatch({ type: 'SET_MCP', patch: { connected: true, connecting: false, tools, error: null } })
      return tools
    } catch (e) {
      mcp.disconnect()
      dispatch({ type: 'SET_MCP', patch: { connected: false, connecting: false, tools: [], error: e.message } })
      return null
    }
  }, [])

  const mcpDisconnect = useCallback(() => {
    mcp.disconnect()
    dispatch({ type: 'SET_MCP', patch: { connected: false, tools: [] } })
  }, [])

  const setMcpEnabled = useCallback((enabled) => {
    save('mcp', { ...ref.current.mcp, enabled })
    dispatch({ type: 'SET_MCP', patch: { enabled } })
  }, [])

  // ── voice ───────────────────────────────────────────────────────────────────
  const setVoice = useCallback((patch) => {
    const next = { ...ref.current.voice, ...patch }
    setVoiceConfig(next)
    dispatch({ type: 'SET_VOICE', patch })
    if (patch.autoSpeak === false) cancelSpeak()
  }, [])
  const stopSpeaking = useCallback(() => cancelSpeak(), [])

  // auto-connect on mount if enabled (silent on failure — chat still works)
  // MCP tools are optional (the app does math/time/facts/AI without them), so we
  // don't auto-connect — the user connects from Settings if they want tool cards.

  // (When a key-based model fails it silently falls back to Free AI — no toast.)

  // notify when Free AI can't reach the local helper server
  useEffect(() => {
    const h = () => toast('Free AI couldn’t reach the model (the free service may be busy). Try again in a moment, or use Gemini in ⚙️ Settings.', { duration: 8000 })
    window.addEventListener('lagoon:free-unavailable', h)
    return () => window.removeEventListener('lagoon:free-unavailable', h)
  }, [toast])

  // ── send a message (streaming + async segmentation) ─────────────────────────
  const streamRefs = useRef({})

  const patchAssistant = useCallback((chatId, assistantId, patch) => {
    patchChat(chatId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
    }))
  }, [patchChat])

  // `history` is passed in explicitly because the just-dispatched messages may
  // not be reflected in the state ref yet (React hasn't re-rendered).
  const runAssistant = useCallback(async (chatId, assistantId, history, userId, task) => {
    const controller = new AbortController()
    streamRefs.current[assistantId] = controller
    let acc = ''
    try {
      await callModel({
        system: CHAT_SYSTEM,
        messages: history,
        signal: controller.signal,
        task,
        onToken: (tk) => {
          acc += tk
          patchChat(chatId, (c) => ({
            ...c,
            messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content: acc, streaming: true } : m)),
          }))
        },
      })
    } catch (e) {
      if (e.name !== 'AbortError') acc += `\n\n_⚠ ${e.message}_`
    }
    const confidence = deriveConfidence(acc, { strong: hasLiveModel() })
    patchChat(chatId, (c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content: acc, streaming: false, confidence } : m)),
    }))
    delete streamRefs.current[assistantId]
    if (ref.current.voice.autoSpeak && acc) speak(stripMarkdown(acc), ref.current.voice)
    // segment after the reply lands (non-blocking). Pass the exact exchange so we
    // don't depend on the (possibly stale) state ref to locate the latest pair.
    const userText = [...history].reverse().find((m) => m.role === 'user')?.content || ''
    if (userId && acc) segmentExchange(chatId, userId, assistantId, userText, acc)
  }, [patchChat])

  // ── agentic loop with MCP tools ─────────────────────────────────────────────
  const runAgent = useCallback(async (chatId, assistantId, history, userId, userText) => {
    const controller = new AbortController()
    streamRefs.current[assistantId] = controller
    const tools = mcp.anthropicTools()
    const loopMsgs = history.map((m) => ({ role: m.role, content: m.content }))
    const toolCalls = []
    const sources = []
    let usedSearch = false
    let finalText = ''
    const system = AGENT_SYSTEM

    try {
      for (let step = 0; step < 4; step++) {
        const { text, toolUses } = await callModelTools({ system, messages: loopMsgs, tools, signal: controller.signal })
        if (!toolUses.length) { finalText = text || finalText; break }

        loopMsgs.push({ role: 'assistant', content: [...(text ? [{ type: 'text', text }] : []), ...toolUses.map((tu) => ({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input }))] })

        const resultBlocks = []
        for (const tu of toolUses) {
          const call = { id: tu.id, name: tu.name, input: tu.input, status: 'running', result: '' }
          toolCalls.push(call)
          patchAssistant(chatId, assistantId, { toolCalls: toolCalls.map((c) => ({ ...c })) })
          let out
          try { out = await mcp.callTool(tu.name, tu.input) } catch (e) { out = { text: 'Error: ' + e.message, isError: true } }
          call.status = out.isError ? 'error' : 'done'
          call.result = out.text
          if ((tu.name === 'web_search' || tu.name === 'wikipedia_answer') && !out.isError) {
            usedSearch = true
            ;(out.text.match(/https?:\/\/\S+/g) || []).forEach((url) => sources.push({ url: url.replace(/[.,]$/, ''), title: decodeURIComponent(url.split('/wiki/')[1]?.replace(/_/g, ' ') || 'source') }))
          }
          patchAssistant(chatId, assistantId, { toolCalls: toolCalls.map((c) => ({ ...c })) })
          resultBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: out.text, is_error: out.isError })
        }
        loopMsgs.push({ role: 'user', content: resultBlocks })
      }
    } catch (e) {
      if (e.name !== 'AbortError') finalText += `\n\n_⚠ ${e.message}_`
    }

    // typewriter the final answer for a live feel
    const full = finalText
    let acc = ''
    const tokens = full.match(/\S+\s*/g) || [full]
    for (const tk of tokens) {
      if (controller.signal.aborted) break
      acc += tk
      patchAssistant(chatId, assistantId, { content: acc, streaming: true })
      await new Promise((r) => setTimeout(r, 12))
    }

    const deterministic = toolCalls.some((c) => (c.name === 'calculator' || c.name === 'current_datetime') && c.status === 'done')
    const confidence = deriveConfidence(full, { grounded: usedSearch, sources, deterministic, strong: hasLiveModel() })
    patchChat(chatId, (c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content: full, streaming: false, confidence, toolCalls: toolCalls.map((x) => ({ ...x })) } : m)),
    }))
    delete streamRefs.current[assistantId]
    if (ref.current.voice.autoSpeak && full) speak(stripMarkdown(full), ref.current.voice)
    if (userId && full) segmentExchange(chatId, userId, assistantId, userText, full)
  }, [patchChat, patchAssistant])

  const sendMessage = useCallback((text, attachment, opts = {}) => {
    const chatId = ref.current.activeChatId
    if (!chatId || (!text.trim() && !attachment)) return
    const chat = getChat(chatId)
    if (!chat) return
    cancelSpeak() // stop any read-aloud when a new turn starts
    const userMsg = { id: uid('m_'), role: 'user', content: text.trim(), createdAt: Date.now(), topicId: null, pinned: false, confidence: null, attachment: attachment || null }
    const assistantId = uid('m_')
    const assistantMsg = { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() + 1, topicId: null, pinned: false, confidence: null, streaming: true }
    // Build history from current messages + the new user turn, before dispatching.
    const history = [...chat.messages, userMsg].map((m) => ({ role: m.role, content: m.content, attachment: m.attachment }))
    patchChat(chatId, (c) => {
      const isFirst = c.messages.length === 0
      return {
        ...c,
        title: isFirst ? smartTitle(text) : c.title,
        updatedAt: Date.now(),
        messages: [...c.messages, userMsg, assistantMsg],
      }
    })
    const useTools = ref.current.mcp.enabled && ref.current.mcp.connected && ref.current.mcp.tools.length > 0
    if (useTools) runAgent(chatId, assistantId, history, userMsg.id, userMsg.content)
    else runAssistant(chatId, assistantId, history, userMsg.id, opts.research ? 'research' : opts.web ? 'search' : undefined)
  }, [patchChat, runAssistant, runAgent])

  // Keyless image generation (Pollinations). Renders inline as a markdown image.
  const generateImage = useCallback((prompt) => {
    const chatId = ref.current.activeChatId
    const p = (prompt || '').trim()
    if (!chatId || !p) return
    const chat = getChat(chatId)
    if (!chat) return
    cancelSpeak()
    const seed = Math.floor(Math.random() * 1e6)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&nologo=true&seed=${seed}`
    const userMsg = { id: uid('m_'), role: 'user', content: p, createdAt: Date.now(), topicId: null, pinned: false, confidence: null, attachment: null }
    const safe = p.replace(/[[\]]/g, '')
    const assistantMsg = { id: uid('m_'), role: 'assistant', content: `🎨 Generated image for **${safe}**\n\n![${safe}](${url})`, createdAt: Date.now() + 1, topicId: null, pinned: false, confidence: null, streaming: false }
    patchChat(chatId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? smartTitle(p) : c.title,
      updatedAt: Date.now(),
      messages: [...c.messages, userMsg, assistantMsg],
    }))
  }, [patchChat])

  const stopStream = useCallback((messageId) => {
    streamRefs.current[messageId]?.abort()
  }, [])

  const regenerate = useCallback((messageId) => {
    const chatId = ref.current.activeChatId
    const chat = getChat(chatId)
    if (!chat) return
    const idx = chat.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const history = chat.messages.slice(0, idx).map((m) => ({ role: m.role, content: m.content }))
    const userId = [...chat.messages.slice(0, idx)].reverse().find((m) => m.role === 'user')?.id
    // reset the target assistant message, then re-run with the prior history
    patchChat(chatId, (c) => ({
      ...c,
      messages: c.messages.slice(0, idx).concat({ ...c.messages[idx], content: '', streaming: true, confidence: null }),
    }))
    runAssistant(chatId, messageId, history, userId)
  }, [patchChat, runAssistant])

  const branchChat = useCallback((messageId) => {
    const chatId = ref.current.activeChatId
    const chat = getChat(chatId)
    if (!chat) return
    const idx = chat.messages.findIndex((m) => m.id === messageId)
    const slice = chat.messages.slice(0, idx + 1).map((m) => ({ ...m, id: uid('m_') }))
    const id = uid('c_')
    const now = Date.now()
    dispatch({ type: 'NEW_CHAT', id, now })
    patchChat(id, (c) => ({ ...c, title: '↳ ' + chat.title, messages: slice, topics: [] }))
    toast('Branched into a new chat')
  }, [patchChat, toast])

  const togglePin = useCallback((messageId) => {
    const chatId = ref.current.activeChatId
    patchChat(chatId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === messageId ? { ...m, pinned: !m.pinned } : m)),
    }))
  }, [patchChat])

  // ── topic segmentation (the centerpiece) ────────────────────────────────────
  // Receives the exact exchange (ids + text) so it never relies on the state ref
  // to locate the latest pair — which may be stale right after a dispatch.
  const segmentExchange = useCallback(async (chatId, userId, assistantId, userText, assistantText) => {
    const chat = getChat(chatId)
    if (!chat) return
    const existing = chat.topics.map((t) => ({ id: t.id, title: t.title, locked: !!t.locked }))
    const system = [
      'You are a conversation segmenter. Assign the latest exchange to an existing topic or create a new one.',
      'Rules: any topic marked locked MUST keep its exact title and must not be recreated if absent.',
      'Prefer reusing an existing topic when the subject matches. Only create a new topic on a genuine subject change.',
      'Return ONLY JSON: {"topicId": "<id>" | "new", "title"?: "<short Title Case>", "summaryOneLine": "<<=80 chars>"}.',
      'EXISTING_TOPICS_JSON: ' + JSON.stringify(existing),
    ].join('\n')
    const exchange = `User: ${userText}\n\nAssistant: ${assistantText}`

    let parsed
    try {
      const raw = await callModel({ system, messages: [{ role: 'user', content: exchange }], json: true })
      parsed = safeJson(raw)
    } catch {
      parsed = null
    }
    if (!parsed || (!parsed.topicId && parsed.topicId !== 'new')) {
      // fallback: lump into Unsorted
      assignToTopic(chatId, [userId, assistantId], { topicId: 'new', title: 'Unsorted', summaryOneLine: '' }, true)
      return
    }
    assignToTopic(chatId, [userId, assistantId], parsed)
  }, [])

  const assignToTopic = useCallback((chatId, messageIds, parsed, isUnsorted = false) => {
    patchChat(chatId, (c) => {
      let topics = [...c.topics]
      let topicId = parsed.topicId
      const existing = topics.find((t) => t.id === topicId)

      if (topicId === 'new' || !existing) {
        // create — but never duplicate / resurrect a locked-deleted title is handled by caller logic
        const title = (parsed.title || 'Untitled').trim()
        const dupe = topics.find((t) => t.title.toLowerCase() === title.toLowerCase())
        if (dupe) {
          topicId = dupe.id
        } else {
          const t = {
            id: uid('top_'),
            title: isUnsorted ? 'Unsorted' : title,
            summary: parsed.summaryOneLine || '',
            color: isUnsorted ? 'slate' : nextColor(topics),
            messageIds: [],
            locked: false,
          }
          topics.push(t)
          topicId = t.id
        }
      }
      topics = topics.map((t) => {
        if (t.id !== topicId) return t
        const merged = Array.from(new Set([...t.messageIds, ...messageIds]))
        // respect locked: don't overwrite a locked title; allow summary refresh
        return { ...t, messageIds: merged, summary: parsed.summaryOneLine || t.summary }
      })
      const messages = c.messages.map((m) => (messageIds.includes(m.id) ? { ...m, topicId } : m))
      return { ...c, topics, messages }
    })
  }, [patchChat])

  // ── topic mutations (all set locked:true) ───────────────────────────────────
  const renameTopic = useCallback((chatId, topicId, title) => {
    patchChat(chatId, (c) => ({
      ...c,
      topics: c.topics.map((t) => (t.id === topicId ? { ...t, title: title.trim() || t.title, locked: true } : t)),
    }))
  }, [patchChat])

  // Manual ordering of the topic index (drag-to-reorder / shuffle / reset).
  const reorderTopics = useCallback((chatId, orderedIds) => {
    patchChat(chatId, (c) => ({ ...c, topicOrder: orderedIds }))
  }, [patchChat])

  const shuffleTopics = useCallback((chatId, currentIds) => {
    const a = [...currentIds]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    patchChat(chatId, (c) => ({ ...c, topicOrder: a }))
    toast('Topics shuffled')
  }, [patchChat, toast])

  const resetTopicOrder = useCallback((chatId) => {
    patchChat(chatId, (c) => ({ ...c, topicOrder: [] }))
    toast('Order reset to conversation flow')
  }, [patchChat, toast])

  const mergeTopics = useCallback((chatId, sourceId, targetId) => {
    if (sourceId === targetId) return
    patchChat(chatId, (c) => {
      const src = c.topics.find((t) => t.id === sourceId)
      const tgt = c.topics.find((t) => t.id === targetId)
      if (!src || !tgt) return c
      const messageIds = Array.from(new Set([...tgt.messageIds, ...src.messageIds]))
      const topics = c.topics
        .filter((t) => t.id !== sourceId)
        .map((t) => (t.id === targetId ? { ...t, messageIds, locked: true } : t))
      const messages = c.messages.map((m) => (src.messageIds.includes(m.id) ? { ...m, topicId: targetId } : m))
      return { ...c, topics, messages }
    })
    toast(`Merged into one topic`)
  }, [patchChat, toast])

  const deleteTopic = useCallback((chatId, topicId) => {
    const chat = getChat(chatId)
    const topic = chat?.topics.find((t) => t.id === topicId)
    if (!topic) return
    const snapshot = JSON.parse(JSON.stringify({ topics: chat.topics, messages: chat.messages, topicOrder: chat.topicOrder || [] }))

    patchChat(chatId, (c) => {
      // The topic card is removed from the index. Its messages stay in the
      // conversation but become ungrouped (topicId: null) — no "Unsorted" bucket,
      // so the topic visibly disappears.
      const topics = c.topics.filter((t) => t.id !== topicId)
      const gone = new Set(topic.messageIds)
      const messages = c.messages.map((m) => (gone.has(m.id) ? { ...m, topicId: null } : m))
      const topicOrder = (c.topicOrder || []).filter((id) => id !== topicId)
      return { ...c, topics, messages, topicOrder }
    })

    toast(`Topic "${topic.title}" deleted`, {
      action: { label: 'Undo', run: () => patchChat(chatId, (c) => ({ ...c, ...snapshot })) },
    })
  }, [patchChat, toast])

  // ── notes ───────────────────────────────────────────────────────────────────
  const generateNote = useCallback(async (sourceId, sourceLabel, messages, type) => {
    const cfg = NOTE_TYPES[type]
    const raw = await callModel({
      system: cfg.system,
      messages: [{ role: 'user', content: transcriptText(messages) }],
      json: type === 'flashcards',
      task: 'note',
    })
    let content = raw
    if (type === 'flashcards') {
      const arr = safeJson(raw)
      content = Array.isArray(arr) ? arr : (Array.isArray(arr?.content) ? arr.content : [])
    }
    return { type, content }
  }, [])

  const saveNote = useCallback((note) => {
    dispatch({ type: 'ADD_NOTE', note: { id: uid('n_'), createdAt: Date.now(), ...note } })
    toast('Saved to Knowledge Base')
  }, [toast])

  const deleteNote = useCallback((id) => dispatch({ type: 'DELETE_NOTE', id }), [])

  // ── settings + data portability ─────────────────────────────────────────────
  const updateSettings = useCallback((next) => { save('settings', next) }, [])

  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify({ chats: ref.current.chats, notes: ref.current.notes, exportedAt: Date.now() }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `luna-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
    toast('Exported your chats & notes')
  }, [toast])

  const importData = useCallback(async (file) => {
    try {
      const data = JSON.parse(await file.text())
      if (!Array.isArray(data.chats)) throw new Error('Invalid backup')
      dispatch({ type: 'REPLACE_DATA', chats: data.chats, notes: data.notes || [] })
      toast(`Imported ${data.chats.length} chat${data.chats.length !== 1 ? 's' : ''}`)
    } catch (e) { toast('Import failed: ' + e.message) }
  }, [toast])

  const actions = useMemo(() => ({
    dispatch,
    setView: (view) => dispatch({ type: 'SET_VIEW', view }),
    toggleTheme: () => dispatch({ type: 'TOGGLE_THEME' }),
    selectChat: (id) => dispatch({ type: 'SELECT_CHAT', id }),
    newChat: () => dispatch({ type: 'NEW_CHAT', id: uid('c_'), now: Date.now() }),
    deleteChat: (id) => dispatch({ type: 'DELETE_CHAT', id }),
    renameChat: (id, title) => patchChat(id, (c) => ({ ...c, title })),
    sendMessage, generateImage, stopStream, regenerate, branchChat, togglePin,
    renameTopic, mergeTopics, deleteTopic, reorderTopics, shuffleTopics, resetTopicOrder,
    jumpTo: (chatId, messageId) => dispatch({ type: 'JUMP', chatId, messageId }),
    clearJump: () => dispatch({ type: 'CLEAR_JUMP' }),
    openNotes: (payload) => dispatch({ type: 'OPEN_NOTES', payload }),
    closeNotes: () => dispatch({ type: 'CLOSE_NOTES' }),
    generateNote, saveNote, deleteNote,
    openSettings: () => dispatch({ type: 'SET_SETTINGS_OPEN', open: true }),
    closeSettings: () => dispatch({ type: 'SET_SETTINGS_OPEN', open: false }),
    updateSettings, exportData, importData,
    mcpConnect, mcpDisconnect, setMcpEnabled,
    setVoice, stopSpeaking,
    toast, dismissToast,
  }), [patchChat, sendMessage, generateImage, stopStream, regenerate, branchChat, togglePin, renameTopic, mergeTopics, deleteTopic, reorderTopics, shuffleTopics, resetTopicOrder, generateNote, saveNote, deleteNote, updateSettings, exportData, importData, mcpConnect, mcpDisconnect, setMcpEnabled, setVoice, stopSpeaking, toast, dismissToast])

  const value = useMemo(() => ({ state, actions }), [state, actions])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

// ── pure helpers ──────────────────────────────────────────────────────────────
function smartTitle(text) {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 42 ? t.slice(0, 40) + '…' : t
}

export function safeJson(raw) {
  if (!raw) return null
  let s = String(raw).trim()
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = s.search(/[[{]/)
  if (start > 0) s = s.slice(start)
  try { return JSON.parse(s) } catch { /* try to recover trailing junk */ }
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (end > 0) {
    try { return JSON.parse(s.slice(0, end + 1)) } catch { return null }
  }
  return null
}
