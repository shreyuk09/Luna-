# 🌙 Luna — a calm, topic-indexed AI chatbot

A polished, demo-ready AI chat app with a **live in-chat Topic Index**, an **AI Memory Timeline**, **smart search**, one-click **AI notes**, a personal **Knowledge Base** (notes / flashcards / FAQs), a **voice assistant**, **document & image understanding**, **keyless image generation**, **live web search**, and **grounded answers with honest accuracy chips**.

**Design** — a quiet seaside aesthetic: soft seagreen palette, rounded organic shapes, diffuse seagreen shadows, slow ambient motion, generous whitespace. AI replies are clean flowing text with a thin seagreen accent bar; your messages are soft right-aligned seafoam pills. Light + dark, fully responsive, WCAG-AA tuned, and `prefers-reduced-motion` respected. Design tokens live in `tailwind.config.js` + `src/index.css` (CSS variables drive both themes).

Built with **React 18 + Vite + Tailwind**. All state lives in React and is mirrored to `localStorage`. Every model call goes through a single swappable `callModel()` helper.

---

## Quick start

```bash
npm install
npm run dev          # open the printed URL (usually http://localhost:5173)
```

That's it — **AI answers work out of the box with no API key** (see *Answer engines* below). The dev server includes a built-in `/ai` and `/search` proxy, so there's no separate process to run.

> First cold start: Vite pre-bundles dependencies, so the very first page load can briefly flash blank — just refresh once.

---

## Answer engines (⚙️ Settings → Answer engine)

Pick how replies are generated — all routed through the single `callModel()` helper:

| Engine | Needs | What it does |
| --- | --- | --- |
| **Free AI** (default) | nothing | Keyless model (Pollinations) proxied server-side through the dev server's built-in `/ai` endpoint — no key, no CORS, no separate process. Multiple upstream models are tried so a busy one doesn't fail the request. Can occasionally be slow/busy. |
| **Gemini** | a Google AI Studio key (`AIza…`) | Real Gemini via the Generative Language API, called direct from the browser, with **live token streaming** and **image (vision)** support. Editable model + base URL. |
| **Custom** | any OpenAI-compatible key + base URL | OpenAI, OpenRouter, Groq, Together, **Sarvam**, a local server, etc. Routed server-side through `/ai` so browser CORS never blocks it. Sends both `Bearer` and `api-subscription-key` auth so most providers just work. |

**Silent, sticky fallback** — if a key-based engine fails (e.g. an invalid key), that reply quietly comes from **Free AI** and **your engine setting is kept** — no error popups. A failed key is remembered for the session so it isn't retried on every message.

**Intent-aware routing** ([src/lib/knowledge.js](src/lib/knowledge.js), [src/lib/callModel.js](src/lib/callModel.js)):

- **Math** (incl. `15% of 240`, `2^10 + 5`) → computed locally, exact.
- **Time** → current time in any IANA timezone, computed locally.
- **Live weather** → real-time conditions via open-meteo (no key).
- **Current events** → **live web search** (DuckDuckGo via the `/search` proxy) with linked results.
- **Factual lookups** ("what is / who is / capital of / when was…") → **live Wikipedia**, with the specific fact extracted and a **Source:** link. Follow-ups resolve *it* to the last cited subject.
- **Attachments** → when a document or image is attached, the answer comes **from that content**.
- **Explain / compare / write / reason** → the model; a grounded Wikipedia explanation is the offline fallback. Never generic "here's how I'd approach this" filler.

---

## Features

### 💬 Chat core
Streaming replies, markdown + syntax-highlighted code with copy buttons, **runnable JavaScript** code blocks, per-message actions (copy / regenerate / branch / pin / read-aloud), context-aware follow-up chips, a **scroll-to-bottom** button, and slash commands: `/summary`, `/notes`, `/search`, `/branch`.

### ➕ The composer "+" menu
The attach button opens a menu with three actions:

