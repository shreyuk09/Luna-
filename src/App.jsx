import { useState } from 'react'
import { useStore } from './state/store.jsx'
import TopNav from './components/TopNav.jsx'
import LeftRail from './components/LeftRail.jsx'
import ChatView from './components/chat/ChatView.jsx'
import TopicRail from './components/topics/TopicRail.jsx'
import Timeline from './components/timeline/Timeline.jsx'
import SearchView from './components/search/SearchView.jsx'
import KnowledgeBase from './components/kb/KnowledgeBase.jsx'
import NotesPanel from './components/notes/NotesPanel.jsx'
import Toasts from './components/ui/Toasts.jsx'
import Settings from './components/ui/Settings.jsx'
import { X } from './components/ui/Icons.jsx'

export default function App() {
  const { state } = useStore()
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  return (
    <div className="h-full flex flex-col">
      <TopNav onOpenLeft={() => setLeftOpen(true)} />

      <div className="flex-1 min-h-0 flex">
        {/* Left rail — fixed on desktop, drawer on mobile */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-line">
          <LeftRail />
        </aside>
        <Drawer open={leftOpen} side="left" onClose={() => setLeftOpen(false)}>
          <LeftRail onNavigate={() => setLeftOpen(false)} />
        </Drawer>

        {/* Center */}
        <main className="flex-1 min-w-0 flex flex-col">
          {state.view === 'chat' && <ChatView onOpenTopics={() => setRightOpen(true)} />}
          {state.view === 'timeline' && <Timeline />}
          {state.view === 'search' && <SearchView />}
          {state.view === 'kb' && <KnowledgeBase />}
        </main>

        {/* Right rail — only meaningful in chat view */}
        {state.view === 'chat' && (
          <>
            <aside className="hidden xl:block w-80 shrink-0 border-l border-line">
              <TopicRail />
            </aside>
            <Drawer open={rightOpen} side="right" onClose={() => setRightOpen(false)}>
              <TopicRail onNavigate={() => setRightOpen(false)} />
            </Drawer>
          </>
        )}
      </div>

      <NotesPanel />
      <Settings />
      <Toasts />
    </div>
  )
}

function Drawer({ open, side, onClose, children }) {
  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'} ${side === 'left' ? 'lg:hidden' : 'xl:hidden'}`}>
      <div className={`absolute inset-0 bg-[rgba(10,31,28,0.45)] backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} h-full w-72 max-w-[85%] bg-surface shadow-xl transition-transform duration-200
        ${open ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'}`}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 p-1.5 text-ink2 hover:text-accentink"><X /></button>
        {children}
      </div>
    </div>
  )
}
