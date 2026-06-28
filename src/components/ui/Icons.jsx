// Minimal inline icon set (stroke-based, currentColor) — no icon dependency.
const I = ({ children, size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
)
export const Plus = (p) => <I {...p}><path d="M12 5v14M5 12h14" /></I>
export const Sun = (p) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>
export const Moon = (p) => <I {...p}><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" /></I>
export const Copy = (p) => <I {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></I>
export const Check = (p) => <I {...p}><path d="M20 6L9 17l-5-5" /></I>
export const Refresh = (p) => <I {...p}><path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5" /></I>
export const Branch = (p) => <I {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 8.5v7M8.5 6.5h4A3 3 0 0115.5 9" /></I>
export const Pin = (p) => <I {...p}><path d="M9 4h6l-1 7 3 3v1H7v-1l3-3-1-7zM12 15v5" /></I>
export const Trash = (p) => <I {...p}><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" /></I>
export const Dots = (p) => <I {...p}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></I>
export const Send = (p) => <I {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></I>
export const Stop = (p) => <I {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></I>
export const Search = (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></I>
export const Clock = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>
export const Book = (p) => <I {...p}><path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2V5z" /><path d="M8 3v18" /></I>
export const FileText = (p) => <I {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h8" /><path d="M8 9h2" /></I>
export const Image = (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></I>
export const Globe = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 010 18a14 14 0 010-18z" /></I>
export const Compass = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M16.2 7.8l-2.9 6.4-6.4 2.9 2.9-6.4 6.4-2.9z" /></I>
export const Chat = (p) => <I {...p}><path d="M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z" /></I>
export const Gear = (p) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7.7 1.6 1.6 0 01-3.2 0 1.6 1.6 0 00-2.7-.7l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15a1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1A1.6 1.6 0 004.6 9a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z" /></I>
export const Menu = (p) => <I {...p}><path d="M4 6h16M4 12h16M4 18h16" /></I>
export const X = (p) => <I {...p}><path d="M18 6L6 18M6 6l12 12" /></I>
export const Cards = (p) => <I {...p}><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M7 5V3h14v14h-2" /></I>
export const ChevronRight = (p) => <I {...p}><path d="M9 6l6 6-6 6" /></I>
export const Edit = (p) => <I {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></I>
export const Save = (p) => <I {...p}><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h7M8 21v-7h8v7" /></I>
export const Shuffle = (p) => <I {...p}><path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" /></I>
export const Mic = (p) => <I {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8" /></I>
export const Volume = (p) => <I {...p}><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" /></I>
export const VolumeX = (p) => <I {...p}><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M17 9l5 6M22 9l-5 6" /></I>
export const ArrowDown = (p) => <I {...p}><path d="M12 5v14M5 12l7 7 7-7" /></I>
export const Paperclip = (p) => <I {...p}><path d="M21.4 11.05l-8.49 8.49a5 5 0 01-7.07-7.07l8.49-8.49a3.5 3.5 0 014.95 4.95l-8.49 8.49a2 2 0 01-2.83-2.83l7.78-7.78" /></I>
export const Waveform = (p) => <I {...p}><path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 8v8" /></I>
export const Download = (p) => <I {...p}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></I>
export const Upload = (p) => <I {...p}><path d="M12 21V9M7 14l5-5 5 5M5 3h14" /></I>
export const Play = (p) => <I {...p}><path d="M6 4l14 8-14 8z" /></I>
