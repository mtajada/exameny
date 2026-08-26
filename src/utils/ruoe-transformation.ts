import { getTransformationTemplate } from '@/config/ruoe-transformations'

interface TransformationQuestionLike {
  question_text?: string | null
  original_sentence?: string | null
  transformation_sentence?: string | null
}

export interface TransformationContext {
  keyWord: string
  originalSentence: string
  transformationSentence: string
}

const normalizeText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export const buildTransformationContext = (
  question: TransformationQuestionLike | null | undefined,
): TransformationContext => {
  const rawKeyWord = normalizeText(question?.question_text) ?? 'KEY'
  const keyWord = rawKeyWord.toUpperCase()

  const originalSentence = normalizeText(question?.original_sentence)
  const transformationSentence = normalizeText(question?.transformation_sentence)

  if (originalSentence && transformationSentence) {
    return {
      keyWord,
      originalSentence,
      transformationSentence,
    }
  }

  const template = getTransformationTemplate(keyWord)
  return {
    keyWord,
    originalSentence: originalSentence ?? template.original,
    transformationSentence: transformationSentence ?? template.transformation,
  }
}
