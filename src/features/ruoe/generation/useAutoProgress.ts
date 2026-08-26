import { useCallback, useMemo } from 'react'
import { isReadingLayout, type RuoELayoutKey } from '@/config/ruoeFunctionMap'
import { useTaskAutoProgress } from '@/features/task-generation'

export type AutoProgressMode = 'reading' | 'useOfEnglish'

export const getProgressModeForLayout = (layout: RuoELayoutKey | undefined): AutoProgressMode => {
  if (!layout) return 'useOfEnglish'
  return isReadingLayout(layout) ? 'reading' : 'useOfEnglish'
}

export const useAutoProgress = (isActive: boolean, mode: AutoProgressMode) => {
  const preset = useMemo(() => (mode === 'reading' ? 'ruoeReading' : 'ruoeUseOfEnglish'), [mode])
  const { progress, setProgress: immediateSetProgress, reset } = useTaskAutoProgress({
    isActive,
    preset,
  })

  const setProgress = useCallback(
    (value: number) => {
      if (value <= 0) {
        reset()
      } else {
        immediateSetProgress(value)
      }
    },
    [reset, immediateSetProgress],
  )

  return { progress, setProgress }
}
