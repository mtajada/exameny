import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Clock, Loader2, Lightbulb, RefreshCw, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExerciseData } from '@/types/ruoe'
import { mapExerciseDataToSummary, sanitizeGuidance } from './ruoeGenerationUtils'
import { useRuoEExerciseGeneration } from './useRuoEExerciseGeneration'
import { RuoEAssignmentPreviewCard } from './RuoEAssignmentPreviewCard'
import { RuoEAssignmentSummary } from '@/types/assignments'
import { sanitizeGuidanceField, TEACHER_GUIDANCE_MAX_LENGTH } from '@/utils/teacherGuidance'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface TaskTypeMeta {
  id: number
  name: string
  taskCode: string
}

interface RuoEGeneratorPanelProps {
  examId?: number | null
  levelId?: number | null
  taskType?: TaskTypeMeta | null
  disabled?: boolean
  selectedSummary: RuoEAssignmentSummary | null
  onSelectSummary: (summary: RuoEAssignmentSummary, preview: ExerciseData | null) => void
  onClearSummary: () => void
  autoSelectOnPreview?: boolean
  lockUiOnSelection?: boolean
  showPrimaryAction?: boolean
}

type SanitizationFeedback = {
  removedCount: number
  truncated: boolean
}

type PreservedGuidanceState = {
  theme: string
  skillFocus: string
  themeSanitization: SanitizationFeedback
  skillFocusSanitization: SanitizationFeedback
  sanitizedTheme: string | null
  sanitizedSkillFocus: string | null
}

const DEFAULT_TIPS = [
  { icon: '📚', text: 'Read instructions carefully before starting' },
  { icon: '⏰', text: 'Manage your time effectively during the exercise' },
  { icon: '🎯', text: 'Focus on understanding the context' },
  { icon: '✅', text: 'Double-check your answers before submitting' },
]

const getTips = (taskCode?: string | null) => {
  if (!taskCode) return DEFAULT_TIPS
  const normalized = taskCode.toUpperCase()
  if (normalized.includes('UOE_P1')) {
    return [
      { icon: '🔗', text: 'Focus on collocations—words that naturally go together.' },
      { icon: '📝', text: 'Use surrounding context to decide between similar options.' },
      { icon: '⚖️', text: 'All options are grammatical, but only one fits the meaning.' },
    ]
  }
  if (normalized.includes('UOE_P2')) {
    return [
      { icon: '📐', text: 'Each gap needs exactly ONE word.' },
      { icon: '🎯', text: 'Look for grammar patterns rather than vocabulary.' },
      { icon: '🔍', text: 'Mind articles, prepositions, pronouns, and verb forms.' },
    ]
  }
  if (normalized.includes('UOE_P3')) {
    return [
      { icon: '🔧', text: 'Apply prefixes and suffixes to transform the root word.' },
      { icon: '🔄', text: 'Change word class to fit the sentence (noun, verb, adjective).' },
      { icon: '❌', text: 'Remember to create negative forms when needed.' },
    ]
  }
  if (normalized.includes('UOE_P4')) {
    const windowText = normalized.startsWith('C1')
      ? '3–6'
      : normalized.startsWith('C2')
        ? '3–8'
        : '2–5'
    return [
      { icon: '🔒', text: `Keep the key word unchanged and stay within the ${windowText} word window.` },
      { icon: '🔄', text: 'Focus on grammar transformations like passives or conditionals.' },
      { icon: '=', text: 'Ensure the rewritten sentence keeps the same meaning.' },
    ]
  }
  if (normalized.includes('READ_P5')) {
    return [
      { icon: '🎯', text: 'Identify main ideas and specific details in the text.' },
      { icon: '💡', text: 'Look for implied meaning and inference cues.' },
      { icon: '📖', text: 'Read each paragraph carefully before answering.' },
    ]
  }
  if (normalized.includes('READ_P6')) {
    return [
      { icon: '🧩', text: 'Track cohesion markers to place each missing sentence.' },
      { icon: '🔗', text: 'Watch referencing words that connect to surrounding sentences.' },
      { icon: '↔️', text: 'Consider what comes before and after every gap.' },
    ]
  }
  if (normalized.includes('READ_P7')) {
    return [
      { icon: '🎯', text: 'Match statements to specific sections using paraphrasing clues.' },
      { icon: '🔍', text: 'Scan for synonyms and rephrased ideas across the text.' },
      { icon: '📖', text: 'Skim the full text first for orientation.' },
    ]
  }
  if (normalized.includes('READ_P8')) {
    return [
      { icon: '🎯', text: 'Analyse viewpoint and scope for each short text.' },
      { icon: '📊', text: 'Compare perspectives to match each statement accurately.' },
      { icon: '⚖️', text: 'Each statement matches exactly one text—no duplicates.' },
    ]
  }
  return DEFAULT_TIPS
}

