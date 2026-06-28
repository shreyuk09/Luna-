import { useMemo } from 'react'
import { useStore } from '../../state/store.jsx'
import { monthKey, timeAgo } from '../../lib/storage.js'
import { colorByName } from '../../lib/colors.js'
import { Chat, ChevronRight } from '../ui/Icons.jsx'

export default function Timeline() {
  const { state, actions } = useStore()

  // group chats by creation month, newest first
  const months = useMemo(() => {
    const map = new Map()
    ;[...state.chats]
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach((c) => {
        const key = monthKey(c.createdAt)
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(c)
      })
    return [...map.entries()]
  }, [state.chats])

  const openChat = (chatId) => { actions.selectChat(chatId); actions.setView('chat') }
  const openTopic = (chat, topic) => {
    const order = new Map(chat.messages.map((m, i) => [m.id, i]))
    const firstId = topic.messageIds.map((id) => ({ id, i: order.get(id) ?? Infinity })).sort((a, b) => a.i - b.i)[0]?.id
    if (firstId) actions.jumpTo(chat.id, firstId)
    else openChat(chat.id)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold flex items-center gap-2">🕰️ Memory Timeline</h1>
          <p className="text-ink2 mt-1">Every chat and topic, grouped by month.</p>
        </div>

        {months.length === 0 && <p className="text-ink2">No chats yet.</p>}

        <div className="space-y-8">
          {months.map(([month, chats]) => (
            <section key={month}>
              <div className="flex items-center gap-2 mb-3 sticky top-0 frost py-1 z-10">
                <h2 className="text-lg font-semibold">{month}</h2>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-tint text-ink2">
                  {chats.length} chat{chats.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="relative pl-4 border-l-2 border-line space-y-4">
                {chats.map((chat) => (
                  <div key={chat.id} className="relative">
                    <span className="absolute -left-[21px] top-2 w-3 h-3 rounded-full bg-deep ring-4 ring-surface" />
                    <button onClick={() => openChat(chat.id)}
                      className="group w-full text-left rounded-xl ring-1 ring-line hover:ring-sea/45 bg-surface px-3.5 py-2.5 transition">
                      <div className="flex items-center gap-2">
                        <Chat size={15} className="text-sea shrink-0" />
                        <span className="font-medium truncate flex-1">{chat.title}</span>
                        <span className="text-xs text-ink2">{timeAgo(chat.createdAt)}</span>
                      </div>
                    </button>

                    {chat.topics.length > 0 && (
                      <div className="mt-1.5 ml-5 space-y-0.5">
                        {chat.topics.map((t) => (
                          <button key={t.id} onClick={() => openTopic(chat, t)}
                            className="group w-full flex items-center gap-1.5 text-sm text-ink2 hover:text-accentink dark:hover:text-sea px-2 py-1 rounded-lg hover:bg-tint/60 transition">
                            <ChevronRight size={13} className="text-ink2/70 group-hover:text-sea" />
                            <span className="w-2 h-2 rounded-full" style={{ background: colorByName(t.color).dot }} />
                            <span className="truncate">{t.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
