// Tiny localStorage wrapper with JSON + graceful fallback.
const PREFIX = 'synapse.'

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* quota or private mode — fail silent, app keeps working in memory */
  }
}

// Relative time formatting for chat rows / timeline.
export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  if (s < 90) return '1 min ago'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const monthKey = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
