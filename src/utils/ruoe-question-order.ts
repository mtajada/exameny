import { RuoEQuestion } from '@/types/ruoe'

interface QuestionLike {
  id: number
  order: number
}

interface BuildDisplayOrderResult<T extends QuestionLike> {
  ordered: Array<T & { displayOrder: number }>
  lookup: Record<number, number>
}

/**
 * Returns questions sorted by their persisted order while attaching a sequential
 * display index starting at 1. We keep the original `order` for evaluation,
 * placeholders and Supabase relationships, but expose a clean counter for UI.
 */
export function buildDisplayOrder<T extends QuestionLike>(questions: T[]): BuildDisplayOrderResult<T> {
  const sorted = [...questions].sort((a, b) => a.order - b.order)
  const lookup: Record<number, number> = {}

  const ordered = sorted.map((question, index) => {
    const displayOrder = index + 1
    lookup[question.id] = displayOrder
    return {
      ...question,
      displayOrder,
    }
  })

  return { ordered, lookup }
}

/**
 * Convenience helper for components that already have an `ExerciseData` instance.
 * Falls back to computing from array index if the map is missing (defensive).
 */
export function getDisplayOrderForQuestionId(
  questionId: number,
  questionMap: Record<number, number> | undefined,
  fallbackIndex: number,
): number {
  if (questionMap && questionMap[questionId]) {
    return questionMap[questionId]
  }
  return fallbackIndex + 1
}

/**
 * Ensures legacy code that clones questions keeps the display order metadata.
 */
export function cloneQuestionWithDisplayOrder(question: RuoEQuestion): RuoEQuestion {
  return { ...question, displayOrder: question.displayOrder }
}
