import { useStore } from '../../state/store.jsx'
import { X } from './Icons.jsx'

export default function Toasts() {
  const { state, actions } = useStore()
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {state.toasts.map((t) => (
        <div key={t.id}
          className="pointer-events-auto animate-fade-rise flex items-center gap-3 rounded-xl bg-[#12302B] text-[#E7F5F1] shadow-lg px-4 py-2.5 text-sm max-w-md">
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={() => { t.action.run(); actions.dismissToast(t.id) }}
              className="font-semibold text-signature underline underline-offset-2">
              {t.action.label}
            </button>
          )}
          <button onClick={() => actions.dismissToast(t.id)} className="opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
