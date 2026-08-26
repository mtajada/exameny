import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Loader2, Printer, RefreshCcw } from 'lucide-react'
import { useAuth } from '@/contexts/useAuth.ts'
import {
  TaskConfigurationCard,
  type TaskConfigurationExamOption,
  type TaskConfigurationLevelOption,
  type TaskConfigurationTaskTypeOption,
} from '@/features/tasks/TaskConfigurationCard.tsx'
import { PromptComposerCard, type PromptAiInsertPayload } from '@/features/tasks/PromptComposerCard.tsx'
import { useExamOptions, useLevelOptions, useTaskTypeOptions } from '@/features/tasks/useTaskOptions.ts'
import { useAutoSelectSingleLevel } from '@/features/tasks/useAutoSelectSingleLevel.ts'
import { inferPreferredLevelCodeForExam } from '@/features/tasks/examLevelDefaults.ts'
import { isRuoeTaskCode } from '@/utils/exam-task-meta.ts'
import type { ExerciseData } from '@/types/ruoe.ts'
import type { RuoEAssignmentSummary } from '@/types/assignments.ts'
import {
  buildRuoEDocument,
  buildWritingDocument,
} from '@/features/printing/printModel.ts'
import type { ExerciseDataShape, PrintableDocument, PrintableDocumentMetadata } from '@/features/printing/types.ts'
import { PrintableExerciseDocument } from '@/features/printing/components/PrintableExerciseDocument.tsx'
import { PrintablePreview } from '@/features/printing/components/PrintablePreview.tsx'
import { PrintablePortal } from '@/features/printing/components/PrintablePortal.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx'

interface GeneratedRuoEContent {
  kind: 'ruoe'
  summary: RuoEAssignmentSummary
  preview: ExerciseData | null
  generatedAt: string | null
}

const adaptSummaryForPrint = (summary: RuoEAssignmentSummary, preview: ExerciseData | null): GeneratedRuoEContent => ({
  kind: 'ruoe',
  summary,
  preview,
  generatedAt: summary.generatedAt ?? null,
})

