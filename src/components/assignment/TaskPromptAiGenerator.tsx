import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { Loader2, Sparkles, Info } from 'lucide-react'
import { cn } from '@/lib/utils.ts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { TEACHER_GUIDANCE_MAX_LENGTH, prepareTeacherGuidance, sanitizeGuidanceField } from '@/utils/teacherGuidance.ts'

// Strip only control characters while keeping full Unicode guidance intact
const CONTROL_CHAR_RANGE = '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F'
const CONTROL_CHAR_REGEX = new RegExp(`[${CONTROL_CHAR_RANGE}]`, 'g')

interface AiInsertPayload {
  value: string
  suggestedTimeMinutes?: number | null
}

interface TaskTypeMeta {
  id: number
  name: string
  taskCode: string
  description: string | null
  defaultTimeMinutes: number | null
}

interface ToastOptions {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}

interface AiGenerationSuccess {
  promptText: string
  suggestedTimeMinutes?: number | null
  traceId?: string
}

interface AiGenerationError {
  error: string
  traceId?: string
}

type AiGenerationResponse = AiGenerationSuccess | AiGenerationError

const isAiGenerationError = (payload: AiGenerationResponse): payload is AiGenerationError =>
  typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'

const isAiGenerationSuccess = (payload: AiGenerationResponse): payload is AiGenerationSuccess =>
  typeof payload === 'object' && payload !== null && 'promptText' in payload && typeof payload.promptText === 'string'

interface TaskPromptAiGeneratorProps {
  examId?: number | null
  examName?: string
  levelId?: number | null
  levelName?: string
  taskType?: TaskTypeMeta | null
  disabled?: boolean
  currentPrompt?: string
  onInsert: (payload: AiInsertPayload) => void
  onShowToast?: (toast: ToastOptions) => void
  className?: string
}

const sanitizeGuidance = (value: string) => value.replace(CONTROL_CHAR_REGEX, '')

