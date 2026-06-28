import { useState } from 'react'
import { ChevronRight, Check, X } from '../ui/Icons.jsx'

const ICON = { calculator: '🧮', current_datetime: '🕒', web_search: '🔎' }

// A single MCP tool invocation card, shown inline in the assistant turn.
export default function ToolCall({ call }) {
  const [open, setOpen] = useState(false)
  const running = call.status === 'running'
  const error = call.status === 'error'

  return (
    <div className="rounded-xl ring-1 ring-line bg-tint overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className="text-base">{ICON[call.name] || '🛠️'}</span>
        <span className="text-sm font-medium">{call.name}</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-tint text-accentink">MCP</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs">
          {running && <span className="flex items-center gap-1 text-amber-500"><Spinner /> running</span>}
          {call.status === 'done' && <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check size={13} /> done</span>}
          {error && <span className="flex items-center gap-1 text-rose-500"><X size={13} /> error</span>}
          <ChevronRight size={14} className={`text-ink2 transition-transform ${open ? 'rotate-90' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-2 text-xs animate-fade-in">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink2 mb-0.5">Input</div>
            <pre className="bg-surface rounded-lg p-2 overflow-x-auto font-mono text-[11px] ring-1 ring-line">{JSON.stringify(call.input, null, 2)}</pre>
          </div>
          {call.result && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink2 mb-0.5">Result</div>
              <pre className="bg-surface rounded-lg p-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] ring-1 ring-line">{call.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const Spinner = () => (
  <span className="inline-block w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
)
