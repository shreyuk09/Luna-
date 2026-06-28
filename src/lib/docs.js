// Turn a picked File into a Luna attachment the model can actually read.
//   • images  → { kind:'image', dataUrl }      (Gemini vision)
//   • PDFs    → { kind:'doc',  text }           (extracted client-side via pdf.js)
//   • text/code/csv/json/… → { kind:'doc', text }
// Doc text is fed to EVERY engine (Free AI, Gemini, Custom) as plain text, so it
// works without a key — see effectiveText() in callModel.js.

const MAX_IMAGE = 8 * 1024 * 1024   // 8 MB
const MAX_DOC = 20 * 1024 * 1024    // 20 MB raw file
const MAX_CHARS = 16000             // cap extracted text so context/localStorage stay sane
const MAX_PDF_PAGES = 50

// Text-readable by extension (covers files browsers report with an empty mime).
const TEXT_EXT = /\.(txt|text|md|markdown|mdx|csv|tsv|json|jsonl|ya?ml|toml|ini|env|xml|html?|svg|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|php|java|kt|kts|c|h|cpp|hpp|cc|cs|swift|m|mm|scala|sh|bash|zsh|ps1|sql|pl|lua|r|dart|vue|svelte|gradle|dockerfile|makefile|log|conf|properties|tex|rtf|srt|vtt)$/i
const isTextMime = (t) => /^text\//.test(t) || /(json|xml|javascript|ecmascript|csv|x-yaml|yaml|x-sh|x-www-form|markdown|graphql|sql)/i.test(t || '')

const readAsDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file)
})
const readAsText = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file)
})

function clamp(text) {
  const t = String(text || "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) + '\n\n…[document truncated]' : t
}

// Lazy-load pdf.js only when a PDF is actually picked (keeps startup light).
async function extractPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES)
  let out = ''
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    out += content.items.map((it) => it.str).join(' ') + '\n\n'
    if (out.length > MAX_CHARS) break
  }
  return clamp(out)
}

// Returns an attachment object, or throws Error(message) for the caller to toast.
export async function readAttachment(file) {
  const name = file.name || 'file'
  const mime = file.type || ''

  if (/^image\//.test(mime)) {
    if (file.size > MAX_IMAGE) throw new Error('Image too large (max 8 MB)')
    return { name, mimeType: mime, dataUrl: await readAsDataURL(file), kind: 'image' }
  }

  if (file.size > MAX_DOC) throw new Error('Document too large (max 20 MB)')

  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    const text = await extractPdf(file)
    if (!text) throw new Error('Couldn’t read text from this PDF (it may be scanned images).')
    return { name, mimeType: 'application/pdf', text, kind: 'doc' }
  }

  if (isTextMime(mime) || TEXT_EXT.test(name)) {
    const text = clamp(await readAsText(file))
    if (!text) throw new Error('That file appears to be empty.')
    return { name, mimeType: mime || 'text/plain', text, kind: 'doc' }
  }

  throw new Error('Unsupported file. Try an image, PDF, or a text/code/CSV/JSON file.')
}

// Human-friendly size for the chip.
export function prettySize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
