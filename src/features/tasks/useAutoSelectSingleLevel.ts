import { useEffect } from 'react'
import type { TaskConfigurationLevelOption } from './TaskConfigurationCard.tsx'

interface UseAutoSelectSingleLevelParams {
  levels: TaskConfigurationLevelOption[]
  selectedExamId: string
  selectedLevelId: string
  guardActive: boolean
  preferredLevelCode?: string | null
  autoAppliedLevelId: string | null
  setAutoAppliedLevelId: (levelId: string | null) => void
  onAutoSelectLevel: (levelId: string) => void
}

/**
 * Ensures that when an exam exposes only a single level option we automatically
 * pre-select it, mirroring the behaviour implemented in Assign Task.
 * The hook keeps track of the last auto-applied level so it never overrides a
 * manual user choice or a guard condition (e.g. RUoE attachments).
 */
export const useAutoSelectSingleLevel = ({
  levels,
  selectedExamId,
  selectedLevelId,
  guardActive,
  preferredLevelCode = null,
  autoAppliedLevelId,
  setAutoAppliedLevelId,
  onAutoSelectLevel,
}: UseAutoSelectSingleLevelParams) => {
  useEffect(() => {
    if (guardActive) {
      if (autoAppliedLevelId !== null) {
        setAutoAppliedLevelId(null)
      }
      return
    }

    if (!selectedExamId) {
      if (autoAppliedLevelId !== null) {
        setAutoAppliedLevelId(null)
      }
      return
    }

    const normalizedPreferredCode = preferredLevelCode?.trim().toUpperCase() ?? null
    const preferredLevel = normalizedPreferredCode
      ? levels.find((level) => level.code?.trim().toUpperCase() === normalizedPreferredCode) ?? null
      : null

    const candidateLevelId = preferredLevel
      ? String(preferredLevel.id)
      : levels.length === 1
        ? String(levels[0].id)
        : null

    if (!candidateLevelId) {
      if (autoAppliedLevelId !== null) {
        setAutoAppliedLevelId(null)
      }
      return
    }

    const onlyLevelId = candidateLevelId

    const shouldApplyLevel = !selectedLevelId || selectedLevelId === autoAppliedLevelId

    if (shouldApplyLevel && selectedLevelId !== onlyLevelId) {
      onAutoSelectLevel(onlyLevelId)
      setAutoAppliedLevelId(onlyLevelId)
      return
    }

    if (!shouldApplyLevel && autoAppliedLevelId !== null && selectedLevelId !== autoAppliedLevelId) {
      setAutoAppliedLevelId(null)
    }
  }, [
    levels,
    selectedExamId,
    selectedLevelId,
    guardActive,
    preferredLevelCode,
    autoAppliedLevelId,
    setAutoAppliedLevelId,
    onAutoSelectLevel,
  ])
}
