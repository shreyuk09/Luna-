import { useState } from 'react'
import { BAND_META } from '../../lib/confidence.js'

// Honest accuracy band + the citation that justifies it. No fabricated %.
export default function ConfidenceChip({ confidence }) {
  const [open, setOpen] = useState(false)
  if (!confidence) return null
  const meta = BAND_META[confidence.band]
  const src = confidence.grounded && confidence.sources?.[0]

  return (
    <span className="relative inline-flex items-center gap-1.5 flex-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${meta.cls} cursor-help`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" /> {meta.label}
      </span>

      {/* inline source pill — the evidence behind the band */}
      {src && (
        <a href={src.url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-sea/40 text-accentink bg-tint hover:bg-sea/15 transition max-w-[16rem] truncate"
          onClick={(e) => e.stopPropagation()}>
          🔗 {src.title}
        </a>
      )}

      {open && (
        <span className="absolute bottom-full left-0 mb-2 z-30 w-64 rounded-xl bg-[#0f2c28] text-[#dff3ee] text-xs leading-relaxed px-3 py-2 shadow-lagoon animate-fade-in">
          <span className="block font-semibold mb-1">Why “{meta.label}”?</span>
          {confidence.reason}
          {src && (
            <span className="block mt-1.5 pt-1.5 border-t border-white/15">
              Source: <a href={src.url} target="_blank" rel="noreferrer" className="underline text-signature">{src.title}</a>
            </span>
          )}
          <span className="block mt-1.5 text-[#7fb8ad]">An evidence-based band, not a calibrated percentage.</span>
        </span>
      )}
    </span>
  )
}
