export type ClassFilterValue = number | 'all' | '' | undefined

export const normalizeClassFilter = (value: ClassFilterValue): number | null => (
  typeof value === 'number' ? value : null
)

export const getClassStudentSet = (
  classes: Array<{ id: number; studentUserIds: string[] }> | undefined,
  classId: number | null,
): Set<string> | null => {
  if (!classes?.length || classId === null) return null
  const match = classes.find((cls) => cls.id === classId)
  if (!match?.studentUserIds?.length) return new Set()
  return new Set(match.studentUserIds)
}