const formatElapsedTime = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const RuoEGeneratorPanel = ({
  examId,
  levelId,
  taskType,
  disabled,
  selectedSummary,
  onSelectSummary,
  onClearSummary,
  autoSelectOnPreview = false,
  lockUiOnSelection = true,
  showPrimaryAction = true,
}: RuoEGeneratorPanelProps) => {
  const [theme, setTheme] = useState('')
  const [skillFocus, setSkillFocus] = useState('')
  const [themeSanitization, setThemeSanitization] = useState({ removedCount: 0, truncated: false })
  const [skillFocusSanitization, setSkillFocusSanitization] = useState({ removedCount: 0, truncated: false })
  const [currentTipIndex, setCurrentTipIndex] = useState(0)
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false)
  const autoSelectedExerciseIdRef = useRef<number | null>(selectedSummary?.exerciseId ?? null)
  const previousSummaryRef = useRef<RuoEAssignmentSummary | null>(selectedSummary)
  const skipAutoSelectRef = useRef(false)
  const preservedGuidanceRef = useRef<PreservedGuidanceState | null>(null)
  const regenerateFlowRef = useRef(false)
  const generationStartedAtRef = useRef<number | null>(null)
  const [generationElapsedMs, setGenerationElapsedMs] = useState(0)

  const hasAttachedExercise = Boolean(selectedSummary)
  const selectionLocked = lockUiOnSelection && hasAttachedExercise

  const hasContext = useMemo(
    () => typeof examId === 'number' && typeof levelId === 'number' && taskType !== null,
    [examId, levelId, taskType],
  )

  const generatorContext = useMemo(() => {
    if (!hasContext || !taskType || typeof examId !== 'number' || typeof levelId !== 'number') return null
    return {
      taskTypeId: taskType.id,
      examId,
      levelId,
      taskCode: taskType.taskCode,
      taskName: taskType.name,
    }
  }, [examId, hasContext, levelId, taskType])

  const {
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
    generateExercise,
    loadExistingExercise,
    reset,
  } = useRuoEExerciseGeneration(generatorContext)

  useEffect(() => {
    if (!isGenerating) {
      generationStartedAtRef.current = null
      setGenerationElapsedMs(0)
      return
    }

    if (generationStartedAtRef.current === null) {
      generationStartedAtRef.current = Date.now()
    }

    const interval = setInterval(() => {
      const startedAt = generationStartedAtRef.current
      if (!startedAt) return
      setGenerationElapsedMs(Date.now() - startedAt)
    }, 1_000)

    return () => clearInterval(interval)
  }, [isGenerating])

  const generationTiming = useMemo(() => {
    if (!isGenerating) {
      return {
        showElapsed: false,
        elapsedLabel: '',
        stageLabel: 'Progress',
        showSlowNotice: false,
        showVerySlowNotice: false,
        progressLabel: `${Math.round(progress)}%`,
      }
    }

    // Typical generations complete in ~5s. When the AI needs extra validation/repair passes, it can take ~15–20s.
    const showElapsed = generationElapsedMs >= 7_000
    const showSlowNotice = generationElapsedMs >= 15_000
    const showVerySlowNotice = generationElapsedMs >= 30_000
    const elapsedLabel = showElapsed ? formatElapsedTime(generationElapsedMs) : ''
    const progressLabel = `≈${Math.round(progress)}%`

    const stageLabel =
      progress >= 92
        ? 'Final checks…'
        : showVerySlowNotice
          ? 'Still working…'
          : showSlowNotice
            ? 'Running extra checks…'
            : generationElapsedMs >= 7_000
              ? 'Checking exam constraints…'
              : 'Generating exercise…'

    return {
      showElapsed,
      elapsedLabel,
      stageLabel,
      showSlowNotice,
      showVerySlowNotice,
      progressLabel,
    }
  }, [generationElapsedMs, isGenerating, progress])

  useEffect(() => {
    autoSelectedExerciseIdRef.current = selectedSummary?.exerciseId ?? null
    if (selectedSummary?.exerciseId) {
      skipAutoSelectRef.current = false
    }
  }, [selectedSummary?.exerciseId])

  useEffect(() => {
    if (isGenerating) {
      autoSelectedExerciseIdRef.current = null
      skipAutoSelectRef.current = false
    }
  }, [isGenerating])

  const sanitizedThemeField = useMemo(() => sanitizeGuidanceField(theme), [theme])
  const sanitizedSkillFocusField = useMemo(() => sanitizeGuidanceField(skillFocus), [skillFocus])
  const themeCount = Math.min(sanitizedThemeField.trimmedLength, TEACHER_GUIDANCE_MAX_LENGTH)
  const skillFocusCount = Math.min(sanitizedSkillFocusField.trimmedLength, TEACHER_GUIDANCE_MAX_LENGTH)
  const exceedsGuidanceLimit =
    sanitizedThemeField.trimmedLength > TEACHER_GUIDANCE_MAX_LENGTH ||
    sanitizedSkillFocusField.trimmedLength > TEACHER_GUIDANCE_MAX_LENGTH
  const tips = useMemo(() => getTips(taskType?.taskCode), [taskType?.taskCode])

  useEffect(() => {
    if (!isGenerating) return
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % tips.length)
    }, 2200)
    return () => clearInterval(interval)
  }, [isGenerating, tips.length])

  useEffect(() => {
    if (!generatorContext) {
      skipAutoSelectRef.current = true
      reset()
      setTheme('')
      setSkillFocus('')
      setThemeSanitization({ removedCount: 0, truncated: false })
      setSkillFocusSanitization({ removedCount: 0, truncated: false })
      autoSelectedExerciseIdRef.current = null
      previousSummaryRef.current = selectedSummary
      return
    }

    if (selectedSummary && selectedSummary.exerciseId && selectedSummary.exerciseId !== generatedExerciseId) {
      if (regenerateFlowRef.current) {
        previousSummaryRef.current = selectedSummary
        return
      }
      const rawTheme = selectedSummary.teacherTheme ?? ''
      const rawSkillFocus = selectedSummary.teacherSkillFocus ?? ''
      const sanitizedThemeRaw = sanitizeGuidance(rawTheme)
      const sanitizedSkillRaw = sanitizeGuidance(rawSkillFocus)
      const clampedTheme = sanitizedThemeRaw.slice(0, TEACHER_GUIDANCE_MAX_LENGTH)
      const clampedSkill = sanitizedSkillRaw.slice(0, TEACHER_GUIDANCE_MAX_LENGTH)

      setTheme(clampedTheme)
      setSkillFocus(clampedSkill)
      setThemeSanitization({
        removedCount: Math.max(0, rawTheme.length - sanitizedThemeRaw.length),
        truncated: sanitizedThemeRaw.trim().length > TEACHER_GUIDANCE_MAX_LENGTH,
      })
      setSkillFocusSanitization({
        removedCount: Math.max(0, rawSkillFocus.length - sanitizedSkillRaw.length),
        truncated: sanitizedSkillRaw.trim().length > TEACHER_GUIDANCE_MAX_LENGTH,
      })
      autoSelectedExerciseIdRef.current = selectedSummary.exerciseId
      skipAutoSelectRef.current = false
      void loadExistingExercise(
        selectedSummary.exerciseId,
        clampedTheme.trim().length > 0 ? clampedTheme.trim() : null,
        clampedSkill.trim().length > 0 ? clampedSkill.trim() : null,
      )
      previousSummaryRef.current = selectedSummary
      return
    }

    if (!selectedSummary) {
      const preservedGuidance = preservedGuidanceRef.current
      if (previousSummaryRef.current) {
        skipAutoSelectRef.current = preservedGuidance ? false : true
        if (!regenerateFlowRef.current) {
          // Avoid clearing generator state while a regenerate request is in flight.
          reset()
        }
      }
      if (preservedGuidance) {
        setTheme(preservedGuidance.theme)
        setSkillFocus(preservedGuidance.skillFocus)
        setThemeSanitization(preservedGuidance.themeSanitization)
        setSkillFocusSanitization(preservedGuidance.skillFocusSanitization)
      } else {
        setTheme('')
        setSkillFocus('')
        setThemeSanitization({ removedCount: 0, truncated: false })
        setSkillFocusSanitization({ removedCount: 0, truncated: false })
      }
      autoSelectedExerciseIdRef.current = null
      preservedGuidanceRef.current = null
      regenerateFlowRef.current = false
    }
    previousSummaryRef.current = selectedSummary
  }, [generatedExerciseId, generatorContext, loadExistingExercise, reset, selectedSummary])

  const handleThemeChange = useCallback((value: string) => {
    const sanitized = sanitizeGuidance(value)
    setTheme(sanitized.slice(0, TEACHER_GUIDANCE_MAX_LENGTH))
    setThemeSanitization({
      removedCount: Math.max(0, value.length - sanitized.length),
      truncated: sanitized.trim().length > TEACHER_GUIDANCE_MAX_LENGTH,
    })
  }, [])

  const handleSkillFocusChange = useCallback((value: string) => {
    const sanitized = sanitizeGuidance(value)
    setSkillFocus(sanitized.slice(0, TEACHER_GUIDANCE_MAX_LENGTH))
    setSkillFocusSanitization({
      removedCount: Math.max(0, value.length - sanitized.length),
      truncated: sanitized.trim().length > TEACHER_GUIDANCE_MAX_LENGTH,
    })
  }, [])

  const handleGenerate = useCallback(() => {
    if (!generatorContext || disabled) return
    if (!hasContext) return
    if (exceedsGuidanceLimit) return
    if (selectionLocked) return

    if (hasAttachedExercise) {
      preservedGuidanceRef.current = {
        theme,
        skillFocus,
        themeSanitization,
        skillFocusSanitization,
        sanitizedTheme: sanitizedThemeField.value,
        sanitizedSkillFocus: sanitizedSkillFocusField.value,
      }
      setConfirmRegenerateOpen(true)
      return
    }

    void generateExercise({
      theme: sanitizedThemeField.value,
      skillFocus: sanitizedSkillFocusField.value,
    })
  }, [
    disabled,
    exceedsGuidanceLimit,
    generateExercise,
    generatorContext,
    hasAttachedExercise,
    hasContext,
    sanitizedSkillFocusField.value,
    sanitizedThemeField.value,
    selectionLocked,
    skillFocus,
    skillFocusSanitization,
    theme,
    themeSanitization,
  ])

  const handleUseExercise = useCallback(() => {
    if (!generatorContext || !generatedExerciseId) return
    const resolvedTheme = usedTheme ?? sanitizedThemeField.value ?? null
    const resolvedSkillFocus = usedSkillFocus ?? sanitizedSkillFocusField.value ?? null
    const summary = mapExerciseDataToSummary(
      generatedExerciseId,
      {
        ...generatorContext,
        teacherTheme: resolvedTheme,
        teacherSkillFocus: resolvedSkillFocus,
      },
      previewData,
    )
    onSelectSummary(summary, previewData)
    autoSelectedExerciseIdRef.current = generatedExerciseId
  }, [
    generatedExerciseId,
    generatorContext,
    onSelectSummary,
    previewData,
    sanitizedSkillFocusField.value,
    sanitizedThemeField.value,
    usedSkillFocus,
    usedTheme,
  ])

  useEffect(() => {
    if (!autoSelectOnPreview) return
    if (!generatorContext) return
    if (!previewData || !generatedExerciseId) return
    if (isGenerating) return
    if (skipAutoSelectRef.current) return
    if (autoSelectedExerciseIdRef.current === generatedExerciseId) return
    handleUseExercise()
  }, [
    autoSelectOnPreview,
    generatedExerciseId,
    generatorContext,
    handleUseExercise,
    isGenerating,
    previewData,
  ])

  const handleClearSelection = useCallback(() => {
    skipAutoSelectRef.current = true
    onClearSummary()
    reset()
    setTheme('')
    setSkillFocus('')
    setThemeSanitization({ removedCount: 0, truncated: false })
    setSkillFocusSanitization({ removedCount: 0, truncated: false })
    autoSelectedExerciseIdRef.current = null
  }, [onClearSummary, reset])

  const currentTip = tips[currentTipIndex % tips.length]
  const selectionActive = Boolean(selectedSummary && selectedSummary.exerciseId === generatedExerciseId)
  const generationDisabled =
    disabled || isGenerating || !hasContext || exceedsGuidanceLimit || selectionLocked
  const confirmDialogDisabled = disabled || !hasContext || exceedsGuidanceLimit || selectionLocked || !hasAttachedExercise
  const resolvedTheme = useMemo(() => {
    const trimmedUsedTheme = usedTheme?.trim()
    if (trimmedUsedTheme) return trimmedUsedTheme
    const trimmedSelectedTheme = selectedSummary?.teacherTheme?.trim()
    if (trimmedSelectedTheme) return trimmedSelectedTheme
    return sanitizedThemeField.value ?? null
  }, [
    sanitizedThemeField.value,
    selectedSummary?.teacherTheme,
    usedTheme,
  ])

  const resolvedSkillFocus = useMemo(() => {
    const trimmedUsedSkillFocus = usedSkillFocus?.trim()
    if (trimmedUsedSkillFocus) return trimmedUsedSkillFocus
    const trimmedSelectedSkillFocus = selectedSummary?.teacherSkillFocus?.trim()
    if (trimmedSelectedSkillFocus) return trimmedSelectedSkillFocus
    return sanitizedSkillFocusField.value ?? null
  }, [
    sanitizedSkillFocusField.value,
    selectedSummary?.teacherSkillFocus,
    usedSkillFocus,
  ])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">Generate R&UoE Exercise</CardTitle>
          <CardDescription>
            Provide optional guidance and let the AI craft a Reading & Use of English task tailored to this assignment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Theme</Badge>
                    <span className="text-xs text-muted-foreground">Optional</span>
                  </div>
                  <span
                    className={cn(
                      'text-xs text-muted-foreground',
                      themeCount >= TEACHER_GUIDANCE_MAX_LENGTH && 'text-destructive',
                    )}
                  >
                    {themeCount} / {TEACHER_GUIDANCE_MAX_LENGTH}
                  </span>
                </div>
                <Input
                  placeholder="e.g., Community volunteering at a local festival"
                  value={theme}
                  onChange={(event) => handleThemeChange(event.target.value)}
                  disabled={disabled || isGenerating || selectionLocked}
                  maxLength={TEACHER_GUIDANCE_MAX_LENGTH}
                />
                <p className="text-xs text-muted-foreground">
                  Context for the passage. Keep it concise and exam-appropriate.
                </p>
                {themeSanitization.removedCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Removed {themeSanitization.removedCount} unsupported character
                    {themeSanitization.removedCount === 1 ? '' : 's'}.
                  </p>
                )}
                {themeSanitization.truncated && (
                  <p className="text-xs text-destructive">
                    Trimmed to {TEACHER_GUIDANCE_MAX_LENGTH} characters.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge>Skill focus</Badge>
                    <span className="text-xs text-muted-foreground">Optional</span>
                  </div>
                  <span
                    className={cn(
                      'text-xs text-muted-foreground',
                      skillFocusCount >= TEACHER_GUIDANCE_MAX_LENGTH && 'text-destructive',
                    )}
                  >
                    {skillFocusCount} / {TEACHER_GUIDANCE_MAX_LENGTH}
                  </span>
                </div>
                <Input
                  placeholder="e.g., contrast linkers; B2 collocations on technology"
                  value={skillFocus}
                  onChange={(event) => handleSkillFocusChange(event.target.value)}
                  disabled={disabled || isGenerating || selectionLocked}
                  maxLength={TEACHER_GUIDANCE_MAX_LENGTH}
                />
                <p className="text-xs text-muted-foreground">
                  What students should practise. Hidden from learners.
                </p>
                {skillFocusSanitization.removedCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Removed {skillFocusSanitization.removedCount} unsupported character
                    {skillFocusSanitization.removedCount === 1 ? '' : 's'}.
                  </p>
                )}
                {skillFocusSanitization.truncated && (
                  <p className="text-xs text-destructive">
                    Trimmed to {TEACHER_GUIDANCE_MAX_LENGTH} characters.
                  </p>
                )}
              </div>
            </div>

            {selectionLocked && (
              <p className="text-xs text-muted-foreground">
                An exercise is already attached. Remove the current selection below to generate another one.
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Generation failed</AlertTitle>
              <AlertDescription className="space-y-1 text-sm">
                <p>{error}</p>
                {traceId && <span className="block text-xs opacity-70">Trace ID: {traceId}</span>}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lightbulb className="h-4 w-4" />
              {selectionLocked
                ? 'Exercise attached. Remove the selection below to enable the generator.'
                : status === 'success'
                  ? 'Exercise generated successfully.'
                  : 'The AI will craft exercises using this context.'}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={generationDisabled}
                title={selectionLocked ? 'Remove the current selection to generate a new exercise.' : undefined}
              >
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {status === 'success' ? 'Generate new exercise' : 'Generate exercise'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {(resolvedTheme || resolvedSkillFocus) && (
        <Card className="border border-dashed border-muted-foreground/40 bg-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Teacher Guidance</CardTitle>
            <CardDescription className="text-xs">
              Context sent to the AI (hidden from students).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {resolvedTheme && (
              <div className="space-y-1">
                <Badge variant="secondary" className="w-fit uppercase tracking-wide text-[0.65rem]">
                  Theme
                </Badge>
                <p className="text-sm text-foreground">{resolvedTheme}</p>
              </div>
            )}
            {resolvedSkillFocus && (
              <div className="space-y-1">
                <Badge variant="outline" className="w-fit uppercase tracking-wide text-[0.65rem]">
                  Skill focus
                </Badge>
                <p className="text-sm text-foreground">{resolvedSkillFocus}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <Loader2 className={cn('h-4 w-4', isGenerating && 'animate-spin')} />
            {isGenerating ? 'Generating your exercise…' : status === 'success' ? 'Generation complete' : 'Generation status'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{generationTiming.stageLabel}</span>
              <span className="flex items-center gap-2">
                {generationTiming.showElapsed ? (
                  <span className="tabular-nums text-xs">{generationTiming.elapsedLabel}</span>
                ) : null}
                <span>{generationTiming.progressLabel}</span>
              </span>
            </div>
            <Progress value={progress} className={cn('h-2', isGenerating && 'animate-pulse')} aria-label="Generation progress" />
          </div>
          {generationTiming.showSlowNotice ? (
            <Alert className="border-border/60 bg-muted/20 animate-fadeIn">
              <Clock className="h-4 w-4" />
              <AlertTitle>{generationTiming.showVerySlowNotice ? 'Taking longer than usual' : 'Still working…'}</AlertTitle>
              <AlertDescription className="space-y-1">
                <p>
                  Sometimes the AI needs an extra pass to satisfy strict exam constraints (word limits, gap formatting, and valid variants).
                  Keep this tab open—generation is still in progress.
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                <Lightbulb className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 space-y-1 text-sm text-blue-900">
                <div className="flex items-center gap-2 font-semibold">
                  <Target className="h-4 w-4" /> Tip for this task
                </div>
                <p className="text-blue-800">
                  {currentTip.icon} {currentTip.text}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-blue-700">AI usage is monitored. Keep this tab open until the exercise is ready.</p>
          </div>
        </CardContent>
      </Card>

      <RuoEAssignmentPreviewCard
        isLoading={isPreviewLoading}
        previewData={previewData}
        error={previewError}
        onPrimaryAction={handleUseExercise}
        primaryLabel={selectionActive ? 'Exercise selected' : 'Use this exercise'}
        primaryDisabled={selectionActive}
        onSecondaryAction={selectionLocked ? handleClearSelection : undefined}
        secondaryLabel={selectionLocked ? 'Remove selection' : undefined}
        secondaryDisabled={selectionLocked ? isGenerating : undefined}
        selectionLocked={selectionLocked}
        teacherTheme={resolvedTheme ?? null}
        teacherSkillFocus={resolvedSkillFocus ?? null}
        primaryVisible={showPrimaryAction}
      />

      <AlertDialog open={confirmRegenerateOpen} onOpenChange={setConfirmRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate a new exercise?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear the current Reading &amp; Use of English exercise before generating a new one.
              Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              onClick={() => {
                preservedGuidanceRef.current = null
                regenerateFlowRef.current = false
                setConfirmRegenerateOpen(false)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (confirmDialogDisabled) {
                  setConfirmRegenerateOpen(false)
                  preservedGuidanceRef.current = null
                  regenerateFlowRef.current = false
                  return
                }

                const preserved =
                  preservedGuidanceRef.current ?? {
                    theme,
                    skillFocus,
                    themeSanitization,
                    skillFocusSanitization,
                    sanitizedTheme: sanitizedThemeField.value,
                    sanitizedSkillFocus: sanitizedSkillFocusField.value,
                  }

                regenerateFlowRef.current = true
                setConfirmRegenerateOpen(false)

                onClearSummary()
                reset()
                autoSelectedExerciseIdRef.current = null
                skipAutoSelectRef.current = false

                const nextTheme = preserved.sanitizedTheme ?? null
                const nextSkillFocus = preserved.sanitizedSkillFocus ?? null

                preservedGuidanceRef.current = preserved

                void generateExercise({
                  theme: nextTheme,
                  skillFocus: nextSkillFocus,
                })
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
