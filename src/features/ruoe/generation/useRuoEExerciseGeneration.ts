import { useCallback, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { ExerciseData } from '@/types/ruoe'
import { getRuoEFunctionName, getRuoELayoutKey } from '@/config/ruoeFunctionMap'
import { fetchExercisePreview } from './fetchExercisePreview'
import { getProgressModeForLayout, useAutoProgress } from './useAutoProgress'

export interface GeneratorContext {
  taskTypeId: number
  examId: number
  levelId: number
  taskCode?: string | null
  taskName?: string | null
}

export interface GeneratorResult {
  exerciseId: number
  previewData: ExerciseData | null
  teacherTheme: string | null
  teacherSkillFocus: string | null
}

type GeneratorStatus = 'idle' | 'generating' | 'success' | 'error'

type GeneratedExerciseResponse = {
  exerciseId: number
  traceId?: string
  success?: boolean
}

const toTrimmedOrNull = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export const useRuoEExerciseGeneration = (context: GeneratorContext | null) => {
  const [status, setStatus] = useState<GeneratorStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [traceId, setTraceId] = useState<string | null>(null)
  const [generatedExerciseId, setGeneratedExerciseId] = useState<number | null>(null)
  const [usedTheme, setUsedTheme] = useState<string | null>(null)
  const [usedSkillFocus, setUsedSkillFocus] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<ExerciseData | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const layoutKey = useMemo(() => {
    if (!context?.taskCode) return null
    try {
      return getRuoELayoutKey(context.taskCode)
    } catch {
      return null
    }
  }, [context?.taskCode])
  const progressMode = useMemo(() => getProgressModeForLayout(layoutKey ?? undefined), [layoutKey])
  const { progress, setProgress } = useAutoProgress(isGenerating, progressMode)

  const resetPreviewState = useCallback(() => {
    setPreviewData(null)
    setPreviewError(null)
    setGeneratedExerciseId(null)
    setTraceId(null)
    setUsedTheme(null)
    setUsedSkillFocus(null)
  }, [])

  const loadPreview = useCallback(async (exerciseId: number) => {
    setIsPreviewLoading(true)
    setPreviewError(null)
    try {
      const preview = await fetchExercisePreview(exerciseId)
      setPreviewData(preview)
      return preview
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : 'Could not load the generated exercise.'
      setPreviewError(message)
      return null
    } finally {
      setIsPreviewLoading(false)
    }
  }, [])

  type GenerateExerciseInput =
    | null
    | undefined
    | {
        theme?: string | null
        skillFocus?: string | null
      }

  const generateExercise = useCallback(
    async (guidanceInput?: GenerateExerciseInput) => {
      if (!context) return null

      let theme: string | null = null
      let skillFocus: string | null = null
      if (guidanceInput && typeof guidanceInput === 'object') {
        theme = toTrimmedOrNull(guidanceInput.theme)
        skillFocus = toTrimmedOrNull(guidanceInput.skillFocus)
      }

      setStatus('generating')
      setIsGenerating(true)
      setError(null)
      setTraceId(null)
      setPreviewData(null)
      setPreviewError(null)
      setGeneratedExerciseId(null)
      setProgress(0)
      setUsedTheme(theme)
      setUsedSkillFocus(skillFocus)

      try {
        const functionName = context.taskCode ? getRuoEFunctionName(context.taskCode) : null
        if (!functionName) {
          throw new Error('Unable to resolve R&UoE function for the selected task.')
        }

        const { data, error: funcError } = await supabase.functions.invoke<GeneratedExerciseResponse>(functionName, {
          body: {
            taskTypeId: context.taskTypeId,
            teacherTheme: theme ?? undefined,
            teacherSkillFocus: skillFocus ?? undefined,
          },
        })

        if (funcError) {
          if (funcError.message.includes('timed out')) {
            throw new Error('Exercise generation is taking too long. Please try again later.')
          }
          if (funcError.message.includes('status code 500')) {
            throw new Error('Internal server error while generating exercise. Please try again.')
          }
          if (funcError.message.includes('status code 400')) {
            throw new Error('Invalid data provided for exercise generation.')
          }
          throw new Error(funcError.message)
        }

        if (!data?.exerciseId) {
          throw new Error('Exercise generation returned an unexpected response.')
        }

        setGeneratedExerciseId(data.exerciseId)
        setTraceId(data.traceId ?? null)
        setProgress(100)
        setStatus('success')
        setIsGenerating(false)
        const preview = await loadPreview(data.exerciseId)
        const persistedTheme = preview?.exercise.teacher_theme ?? null
        const persistedSkillFocus = preview?.exercise.teacher_skill_focus ?? null
        const resolvedTheme = typeof persistedTheme === 'string' && persistedTheme.trim().length > 0
          ? persistedTheme.trim()
          : theme
        const resolvedSkillFocus = typeof persistedSkillFocus === 'string' && persistedSkillFocus.trim().length > 0
          ? persistedSkillFocus.trim()
          : skillFocus
        setUsedTheme(resolvedTheme ?? null)
        setUsedSkillFocus(resolvedSkillFocus ?? null)

        return {
          exerciseId: data.exerciseId,
          previewData: preview,
          teacherTheme: resolvedTheme ?? null,
          teacherSkillFocus: resolvedSkillFocus ?? null,
        } satisfies GeneratorResult
      } catch (generationError) {
        const message = generationError instanceof Error ? generationError.message : 'Could not generate the exercise. Please try again.'
        setError(message)
        setStatus('error')
        setIsGenerating(false)
        setProgress(0)
        return null
      }
    },
    [context, loadPreview, setProgress],
  )

  const loadExistingExercise = useCallback(
    async (exerciseId: number, theme?: string | null, skillFocus?: string | null) => {
      setGeneratedExerciseId(exerciseId)
      const preview = await loadPreview(exerciseId)
      const persistedTheme = preview?.exercise.teacher_theme ?? null
      const persistedSkillFocus = preview?.exercise.teacher_skill_focus ?? null
      const resolvedTheme = typeof persistedTheme === 'string' && persistedTheme.trim().length > 0
        ? persistedTheme.trim()
        : (theme ?? null)
      const resolvedSkillFocus = typeof persistedSkillFocus === 'string' && persistedSkillFocus.trim().length > 0
        ? persistedSkillFocus.trim()
        : (skillFocus ?? null)
      setUsedTheme(resolvedTheme)
      setUsedSkillFocus(resolvedSkillFocus)
      setStatus('success')
    },
    [loadPreview],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setTraceId(null)
    setIsGenerating(false)
    resetPreviewState()
    setProgress(0)
  }, [resetPreviewState, setProgress])

  return {
    status,
    error,
    traceId,
    generatedExerciseId,
    usedTheme,
    usedSkillFocus,
    previewData,
    previewError,
    isPreviewLoading,
    isGenerating,
    progress,
    setProgress,
    generateExercise,
    loadExistingExercise,
    reset,
  }
}
