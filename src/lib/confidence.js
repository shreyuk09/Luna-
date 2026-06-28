// Honest accuracy banding — NOT a fabricated percentage.
// Bands: high | medium | low, derived from real signals:
//   (a) grounded in a cited source (a link in the answer)  -> raises
//   (b) the answer flags its own uncertainty               -> lowers
//   (c) topic volatility (facts that change over time)      -> lowers
// Only the *speaker's* expressed doubt should lower accuracy — not neutral
// hedges like "approximately" that appear in normal encyclopedic prose.
const SPEAKER_DOUBT = /\b(i think|i'?m not sure|not entirely sure|as far as i know|i believe|i'?d guess|my best guess|couldn'?t find|i'?m not confident|rather not guess|can'?t be certain|not certain)\b/i
const DETERMINISTIC = /exact arithmetic|computed locally|live from open-meteo|live web search|live web/i
const VOLATILE = /\b(price|pricing|cost|latest|current|today|now|this year|stock|share price|news|weather|score|deadline|release date|exchange rate)\b/i

// Pull citations out of the answer text: markdown links + bare URLs.
export function extractSources(text = '') {
  const out = []
  const seen = new Set()
  const md = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let m
  while ((m = md.exec(text))) {
    const url = m[2].replace(/[.,]$/, '')
    if (!seen.has(url)) { seen.add(url); out.push({ title: m[1].replace(/\s*—\s*Wikipedia$/i, ''), url }) }
  }
  const bare = /(?:^|\s)(https?:\/\/[^\s)]+)/g
  while ((m = bare.exec(text))) {
    const url = m[1].replace(/[.,]$/, '')
    if (!seen.has(url)) { seen.add(url); out.push({ title: hostLabel(url), url }) }
  }
  return out
}

function hostLabel(url) {
  try {
    const u = new URL(url)
    if (u.pathname.includes('/wiki/')) return decodeURIComponent(u.pathname.split('/wiki/')[1].replace(/_/g, ' '))
    return u.hostname.replace(/^www\./, '')
  } catch { return 'source' }
}

export function deriveConfidence(text = '', { grounded, sources, deterministic: detFlag } = {}) {
  // Sources can be supplied (tool path) or detected from the answer text.
  const found = sources?.length ? sources : extractSources(text)
  const isGrounded = grounded ?? found.length > 0
  const reasons = []

  // Honest banding — High only when there's real evidence, not just because a
  // capable model wrote it. Most ungrounded model answers are Medium.
  let score = 1 // 0 low · 1 medium · 2 high
  const deterministic = detFlag || DETERMINISTIC.test(text)
  if (isGrounded) { score = 2; reasons.push('Grounded in a cited source you can verify.') }
  else if (deterministic) { score = 2; reasons.push('A deterministic, exactly-computed or live result.') }
  else reasons.push('No source was cited, so treat it as unverified.')

  if (SPEAKER_DOUBT.test(text)) { score -= 1; reasons.push('The answer flags its own uncertainty.') }

  const volatile = VOLATILE.test(text)
  if (volatile && !isGrounded) { score -= 1; reasons.push('Touches facts that change over time.') }

  const band = score >= 2 ? 'high' : score >= 1 ? 'medium' : 'low'
  return {
    band,
    grounded: isGrounded,
    sources: found,
    volatile,
    verify: band === 'low' || (volatile && !isGrounded),
    reason: reasons.join(' '),
  }
}

export const BAND_META = {
  high: { label: 'High accuracy', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/30' },
  medium: { label: 'Medium accuracy', cls: 'text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/30' },
  low: { label: 'Low accuracy', cls: 'text-rose-700 bg-rose-50 ring-rose-200 dark:text-rose-300 dark:bg-rose-500/10 dark:ring-rose-500/30' },
}
