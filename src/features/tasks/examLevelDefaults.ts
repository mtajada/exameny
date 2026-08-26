export const inferPreferredLevelCodeForExam = (examCode?: string | null): string | null => {
  if (!examCode) return null

  const normalized = examCode.trim().toUpperCase()
  const levelMatch = normalized.match(/^CAM_(B1|B2|C1|C2)_/)
  if (levelMatch) {
    return levelMatch[1]
  }

  if (normalized === 'SEL_ARAGON') {
    return 'B2'
  }

  return null
}
