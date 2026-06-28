import { useStore } from '../state/store.jsx'
import { Chat, Clock, Search, Book, Sun, Moon, Gear, Menu } from './ui/Icons.jsx'
import { hasLiveModel, modelLabel } from '../lib/callModel.js'

const VIEWS = [
  { id: 'chat', label: 'Chat', Icon: Chat },
  { id: 'timeline', label: 'Timeline', Icon: Clock },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'kb', label: 'Knowledge Base', Icon: Book },
]

export default function TopNav({ onOpenLeft }) {
  const { state, actions } = useStore()
  return (
    <header className="h-14 shrink-0 border-b border-line glass flex items-center gap-2 px-3 sm:px-4 z-20">
      <button className="lg:hidden p-2 -ml-1 text-ink2" onClick={onOpenLeft}><Menu /></button>

      <div className="flex items-center gap-2.5 mr-1 select-none">
        <span className="w-8 h-8 rounded-full orb-gradient shadow-lagoon-sm ring-1 ring-white/50" aria-hidden="true" />
        <span className="font-display font-bold text-lg tracking-tight hidden sm:block gradient-text">Luna</span>
      </div>

      <nav className="flex items-center gap-1 ml-1 sm:ml-3 overflow-x-auto">
        {VIEWS.map(({ id, label, Icon }) => {
          const active = state.view === id
          return (
            <button key={id} onClick={() => actions.setView(id)}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-sm font-medium whitespace-nowrap transition
                ${active ? 'bg-deep text-white shadow-lagoon-sm' : 'text-ink2 hover:text-accentink hover:bg-tint'}`}>
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <button onClick={actions.openSettings} title="Answer engine — click to change"
          className={`hidden md:flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ring-1 transition hover:bg-tint ${hasLiveModel() ? 'text-emerald-600 ring-emerald-200 dark:ring-emerald-500/30' : 'text-ink2 ring-line'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${hasLiveModel() ? 'bg-emerald-500' : 'bg-sea'}`} />
          {modelLabel()}
        </button>
        <button onClick={actions.openSettings} className="p-2 text-ink2 hover:text-accentink rounded-lg hover:bg-tint" title="Settings"><Gear /></button>
        <button onClick={actions.toggleTheme} className="p-2 text-ink2 hover:text-accentink rounded-lg hover:bg-tint" title="Toggle theme">
          {state.theme === 'dark' ? <Sun /> : <Moon />}
        </button>
      </div>
    </header>
  )
}