| Action | What it does |
| --- | --- |
| **📎 Add photos & files** | Attach an **image** (read by Gemini vision) or a **document** — PDF, text, code, CSV, JSON, Markdown, HTML, logs, and more. Document text is extracted **in-browser** (PDFs via lazy-loaded `pdf.js`) and fed to **every** engine as text, so docs work even with no API key. |
| **🖼️ Create image** | **Keyless image generation** (Pollinations) from your prompt, rendered inline in the chat. |
| **🌐 Web search** | Forces a **live web search** for your messages. The mode **stays active** (pill above the box) until you dismiss it with ✕. |
| **🧭 Deep research** | Gathers sources from **several search angles**, dedupes them, then has the active model synthesize a **structured, cited report** (sections, findings, a balanced view, inline `[n]` citations + a Sources list). Grounded only in what it found. |

Limits: images ≤ 8 MB, documents ≤ 20 MB (~16k chars / 50 PDF pages extracted). Scanned/image-only PDFs have no text layer and can't be read.

### 🗂️ Topic Index (right rail) — the centerpiece
A live, auto-generated table of contents for the conversation.
- **Auto-segmentation** — after each exchange a lightweight agent assigns it to an existing topic or creates a new one (async, never blocks the chat; parses model JSON defensively).
- **Jump-to + breadcrumb** — click a topic to smooth-scroll to it; the header shows the topic you're currently in as you scroll.
- **Color-coded transcript** — each topic has a seagreen-family accent; messages carry a matching left bar.
- **Rename** — double-click a topic (or ⋯ menu).
- **Delete** — one-click 🗑️ button; messages fall back to **Unsorted** (never orphaned) with an **Undo** toast.
- **Reorder** — **drag a topic up or down** to arrange the index; **🔀 Shuffle** randomizes; **↺ Reset** returns to conversation order. Your custom order is saved per chat.
- **Locked** — any topic you rename/delete is marked `locked`, so the segmenter never overwrites or resurrects it.

### 🕰️ AI Memory Timeline
All chats grouped by month (newest first), with topic trees and per-month count badges. Click any node to open the chat / jump to the topic.

### 🔎 Smart Search
Keyword/substring search across every chat — titles, topics, and message bodies — grouped by chat with highlighted snippets and jump links. Also reachable via `/search <query>`.

### 📝 AI Notes + 📚 Knowledge Base
One-click notes generated from the **whole chat** (or a single topic): **Summary · Key Points · Action Items · Exam Notes · Flashcards · FAQ**. Copy or **Save to Knowledge Base**. The KB is searchable; **flashcards** open a **study mode** (flip / next / prev / shuffle). When no model is available, notes are built *extractively from the real transcript* — never a generic template.

### 🎙️ Voice assistant
Built on the browser Web Speech API — no key, on-device.
- **Mic** in the composer for speech-to-text (hands-free auto-send optional).
- **Hands-free voice mode** — Luna listens, answers, reads the reply aloud, then listens again.
- **Read-aloud** per answer; voice, rate, and toggles in ⚙️ Settings → **Voice assistant**. Degrades gracefully where unsupported.

### ✅ Honest accuracy chips
An **evidence-based band** (High / Medium / Low) on each answer — never a fabricated percentage:
- Grounded in a cited source, or an exact/live computation (math, weather, time) → **High** (the source link is shown inline).
- A sound but uncited model answer → **Medium**.
- The answer flags its own doubt, or touches volatile facts without grounding → **Low**.

The chip's tooltip explains *why*. Logic in [src/lib/confidence.js](src/lib/confidence.js).

### ☁️ Sync, export & import
Chats **sync in real time across open tabs/windows** (BroadcastChannel). **Export** a JSON backup and **Import** it on another device (⚙️ Settings → Your data).

---

## Build

```bash
npm run build && npm run preview
```