const CreatePrintExercisePage = () => {
  const navigate = useNavigate()
  const { role, isLoading } = useAuth()

  const isTeacherLike = role === 'teacher' || role === 'academy_admin'

  useEffect(() => {
    if (isLoading) return
    if (!isTeacherLike) {
      navigate('/dashboard', { replace: true })
    }
  }, [isLoading, isTeacherLike, navigate])

  const [selectedExamId, setSelectedExamId] = useState<string>('')
  const [selectedLevelId, setSelectedLevelId] = useState<string>('')
  const [selectedTaskTypeId, setSelectedTaskTypeId] = useState<string>('')
  const [autoAppliedLevelId, setAutoAppliedLevelId] = useState<string | null>(null)

  const [promptText, setPromptText] = useState<string>('')
  const [aiSuggestedTime, setAiSuggestedTime] = useState<number | null>(null)
  const [writingGeneratedAt, setWritingGeneratedAt] = useState<string | null>(null)
  const [selectedRuoESummary, setSelectedRuoESummary] = useState<RuoEAssignmentSummary | null>(null)
  const [ruoePreview, setRuoEPreview] = useState<ExerciseData | null>(null)
  const [generatedRuoEContent, setGeneratedRuoEContent] = useState<GeneratedRuoEContent | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true)

  const examsQuery = useExamOptions(!isLoading && Boolean(role))
  const exams: TaskConfigurationExamOption[] = useMemo(() => examsQuery.data ?? [], [examsQuery.data])
  const selectedExam = useMemo(
    () => (selectedExamId ? exams.find((exam) => String(exam.id) === selectedExamId) ?? null : null),
    [exams, selectedExamId],
  )
  const preferredLevelCode = useMemo(
    () => inferPreferredLevelCodeForExam(selectedExam?.code),
    [selectedExam?.code],
  )

  const selectedExamIdNumeric = selectedExamId ? Number(selectedExamId) : null
  const selectedLevelIdNumeric = selectedLevelId ? Number(selectedLevelId) : null

  const levelsQuery = useLevelOptions(selectedExamIdNumeric)
  const levels: TaskConfigurationLevelOption[] = useMemo(() => levelsQuery.data ?? [], [levelsQuery.data])

  const taskTypesQuery = useTaskTypeOptions(selectedExamIdNumeric, selectedLevelIdNumeric)
  const taskTypes: TaskConfigurationTaskTypeOption[] = useMemo(() => taskTypesQuery.data ?? [], [taskTypesQuery.data])

  const selectedTaskType = useMemo(
    () => taskTypes.find((task) => String(task.id) === selectedTaskTypeId) ?? null,
    [selectedTaskTypeId, taskTypes],
  )

  const isRuoeTask = useMemo(
    () => (selectedTaskType ? isRuoeTaskCode(selectedTaskType.taskCode) : false),
    [selectedTaskType],
  )

  const activeTeacherTheme = useMemo(() => {
    const generatedTheme = generatedRuoEContent?.summary?.teacherTheme?.trim()
    if (generatedTheme && generatedTheme.length > 0) {
      return generatedTheme
    }
    const summaryTheme = selectedRuoESummary?.teacherTheme?.trim()
    return summaryTheme && summaryTheme.length > 0 ? summaryTheme : null
  }, [generatedRuoEContent, selectedRuoESummary])

  const activeTeacherSkillFocus = useMemo(() => {
    const generatedSkill = generatedRuoEContent?.summary?.teacherSkillFocus?.trim()
    if (generatedSkill && generatedSkill.length > 0) {
      return generatedSkill
    }
    const summarySkill = selectedRuoESummary?.teacherSkillFocus?.trim()
    return summarySkill && summarySkill.length > 0 ? summarySkill : null
  }, [generatedRuoEContent, selectedRuoESummary])

  useEffect(() => {
    setIncludeAnswerKey(isRuoeTask)
  }, [isRuoeTask])

  const resetGeneratedState = useCallback(() => {
    setPromptText('')
    setAiSuggestedTime(null)
    setWritingGeneratedAt(null)
    setSelectedRuoESummary(null)
    setRuoEPreview(null)
    setGeneratedRuoEContent(null)
    setErrorMessage(null)
  }, [])

  const handleExamSelect = useCallback(
    (value: string) => {
      setSelectedExamId(value)
      setSelectedLevelId('')
      setSelectedTaskTypeId('')
      setAutoAppliedLevelId(null)
      resetGeneratedState()
    },
    [resetGeneratedState],
  )

  const handleLevelSelect = useCallback(
    (value: string) => {
      setSelectedLevelId(value)
      setSelectedTaskTypeId('')
      setAutoAppliedLevelId(null)
      resetGeneratedState()
    },
    [resetGeneratedState],
  )

  const handleTaskTypeSelect = useCallback(
    (value: string) => {
      setSelectedTaskTypeId(value)
      resetGeneratedState()
    },
    [resetGeneratedState],
  )

  const handlePromptTextChange = useCallback(
    (value: string) => {
      setPromptText(value)
      if (isRuoeTask) return

      const trimmed = value.trim()
      if (!trimmed) {
        setWritingGeneratedAt(null)
        setAiSuggestedTime(null)
        return
      }

      setWritingGeneratedAt(new Date().toISOString())
    },
    [isRuoeTask, setAiSuggestedTime, setPromptText, setWritingGeneratedAt],
  )

  const handleAiInsert = useCallback(
    ({ value, suggestedTimeMinutes }: PromptAiInsertPayload) => {
      setPromptText(value)
      const normalizedSuggestedTime =
        typeof suggestedTimeMinutes === 'number' ? suggestedTimeMinutes : null
      setAiSuggestedTime(normalizedSuggestedTime)
      setWritingGeneratedAt(value.trim() ? new Date().toISOString() : null)
      setSelectedRuoESummary(null)
      setRuoEPreview(null)
      setGeneratedRuoEContent(null)
      setErrorMessage(null)
    },
    [setAiSuggestedTime, setGeneratedRuoEContent, setPromptText, setRuoEPreview, setSelectedRuoESummary, setWritingGeneratedAt, setErrorMessage],
  )

  const handleRuoESelect = useCallback(
    (summary: RuoEAssignmentSummary, preview: ExerciseData | null) => {
      setSelectedRuoESummary(summary)
      setRuoEPreview(preview)
      const normalized = adaptSummaryForPrint(summary, preview)
      setGeneratedRuoEContent({
        ...normalized,
        generatedAt: normalized.generatedAt ?? new Date().toISOString(),
      })
      setErrorMessage(null)
    },
    [],
  )

  const handleClearRuoE = useCallback(() => {
    setSelectedRuoESummary(null)
    setRuoEPreview(null)
    setGeneratedRuoEContent(null)
  }, [])

  const examName = selectedExamId ? exams.find((exam) => String(exam.id) === selectedExamId)?.name : undefined
  const levelName = selectedLevelId ? levels.find((level) => String(level.id) === selectedLevelId)?.name : undefined

  const answerKeyAvailable = Boolean(generatedRuoEContent)

  const handleAutoSelectSingleLevel = useCallback(
    (levelId: string) => {
      setSelectedLevelId(levelId)
      setSelectedTaskTypeId('')
    },
    [setSelectedLevelId, setSelectedTaskTypeId],
  )

  useAutoSelectSingleLevel({
    levels,
    selectedExamId,
    selectedLevelId,
    guardActive: Boolean(selectedRuoESummary),
    preferredLevelCode,
    autoAppliedLevelId,
    setAutoAppliedLevelId,
    onAutoSelectLevel: handleAutoSelectSingleLevel,
  })

  const printableDocument = useMemo<PrintableDocument | null>(() => {
    const taskCodeSource =
      selectedTaskType?.taskCode ??
      generatedRuoEContent?.summary.taskCode ??
      selectedRuoESummary?.taskCode ??
      null

    if (!taskCodeSource) return null

    const baseMetadata: PrintableDocumentMetadata = {
      examName: examName ?? 'Exam',
      taskName: isRuoeTask
        ? generatedRuoEContent?.summary.title ??
          selectedRuoESummary?.title ??
          selectedRuoESummary?.taskName ??
          selectedTaskType?.name ??
          null
        : selectedTaskType?.name ?? null,
      taskCode: taskCodeSource,
      generatedAt: null,
    }

    if (isRuoeTask) {
      if (!generatedRuoEContent || !ruoePreview) return null

      const exerciseShape = adaptExerciseDataForPrint(ruoePreview)
      return buildRuoEDocument({
        metadata: {
          ...baseMetadata,
          generatedAt: generatedRuoEContent.generatedAt ?? new Date().toISOString(),
        },
        summary: {
          questionCount: generatedRuoEContent.summary.questionCount ?? exerciseShape.questions.length,
          title:
            generatedRuoEContent.summary.title ??
            exerciseShape.exercise.title ??
            null,
          taskCode: taskCodeSource,
          teacherTheme: generatedRuoEContent.summary.teacherTheme ?? null,
          teacherSkillFocus: generatedRuoEContent.summary.teacherSkillFocus ?? null,
        },
        exerciseData: exerciseShape,
      })
    }

    if (!promptText.trim()) return null

    return buildWritingDocument({
      metadata: {
        ...baseMetadata,
        generatedAt: writingGeneratedAt ?? new Date().toISOString(),
      },
      prompt: promptText,
      suggestedTime: aiSuggestedTime ?? null,
    })
  }, [
    aiSuggestedTime,
    examName,
    isRuoeTask,
    promptText,
    generatedRuoEContent,
    ruoePreview,
    selectedRuoESummary,
    selectedTaskType,
    writingGeneratedAt,
  ])

  const handlePrint = useCallback(() => {
    if (!printableDocument) return
    setTimeout(() => {
      globalThis.print()
    }, 150)
  }, [printableDocument])

  const configurationLoading = examsQuery.isPending || levelsQuery.isPending || taskTypesQuery.isPending
  const composerDisabled = !selectedTaskType || configurationLoading

  if (isLoading || !isTeacherLike) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <Card className="border border-transparent bg-transparent shadow-none">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-3xl font-bold text-foreground">Create &amp; Print Exercise</CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Generate fresh writing prompts or Reading &amp; Use of English exercises and prepare a printable worksheet in minutes.
            </CardDescription>
          </CardHeader>
        </Card>
      </header>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertTitle>Generation issue</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <TaskConfigurationCard
        exams={exams}
        levels={levels}
        taskTypes={taskTypes}
        selectedTaskType={selectedTaskType}
        selectedExamId={selectedExamId}
        onSelectExam={handleExamSelect}
        selectedLevelId={selectedLevelId}
        onSelectLevel={handleLevelSelect}
        selectedTaskTypeId={selectedTaskTypeId}
        onSelectTask={handleTaskTypeSelect}
        loading={{
          exams: examsQuery.isPending,
          levels: levelsQuery.isPending,
          tasks: taskTypesQuery.isPending,
        }}
        attachedExerciseSummary={selectedRuoESummary}
        copy={{
          heading: {
            stepLabel: '1.',
            title: 'Choose Exercise Context',
            description: 'Select the exam, level, and task you want to generate in a printable format.',
          },
          placeholders: {
            exam: 'Select exam',
            level: 'Select level',
            task: 'Select task',
          },
        }}
      />

      <PromptComposerCard
        promptText={promptText}
        onPromptChange={handlePromptTextChange}
        examName={examName}
        examId={selectedExamIdNumeric}
        levelName={levelName}
        levelId={selectedLevelIdNumeric}
        taskType={selectedTaskType}
        currentPrompt={promptText}
        disabled={composerDisabled}
        onTextTranscribed={handlePromptTextChange}
        onAiInsert={handleAiInsert}
        aiSuggestedTime={aiSuggestedTime}
        ruoeExercise={selectedRuoESummary}
        onSelectRuoEExercise={handleRuoESelect}
        onClearRuoEExercise={handleClearRuoE}
        showUploader={false}
        allowManualPromptEditing={!isRuoeTask}
        copy={{
          heading: {
            stepLabel: '2.',
            writingTitle: 'Generate Printable Prompt',
            writingDescription:
              'Use the AI assistant or write it yourself. Edit the prompt anytime and the printable preview updates instantly.',
            ruoeTitle: 'Generate R&UoE Exercise',
            ruoeDescription: 'Create a fresh Reading & Use of English worksheet ready for printing.',
          },
          writing: {
            promptLabel: 'Worksheet prompt',
            readOnlyHelperText: 'This prompt is read-only in the print builder. Use Regenerate to refresh the printable version.',
            editableHelperText: 'Type or tweak the instructions here. The printable preview reflects every change automatically.',
            ruoeHelperText: 'Regenerate the exercise to update the printable worksheet.',
            aiSuggestedTimeIntro: 'AI suggests',
          },
        }}
        regenerateHint={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            Regenerate with AI for a fresh draft or edit the prompt below—the printable output always matches.
          </div>
        }
        ruoeGeneratorMode="print"
      />

      {isRuoeTask && (activeTeacherTheme || activeTeacherSkillFocus) && (
        <Card className="border border-dashed border-muted-foreground/50 bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Teacher Guidance</CardTitle>
            <CardDescription className="text-xs">
              These notes stay hidden from students; they are embedded implicitly in the generated exercise.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-foreground">
            {activeTeacherTheme && (
              <p>
                <span className="font-medium">Theme:</span> {activeTeacherTheme}
              </p>
            )}
            {activeTeacherSkillFocus && (
              <p>
                <span className="font-medium">Skill focus:</span> {activeTeacherSkillFocus}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Printable Preview</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Preview updates automatically whenever you generate a new exercise.
            </CardDescription>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Switch
                checked={includeAnswerKey}
                onCheckedChange={(checked) => setIncludeAnswerKey(checked)}
                disabled={!answerKeyAvailable}
                id="include-answer-key"
              />
              <Label htmlFor="include-answer-key" className="flex items-center gap-1 text-sm">
                Include answer key
                {!answerKeyAvailable && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground">(R&amp;UoE only)</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Answer keys are only available for Reading &amp; Use of English exercises.
                    </TooltipContent>
                  </Tooltip>
                )}
              </Label>
            </div>
            <Button onClick={handlePrint} disabled={!printableDocument} className="gap-2">
              <Printer className="h-4 w-4" /> Visualize &amp; Print
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {printableDocument ? (
            <div className="printable-preview-container">
              <PrintablePreview document={printableDocument} includeAnswerKey={includeAnswerKey} />
            </div>
          ) : (
            <div className="printable-preview-empty text-sm">
              Generate a writing prompt or Reading &amp; Use of English exercise to view the printable layout.
            </div>
          )}
        </CardContent>
      </Card>

      {printableDocument && (
        <PrintablePortal>
          <PrintableExerciseDocument
            document={printableDocument}
            includeAnswerKey={includeAnswerKey}
            mode="print"
          />
        </PrintablePortal>
      )}
    </div>
  )
}

const adaptExerciseDataForPrint = (data: ExerciseData): ExerciseDataShape => {
  const contentText =
    'content_text' in data.exercise
      ? (data.exercise as { content_text: string | null }).content_text
      : 'main_text_with_placeholders' in data.exercise
        ? (data.exercise as { main_text_with_placeholders: string | null }).main_text_with_placeholders
        : null

  return {
    exercise: {
      id: data.exercise.id,
      title: data.exercise.title ?? null,
      content_text: contentText,
      created_at: data.exercise.created_at ?? null,
      teacher_theme: data.exercise.teacher_theme ?? null,
      teacher_skill_focus: data.exercise.teacher_skill_focus ?? null,
    },
    questions: data.questions.map((question) => ({
      id: question.id,
      exercise_id: question.exercise_id,
      order: question.order,
      question_text: question.question_text ?? null,
      correct_answers: question.correct_answers ?? [],
      explanation: question.explanation ?? '',
      original_sentence: question.original_sentence ?? null,
      transformation_sentence: question.transformation_sentence ?? null,
    })),
    options: data.options.map((option) => ({
      id: option.id,
      question_id: option.question_id,
      option_letter: option.option_letter,
      option_text: option.option_text,
      is_correct: option.is_correct,
    })),
    taskType: {
      id: data.taskType.id,
      name: data.taskType.name,
      task_code: data.taskType.task_code,
      description: data.taskType.description,
    },
    displayOrderByQuestionId: data.displayOrderByQuestionId,
  }
}

export default CreatePrintExercisePage