export default function TaskPromptAiGenerator({
  examId,
  examName,
  levelId,
  levelName,
  taskType,
  disabled,
  onInsert,
  onShowToast,
  currentPrompt: _currentPrompt,
  className,
}: TaskPromptAiGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [theme, setTheme] = useState('')
  const [skillFocus, setSkillFocus] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<AiGenerationSuccess | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [traceId, setTraceId] = useState<string | null>(null)
  const [appliedTheme, setAppliedTheme] = useState<string | null>(null)
  const [appliedSkillFocus, setAppliedSkillFocus] = useState<string | null>(null)

  const hasContext = useMemo(
    () => typeof examId === 'number' && typeof levelId === 'number' && Boolean(taskType),
    [examId, levelId, taskType],
  )

  const sanitizedTheme = useMemo(() => sanitizeGuidanceField(theme), [theme])
  const sanitizedSkillFocusField = useMemo(() => sanitizeGuidanceField(skillFocus), [skillFocus])
  const exceedsThemeLimit = sanitizedTheme.trimmedLength > TEACHER_GUIDANCE_MAX_LENGTH
  const exceedsSkillFocusLimit = sanitizedSkillFocusField.trimmedLength > TEACHER_GUIDANCE_MAX_LENGTH
  const exceedsLimit = exceedsThemeLimit || exceedsSkillFocusLimit
  const themeCount = Math.min(sanitizedTheme.trimmedLength, TEACHER_GUIDANCE_MAX_LENGTH)
  const skillFocusCount = Math.min(sanitizedSkillFocusField.trimmedLength, TEACHER_GUIDANCE_MAX_LENGTH)

  const triggerDisabled = disabled || !hasContext

  const resetState = useCallback(() => {
    setTheme('')
    setSkillFocus('')
    setResult(null)
    setError(null)
    setTraceId(null)
    setIsLoading(false)
    setAppliedTheme(null)
    setAppliedSkillFocus(null)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      resetState()
    }
  }, [isOpen, resetState])

  useEffect(() => {
    resetState()
  }, [examId, levelId, taskType?.id, resetState])

  const contextSummary = useMemo(() => {
    const summaryParts = [taskType?.name, examName, levelName].filter(Boolean)
    return summaryParts.join(' • ')
  }, [examName, levelName, taskType?.name])

  const handleThemeChange = useCallback((value: string) => {
    setTheme(sanitizeGuidance(value).slice(0, TEACHER_GUIDANCE_MAX_LENGTH))
    setError(null)
  }, [])

  const handleSkillFocusChange = useCallback((value: string) => {
    setSkillFocus(sanitizeGuidance(value).slice(0, TEACHER_GUIDANCE_MAX_LENGTH))
    setError(null)
  }, [])

  const notify = useCallback(
    (toast: ToastOptions) => {
      if (!onShowToast) return
      onShowToast(toast)
    },
    [onShowToast],
  )

  const handleUsePrompt = useCallback(() => {
    if (!result?.promptText) return
    onInsert({ value: result.promptText, suggestedTimeMinutes: result.suggestedTimeMinutes })
    notify({ title: 'Prompt ready', description: 'The AI prompt is now applied to the assignment.' })
    setIsOpen(false)
  }, [notify, onInsert, result?.promptText, result?.suggestedTimeMinutes])

  const mapErrorMessage = useCallback(
    (status?: number | null): string => {
      switch (status) {
        case 400:
          return 'Theme or skill focus must include at least one visible character.'
        case 413:
          return 'Guidance fields are too long. Keep each under 200 characters.'
        case 429:
          return 'The AI assistant is receiving too many requests. Please try again shortly.'
        case 502:
          return 'The AI service is temporarily unavailable. Please try again.'
        case 504:
          return 'The AI assistant timed out. Try generating again in a moment.'
        default:
          return 'We could not generate the prompt. Please try again.'
      }
    },
    [],
  )

  const validateGuidance = useCallback(() => {
    setTraceId(null)
    if (exceedsLimit) {
      const message = 'Guidance fields are too long. Keep each under 200 characters.'
      setError(message)
      notify({ title: 'Validation error', description: message, variant: 'destructive' })
      return false
    }

    if (!hasContext || !taskType) {
      const message = 'Select an exam, level, and task type before using the AI assistant.'
      setError(message)
      notify({ title: 'Context required', description: message, variant: 'destructive' })
      return false
    }

    setError(null)
    return true
  }, [exceedsLimit, hasContext, notify, taskType])

  const handleGenerate = useCallback(async () => {
    if (!taskType || !hasContext) return

    if (!validateGuidance()) return

    setIsLoading(true)
    setError(null)
    setResult(null)
    setAppliedTheme(null)
    setAppliedSkillFocus(null)

    const prepared = prepareTeacherGuidance(theme, skillFocus)

    const payload: Record<string, unknown> = {
      taskTypeId: taskType.id,
      examId,
      levelId,
    }

    if (prepared.theme) {
      payload.teacherTheme = prepared.theme
    }
    if (prepared.skillFocus) {
      payload.teacherSkillFocus = prepared.skillFocus
    }

    try {
      const { data, error } = await supabase.functions.invoke<AiGenerationResponse>('generate-writing-exercise', {
        body: payload,
      })

      if (error) {
        const message = mapErrorMessage(error.status ?? null)
        setError(message)
        notify({ title: 'AI request failed', description: message, variant: 'destructive' })
        if ((error as AiGenerationError)?.traceId) {
          setTraceId((error as AiGenerationError).traceId ?? null)
        }
        return
      }

      if (data && isAiGenerationError(data)) {
        const message = data.error || mapErrorMessage(null)
        setError(message)
        setTraceId(data.traceId ?? null)
        notify({ title: 'AI request failed', description: message, variant: 'destructive' })
        return
      }

      if (!data || !isAiGenerationSuccess(data)) {
        const fallback = 'The AI returned an unexpected response. Please try again.'
        setError(fallback)
        notify({ title: 'AI request failed', description: fallback, variant: 'destructive' })
        return
      }

      const parsedResult: AiGenerationSuccess = {
        promptText: data.promptText.trim(),
        suggestedTimeMinutes: typeof data.suggestedTimeMinutes === 'number' ? data.suggestedTimeMinutes : undefined,
        traceId: data.traceId,
      }

      setResult(parsedResult)
      setTraceId(parsedResult.traceId ?? null)
      setAppliedTheme(prepared.theme ?? null)
      setAppliedSkillFocus(prepared.skillFocus ?? null)
    } catch (runtimeError) {
      const message = runtimeError instanceof Error ? runtimeError.message : 'We could not contact the AI service.'
      setError(message)
      notify({ title: 'AI request failed', description: message, variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [examId, hasContext, levelId, mapErrorMessage, notify, skillFocus, taskType, theme, validateGuidance])

  const suggestedTimeNotice = useMemo(() => {
    if (!result?.suggestedTimeMinutes || !taskType?.defaultTimeMinutes) return null
    const rounded = Math.round(result.suggestedTimeMinutes)
    if (!Number.isFinite(rounded) || rounded <= 0) return null
    if (rounded === taskType.defaultTimeMinutes) return null
    return {
      suggested: rounded,
      default: taskType.defaultTimeMinutes,
    }
  }, [result?.suggestedTimeMinutes, taskType?.defaultTimeMinutes])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          disabled={triggerDisabled}
          className={cn('w-full sm:w-auto', className)}
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Generate with AI
        </Button>
      </DialogTrigger>
      {!hasContext && (
        <p className="mt-2 text-xs text-muted-foreground">Select exam, level, and task type to enable the AI assistant.</p>
      )}
      <DialogContent className="max-w-3xl gap-6">
        <DialogHeader>
          <DialogTitle>AI Assistant</DialogTitle>
          <DialogDescription>
            {contextSummary || 'Select an exam, level, and task type to generate a tailored prompt.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">Theme</Badge>
                <span className={cn('text-xs text-muted-foreground', exceedsThemeLimit && 'text-destructive')}>
                  {themeCount} / {TEACHER_GUIDANCE_MAX_LENGTH}
                </span>
              </div>
              <Input
                placeholder="e.g., Community volunteering at a local festival"
                value={theme}
                onChange={(event) => handleThemeChange(event.target.value)}
                maxLength={TEACHER_GUIDANCE_MAX_LENGTH}
              />
              <p className="text-xs text-muted-foreground">
                Suggestions: technology in education · travel writing · workplace collaboration · sustainability
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge>Skill focus</Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      Use this to bias grammar or vocabulary cues. The AI keeps the focus implicit.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className={cn('text-xs text-muted-foreground', exceedsSkillFocusLimit && 'text-destructive')}>
                  {skillFocusCount} / {TEACHER_GUIDANCE_MAX_LENGTH}
                </span>
              </div>
              <Input
                placeholder="e.g., past simple vs. past continuous; contrast linkers; B2 collocations on tech"
                value={skillFocus}
                onChange={(event) => handleSkillFocusChange(event.target.value)}
                maxLength={TEACHER_GUIDANCE_MAX_LENGTH}
              />
              <p className="text-xs text-muted-foreground">
                What students should practise. The AI will not show this to them.
              </p>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Generation failed</AlertTitle>
              <AlertDescription>
                {error}
                {traceId && <span className="mt-1 block text-xs opacity-80">Trace ID: {traceId}</span>}
              </AlertDescription>
            </Alert>
          )}

          {result ? (
            <div className="space-y-4">
              {suggestedTimeNotice && (
                <p className="text-sm text-foreground">
                  AI suggests {suggestedTimeNotice.suggested} minutes (default: {suggestedTimeNotice.default}).
                </p>
              )}
              {(appliedTheme || appliedSkillFocus) && (
                <div className="rounded-md border border-muted-foreground/20 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground/80">
                    Applied guidance
                  </p>
                  {appliedTheme && (
                    <p className="text-foreground">
                      <span className="font-medium">Theme:</span> {appliedTheme}
                    </p>
                  )}
                  {appliedSkillFocus && (
                    <p className="text-foreground">
                      <span className="font-medium">Skill focus:</span> {appliedSkillFocus}
                    </p>
                  )}
                </div>
              )}
              <div className="rounded-md border bg-muted/40">
                <div className="max-h-72 overflow-y-auto p-4">
                  <div className="prose prose-sm max-w-none text-foreground dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.promptText}</ReactMarkdown>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" onClick={handleUsePrompt} className="sm:w-auto">
                  Use this prompt
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={isLoading || exceedsLimit}
                  className="sm:w-auto"
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Generate again
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-between">
              <div className="text-xs text-muted-foreground">
                The AI will craft a full prompt using the selected exam context.
              </div>
              <Button type="button" onClick={handleGenerate} disabled={isLoading || !hasContext || exceedsLimit}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate
              </Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
