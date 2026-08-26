import { useSimulatedProgress, type EasingName } from '@/hooks/useSimulatedProgress'

export type TaskAutoProgressPreset = 'writingFast' | 'ruoeReading' | 'ruoeUseOfEnglish'

interface TaskAutoProgressConfig {
  target: number
  durationMs: number
  tickIntervalMs: number
  initialValue: number
  easing?: EasingName
}

const PRESET_CONFIG: Record<TaskAutoProgressPreset, TaskAutoProgressConfig> = {
  writingFast: { target: 94, durationMs: 17_000, tickIntervalMs: 110, initialValue: 8, easing: 'easeOutBalanced' },
  ruoeReading: { target: 99, durationMs: 55_000, tickIntervalMs: 220, initialValue: 2, easing: 'easeOutBalanced' },
  ruoeUseOfEnglish: { target: 99, durationMs: 42_000, tickIntervalMs: 150, initialValue: 2, easing: 'easeOutBalanced' },
}

interface UseTaskAutoProgressOptions {
  isActive: boolean
  preset?: TaskAutoProgressPreset
  override?: Partial<TaskAutoProgressConfig>
}

const resolveConfig = (
  preset: TaskAutoProgressPreset,
  override?: Partial<TaskAutoProgressConfig>,
): TaskAutoProgressConfig => {
  const base = PRESET_CONFIG[preset] ?? PRESET_CONFIG.writingFast
  return override ? { ...base, ...override } : base
}

export const useTaskAutoProgress = ({ isActive, preset = 'writingFast', override }: UseTaskAutoProgressOptions) => {
  const config = resolveConfig(preset, override)

  const { progress, setProgress, reset } = useSimulatedProgress({
    isActive,
    target: config.target,
    durationMs: config.durationMs,
    tickIntervalMs: config.tickIntervalMs,
    initialValue: config.initialValue,
    easing: config.easing,
  })

  return {
    progress,
    setProgress,
    reset,
  }
}
