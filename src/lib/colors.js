// Low-saturation accent palette for topics. Each entry carries the values needed
// for a colored left-border on messages, a soft dot, and a soft background chip.
// Seagreen-harmonious accents — distinct but all within the calm lagoon family.
export const TOPIC_COLORS = [
  { name: 'sea', dot: '#45B5A6', border: '#45B5A6', soft: 'rgba(69,181,166,0.10)' },
  { name: 'deep', dot: '#218074', border: '#218074', soft: 'rgba(33,128,116,0.10)' },
  { name: 'aqua', dot: '#2BB6C4', border: '#2BB6C4', soft: 'rgba(43,182,196,0.10)' },
  { name: 'sage', dot: '#6FB58A', border: '#6FB58A', soft: 'rgba(111,181,138,0.10)' },
  { name: 'mint', dot: '#3FC9A5', border: '#3FC9A5', soft: 'rgba(63,201,165,0.10)' },
  { name: 'lagoon', dot: '#3C9DB5', border: '#3C9DB5', soft: 'rgba(60,157,181,0.10)' },
  { name: 'eucalyptus', dot: '#5BA89B', border: '#5BA89B', soft: 'rgba(91,168,155,0.10)' },
  { name: 'cyan', dot: '#3AAFC2', border: '#3AAFC2', soft: 'rgba(58,175,194,0.10)' },
]

export const UNSORTED_COLOR = { name: 'slate', dot: '#9FB8B2', border: '#9FB8B2', soft: 'rgba(159,184,178,0.12)' }

export const colorByName = (name) =>
  TOPIC_COLORS.find((c) => c.name === name) || UNSORTED_COLOR

// Pick the next least-used color so a chat's topics stay visually distinct.
export function nextColor(existingTopics) {
  const counts = Object.fromEntries(TOPIC_COLORS.map((c) => [c.name, 0]))
  existingTopics.forEach((t) => { if (counts[t.color] != null) counts[t.color]++ })
  let best = TOPIC_COLORS[0]
  let min = Infinity
  for (const c of TOPIC_COLORS) {
    if (counts[c.name] < min) { min = counts[c.name]; best = c }
  }
  return best.name
}
