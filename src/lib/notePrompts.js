// Format-specific prompts for the one-click notes feature.
export const NOTE_TYPES = {
  summary: {
    label: 'Summary',
    icon: '📝',
    system: 'You are a precise note-taker. Write a concise summary of the conversation in 3-5 sentences. Output markdown only.',
  },
  keypoints: {
    label: 'Key Points',
    icon: '🔑',
    system: 'You are a precise note-taker. Extract the key points as a markdown bullet list (5-8 bullets). Output markdown only.',
  },
  actions: {
    label: 'Action Items',
    icon: '✅',
    system: 'You extract action items. Output a markdown checklist of concrete next actions using "- [ ]" syntax. Output markdown only.',
  },
  exam: {
    label: 'Exam Notes',
    icon: '🎓',
    system: 'You are a study coach. Produce exam-style study notes: definitions, must-remember facts, and 2 likely questions. Output markdown only.',
  },
  flashcards: {
    label: 'Flashcards',
    icon: '🃏',
    system: 'You generate study flashcards. Output ONLY a JSON array of {"q","a"} objects (6-10 cards). No prose, no code fences.',
  },
  faq: {
    label: 'FAQ',
    icon: '❓',
    system: 'You write FAQs. Produce a markdown FAQ of 4-6 question/answer pairs, each question bold. Output markdown only.',
  },
}

// Flatten a transcript into a single string fed to the note model.
export function transcriptText(messages) {
  return messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')
}
