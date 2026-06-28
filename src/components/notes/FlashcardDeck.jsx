import { useEffect, useMemo, useState } from 'react'
import { Shuffle, ChevronRight } from '../ui/Icons.jsx'

// Flippable flashcards with a simple study mode: flip, next/prev, shuffle.
export default function FlashcardDeck({ cards }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i))
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)

  useEffect(() => { setOrder(cards.map((_, i) => i)); setPos(0); setFlipped(false) }, [cards])

  const card = cards[order[pos]]
  const go = (d) => { setFlipped(false); setPos((p) => (p + d + cards.length) % cards.length) }
  const shuffle = () => {
    const a = [...order]
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(((i + 1) * 0.6180339887) % (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
    setOrder(a); setPos(0); setFlipped(false)
  }

  // keyboard study controls
  useEffect(() => {
    const h = (e) => {
      if (e.key === ' ') { e.preventDefault(); setFlipped((f) => !f) }
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (!cards.length) return <p className="text-ink2 text-sm">No cards.</p>

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2 text-xs text-ink2">
        <span>Card {pos + 1} / {cards.length}</span>
        <button onClick={shuffle} className="flex items-center gap-1 hover:text-accentink"><Shuffle size={13} /> Shuffle</button>
      </div>

      <button onClick={() => setFlipped((f) => !f)}
        className="w-full min-h-[160px] rounded-2xl ring-1 ring-line bg-surface px-5 py-6 text-center grid place-items-center transition hover:ring-sea/45 shadow-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink2 mb-2">{flipped ? 'Answer' : 'Question'}</div>
          <div className="text-base font-medium leading-relaxed">{flipped ? card.a : card.q}</div>
          <div className="text-[11px] text-ink2 mt-3">Click or press Space to flip</div>
        </div>
      </button>

      <div className="flex items-center justify-between mt-3">
        <button onClick={() => go(-1)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg ring-1 ring-line hover:bg-tint">
          <ChevronRight size={15} className="rotate-180" /> Prev
        </button>
        <button onClick={() => go(1)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg ring-1 ring-line hover:bg-tint">
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
