import { isRuoeTaskCode } from '@/utils/exam-task-meta.ts'

/**
 * Removes standard R&UoE prefixes (e.g. "R&UoE ") from task names so UI labels stay concise.
 */
export const stripRuoePrefix = (name?: string | null): string => {
  if (!name) return ''
  const cleaned = name.replace(/^(?:R&UoE\s+)/i, '').trimStart()
  return cleaned.length > 0 ? cleaned : name
}

export interface TaskDisplayNameInput {
  taskCode?: string | null
  name?: string | null
}

/**
 * Returns a human-readable task name, collapsing RUoE prefixes when appropriate.
 */
export const getTaskDisplayName = (task: TaskDisplayNameInput | null): string => {
  if (!task) return ''
  if (isRuoeTaskCode(task.taskCode ?? undefined)) {
    return stripRuoePrefix(task.name)
  }
  return task.name ?? ''
}