The built-in `/ai` and `/search` proxies are served in both `dev` and `preview`. For a public deployment you'd put them behind your own backend (the upstream free model and DuckDuckGo HTML only allow server-side calls).

## Feature map → where it lives

| Feature | File |
| --- | --- |
| Swappable model call, routing, Free AI / Gemini / Custom, fallback, grounding | `src/lib/callModel.js` |
| Built-in `/ai` proxy + `/search` web-search proxy (Vite middleware) | `vite.config.js` |
| Document & image reader (PDF via pdf.js, text/code/CSV) | `src/lib/docs.js` |
| Knowledge grounding (intent, Wikipedia, weather, web search, follow-ups) | `src/lib/knowledge.js` |
| Central store, persistence, streaming, segmentation, image gen, sync | `src/state/store.jsx` |
| System prompt / persona | `src/lib/persona.js` |
| Composer ("+" menu, attachments, modes, voice) | `src/components/chat/Composer.jsx` |
| Chat transcript, streaming, markdown + images, message actions | `src/components/chat/*` |
| **Topic Index** (segment, jump, breadcrumb, color, rename/delete/reorder/shuffle, locked, undo) | `src/components/topics/TopicRail.jsx` + store |
| Memory Timeline · Smart Search | `src/components/timeline/Timeline.jsx` · `src/components/search/SearchView.jsx` |
| AI Notes · Knowledge Base (flashcard study mode) | `src/components/notes/*` · `src/components/kb/KnowledgeBase.jsx` |
| Voice assistant (STT + TTS) | `src/lib/voice.js`, composer + `Settings.jsx` |
| Accuracy chips | `src/lib/confidence.js` + `src/components/chat/ConfidenceChip.jsx` |

> An optional **MCP tool server** (`mcp-server/`, built on the official `@modelcontextprotocol/sdk`) and a browser MCP client (`src/lib/mcpClient.js`) are included in the repo, but the in-app tool panel is currently not surfaced — the app does math, time, facts, weather, and web search natively. Run it with `npm run mcp` if you want to extend it.

## ~3-minute demo script

1. **Ask anything** — "explain the difference between SQL and NoSQL" → a structured, on-topic answer streams in. Watch a topic appear in the right rail.
2. **Grounded facts** — "who painted the Mona Lisa?" → cited answer with a **High accuracy** chip + source link. Then "how tall is the Eiffel Tower?" and a follow-up "when was it built?" (context carries).
3. **Documents** — 📎 → **Add photos & files**, drop in a PDF or `.txt`, and ask "summarize this and pull the key numbers."
4. **Create image** — 📎 → **Create image**, "a calm seagreen lagoon at sunrise" → an image renders inline.
5. **Web search** — 📎 → **Web search**, "latest Mars rover news" → live results with links; the mode stays on until you dismiss it.
6. **Deep research** — 📎 → **Deep research**, "benefits and risks of nuclear energy" → a structured, cited report synthesized from multiple live sources.
7. **Topic Index** — new subject → a second color-coded topic. **Drag** to reorder, **🔀 shuffle**, double-click to **rename**, 🗑️ **delete** → Unsorted + **Undo**.
8. **Notes → KB** — click **Notes**, generate **Flashcards** from the whole chat, **Save to KB**, open the deck in **study mode**.
9. **Voice** — tap the 🎙️ mic and speak; try hands-free voice mode.

## Tech notes

- No backend required for the app itself; the Vite dev/preview server hosts tiny `/ai` and `/search` proxies so the free model and web search work without CORS/anti-bot issues.
- State is mirrored to `localStorage` under the `synapse.` prefix (kept for back-compat) and synced across tabs via BroadcastChannel.
- Document text is extracted client-side and sent to whichever engine is active as plain text, so attachments work without a key.
- Topic segmentation runs **async after each reply** and never blocks the chat; user edits set `locked: true` so they're never overwritten.
- Accuracy bands and grounding are honest signposting — when there's no reliable source, Luna says so instead of inventing an answer.
