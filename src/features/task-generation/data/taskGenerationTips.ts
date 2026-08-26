import { type TipItem } from '../components/TipsCarousel'

export interface WritingTipContext {
  taskCode?: string | null
  examCode?: string | null
  levelCode?: string | null
}

const DEFAULT_TIPS: TipItem[] = [
  { icon: '📚', text: 'Read the instructions once for purpose and once for details.' },
  { icon: '⏰', text: 'Reserve a short final check before time runs out.' },
  { icon: '🎯', text: 'Base each answer on evidence in the task or text.' },
  { icon: '✅', text: 'Check that every required part has an answer.' },
]

const WRITING_DEFAULTS: TipItem[] = [
  { icon: '🧭', text: 'Identify the reader, purpose, and register before writing.' },
  { icon: '📝', text: 'Make a short plan that covers every content point.' },
  { icon: '🔗', text: 'Connect ideas clearly instead of listing them.' },
  { icon: '🔍', text: 'Review meaning first, then grammar, spelling, and length.' },
]

const LANGUAGE_DEFAULTS: TipItem[] = [
  { icon: '🧠', text: 'Read the whole text before focusing on individual gaps.' },
  { icon: '🧩', text: 'Use grammar and meaning on both sides of each gap.' },
  { icon: '💬', text: 'Check collocations and fixed expressions in context.' },
  { icon: '✅', text: 'Read the completed sentence again before confirming.' },
]

const WRITING_BY_KIND: Record<string, TipItem[]> = {
  ESSAY: [
    { icon: '🧭', text: 'State a clear position that answers the exact question.' },
    { icon: '⚖️', text: 'Develop each main point with a reason or example.' },
    { icon: '🔗', text: 'Use transitions to show contrast, cause, and consequence.' },
    { icon: '✅', text: 'Make the conclusion follow from the argument.' },
  ],
  EMAIL: [
    { icon: '✉️', text: 'Match the opening and closing to the relationship.' },
    { icon: '🧾', text: 'Respond directly to every question or request.' },
    { icon: '🎭', text: 'Keep the same level of formality throughout.' },
    { icon: '🔍', text: 'Check names, dates, and practical details.' },
  ],
  LETTER: [
    { icon: '🎯', text: 'Explain the reason for writing in the opening paragraph.' },
    { icon: '📌', text: 'Group related information into clear paragraphs.' },
    { icon: '🎭', text: 'Choose polite language suited to the recipient.' },
    { icon: '📬', text: 'Close with a specific request or next step.' },
  ],
  REPORT: [
    { icon: '🔖', text: 'Use short headings that describe each section.' },
    { icon: '📊', text: 'Separate observations from interpretations.' },
    { icon: '📌', text: 'Support findings with concrete evidence.' },
    { icon: '➡️', text: 'Finish with feasible recommendations.' },
  ],
  PROPOSAL: [
    { icon: '🎯', text: 'Define the objective and intended benefit first.' },
    { icon: '🧩', text: 'Organise suggestions under informative headings.' },
    { icon: '💡', text: 'Explain why each suggestion is practical.' },
    { icon: '🏁', text: 'End by identifying the strongest option.' },
  ],
  DATA_SUMMARY: [
    { icon: '🔭', text: 'Give an overview of the main pattern before details.' },
    { icon: '📊', text: 'Group related figures instead of listing every value.' },
    { icon: '↔️', text: 'Use selective comparisons to support the overview.' },
    { icon: '🚫', text: 'Describe the data without adding personal opinions.' },
  ],
}

function normalize(value?: string | null): string {
  return value?.trim().toUpperCase() ?? ''
}

function writingKind(taskCode?: string | null): keyof typeof WRITING_BY_KIND | null {
  const code = normalize(taskCode)
  if (code.includes('DATA') || code.includes('VISUAL')) return 'DATA_SUMMARY'
  for (const kind of ['PROPOSAL', 'REPORT', 'EMAIL', 'LETTER', 'ESSAY'] as const) {
    if (code.includes(kind)) return kind
  }
  return null
}

export const getWritingTips = ({ taskCode }: WritingTipContext): TipItem[] => {
  const kind = writingKind(taskCode)
  return kind ? WRITING_BY_KIND[kind] : WRITING_DEFAULTS
}

export const getRuoeTips = (_taskCode?: string | null): TipItem[] => LANGUAGE_DEFAULTS

export const getDefaultTips = (): TipItem[] => DEFAULT_TIPS
export const getDefaultWritingTips = (): TipItem[] => WRITING_DEFAULTS
export const getDefaultRuoeTips = (): TipItem[] => LANGUAGE_DEFAULTS
