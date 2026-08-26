import { getRuoELayoutKey, isReadingLayout, type RuoELayoutKey } from '@/config/ruoeFunctionMap'
import type { KeywordTransformationWindow, RuoEOption } from '@/types/ruoe'

const LETTER_BASED_LAYOUTS: ReadonlySet<RuoELayoutKey> = new Set([
  'ruoe-reading-mcq',
  'ruoe-gapped-text',
  'ruoe-multiple-matching',
  'ruoe-cross-text',
])

const MULTIPLE_MATCHING_LAYOUTS: ReadonlySet<RuoELayoutKey> = new Set(['ruoe-multiple-matching'])
const CROSS_TEXT_LAYOUTS: ReadonlySet<RuoELayoutKey> = new Set(['ruoe-cross-text'])
const GAPPED_TEXT_LAYOUTS: ReadonlySet<RuoELayoutKey> = new Set(['ruoe-gapped-text'])

const resolveLayout = (taskCode?: string): RuoELayoutKey | null => {
  if (!taskCode) return null
  try {
    return getRuoELayoutKey(taskCode)
  } catch {
    return null
  }
}

export const isLetterBased = (taskCode?: string): boolean => {
  const layout = resolveLayout(taskCode)
  if (!layout) return false
  if (LETTER_BASED_LAYOUTS.has(layout)) return true
  // Reading layouts map to letter answers even if not in the set above (covers future additions)
  return isReadingLayout(layout)
}

export const getDisplayLabel = (taskCode: string | undefined, option: RuoEOption): string => {
  const layout = resolveLayout(taskCode)
  if (!layout) return option.option_text ?? ''
  if (CROSS_TEXT_LAYOUTS.has(layout)) {
    return `Text ${option.option_letter ?? ''}`.trim()
  }
  if (MULTIPLE_MATCHING_LAYOUTS.has(layout)) {
    return `Section ${option.option_letter ?? ''}`.trim()
  }
  if (GAPPED_TEXT_LAYOUTS.has(layout)) {
    return option.option_text ?? ''
  }
  return option.option_text ?? ''
}

export const getAnswerValue = (taskCode: string | undefined, option: RuoEOption): string => {
  return isLetterBased(taskCode) ? option.option_letter ?? '' : option.option_text ?? ''
}

export const findOptionByAnswerValue = (
  taskCode: string | undefined,
  options: RuoEOption[],
  selectedAnswer: string | null,
): RuoEOption | undefined => {
  if (!selectedAnswer) return undefined
  const normalized = selectedAnswer.trim()
  const matchByValue = options.find((option) => getAnswerValue(taskCode, option) === normalized)
  if (matchByValue) return matchByValue

  // Legacy fallback: attempts created before mc-cloze fix stored only the letter.
  return options.find((option) => option.option_letter?.trim().toUpperCase() === normalized.toUpperCase())
}

const KEYWORD_TRANSFORMATION_WINDOWS: Record<string, KeywordTransformationWindow> = {
  B2_LANG_TRANSFORMATION: { level: 'B2', min: 2, max: 5 },
  C1_LANG_TRANSFORMATION: { level: 'C1', min: 3, max: 6 },
  C2_LANG_TRANSFORMATION: { level: 'C2', min: 3, max: 8 },
}

export const getKeywordTransformationWindow = (taskCode?: string): KeywordTransformationWindow | null => {
  if (!taskCode) return null
  const normalized = taskCode.trim().toUpperCase()
  return KEYWORD_TRANSFORMATION_WINDOWS[normalized] ?? null
}
