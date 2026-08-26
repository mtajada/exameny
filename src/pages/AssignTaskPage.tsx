import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/useAuth.ts'
import { useToast } from '@/components/ui/use-toast.ts'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { cn } from '@/lib/utils.ts'
import { Loader2, Search, Users } from 'lucide-react'
import MobileActionBar, { MobileActionSpacer } from '@/components/common/MobileActionBar.tsx'
import useTeacherClasses, { type TeacherClass } from '@/hooks/teacher/useTeacherClasses.ts'
import useTeacherRoster, { type TeacherStudent } from '@/hooks/teacher/useTeacherRoster.ts'
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
import { AssignmentDraft, type SelectionFilters, type SelectionMode, type RuoEAssignmentSummary } from '@/types/assignments.ts'

type ExamOption = TaskConfigurationExamOption

type LevelOption = TaskConfigurationLevelOption

type TaskTypeOption = TaskConfigurationTaskTypeOption

interface AssignTaskLocationState {
  ruoeGenerated?: {
    exerciseId: number
    taskTypeId: number
    examId: number
    levelId: number
    taskCode?: string | null
    taskName?: string | null
    title?: string | null
    questionCount?: number | null
    generatedAt?: string | null
    teacherTheme?: string | null
    teacherSkillFocus?: string | null
    existingExerciseId?: number | null
  }
  assignmentDraft?: AssignmentDraft | null
}

type AiInsertPayload = PromptAiInsertPayload

interface ClassSummary extends TeacherClass {
  students: TeacherStudent[]
  homogeneousExamId: number | null
  homogeneousExamName: string | null
  homogeneousLevelId: number | null
  homogeneousLevelName: string | null
}

type SelectionChangeKind = 'exam' | 'level' | 'taskType'

interface PendingSelectionChange {
  kind: SelectionChangeKind
  nextValue: string
  label: string | null
}

const DEFAULT_FILTER = 'all'

const AssignTaskPage = () => {
  const navigate = useNavigate()
  const location = useLocation() as ReturnType<typeof useLocation> & { state?: AssignTaskLocationState }
  const { toast } = useToast()
  const { user, role, activeAcademyId, isLoading } = useAuth()

  const academyId = activeAcademyId
  const teacherId = user?.id
  const isTeacher = role === 'teacher'

  useEffect(() => {
    if (!isLoading && !isTeacher) {
      navigate('/dashboard')
    }
  }, [isLoading, isTeacher, navigate])

  const {
    students,
    loading: studentsLoading,
    error: studentsError,
    refetch: refetchStudents,
  } = useTeacherRoster(isTeacher)

  const {
    classes: teacherClasses,
    loading: classesLoading,
    error: classesError,
    refetch: refetchClasses,
  } = useTeacherClasses(isTeacher)

  const [selectionMode, setSelectionMode] = useState<SelectionMode>('individual')
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<SelectionFilters>({ search: '', exam: DEFAULT_FILTER })
  const [promptText, setPromptText] = useState<string>('')
  const [aiSuggestedTime, setAiSuggestedTime] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [selectedRuoEExercise, setSelectedRuoEExercise] = useState<RuoEAssignmentSummary | null>(null)
  const clearAttachedExercise = useCallback(() => {
    setSelectedRuoEExercise(null)
    setAiSuggestedTime(null)
  }, [])
  const clearComposerState = useCallback(() => {
    clearAttachedExercise()
    setPromptText('')
  }, [clearAttachedExercise])

  const [selectedExamId, setSelectedExamId] = useState<string>('')
  const [selectedLevelId, setSelectedLevelId] = useState<string>('')
  const [selectedTaskTypeId, setSelectedTaskTypeId] = useState<string>('')
  const [pendingSelectionChange, setPendingSelectionChange] = useState<PendingSelectionChange | null>(null)
  const [autoAppliedExamId, setAutoAppliedExamId] = useState<string | null>(null)
  const [autoAppliedLevelId, setAutoAppliedLevelId] = useState<string | null>(null)
  const classAutofillGuardRef = useRef(false)

  const hydrateFromDraft = useCallback((draft: AssignmentDraft) => {
    if (!draft) return
    if (draft.selectionMode === 'class') {
      classAutofillGuardRef.current = true
    }
    setSelectionMode(draft.selectionMode ?? 'individual')
    setSelectedClassId(draft.selectedClassId ?? '')
    setSelectedStudentIds(new Set(draft.selectedStudentIds ?? []))
    setFilters(draft.filters ?? { search: '', exam: DEFAULT_FILTER })
    setPromptText(draft.promptText ?? '')
    setAiSuggestedTime(typeof draft.aiSuggestedTime === 'number' ? draft.aiSuggestedTime : null)
    setSelectedExamId(draft.selectedExamId ?? '')
    setSelectedLevelId(draft.selectedLevelId ?? '')
    setSelectedTaskTypeId(draft.selectedTaskTypeId ?? '')
    const draftRuoE = draft.ruoeExercise
    if (
      draftRuoE &&
      typeof draftRuoE.taskTypeId === 'number' &&
      typeof draftRuoE.examId === 'number' &&
      typeof draftRuoE.levelId === 'number'
    ) {
      setSelectedRuoEExercise(draftRuoE)
    } else {
      setSelectedRuoEExercise(null)
    }
    setAutoAppliedExamId(null)
    setAutoAppliedLevelId(null)
  }, [])

  const _createAssignmentDraft = useCallback((): AssignmentDraft => ({
    selectionMode,
    selectedClassId,
    selectedStudentIds: Array.from(selectedStudentIds),
    filters: { ...filters },
    promptText,
    aiSuggestedTime,
    selectedExamId,
    selectedLevelId,
    selectedTaskTypeId,
    ruoeExercise: selectedRuoEExercise,
    teacherTheme: selectedRuoEExercise?.teacherTheme ?? null,
    teacherSkillFocus: selectedRuoEExercise?.teacherSkillFocus ?? null,
  }), [filters, promptText, aiSuggestedTime, selectedRuoEExercise, selectedClassId, selectedExamId, selectedLevelId, selectedStudentIds, selectedTaskTypeId, selectionMode])

  const examsQuery = useExamOptions(isTeacher && Boolean(academyId))
  const selectedExamIdNumeric = selectedExamId ? Number(selectedExamId) : null
  const selectedLevelIdNumeric = selectedLevelId ? Number(selectedLevelId) : null
  const levelsQuery = useLevelOptions(selectedExamIdNumeric)
  const taskTypesQuery = useTaskTypeOptions(selectedExamIdNumeric, selectedLevelIdNumeric)

  useEffect(() => {
    const state = location.state as AssignTaskLocationState | undefined
    if (!state) return

    if (state.assignmentDraft) {
      hydrateFromDraft(state.assignmentDraft)
    }

    const ruoePayload = state.ruoeGenerated
    if (ruoePayload) {
      const examIdString = String(ruoePayload.examId)
      const levelIdString = String(ruoePayload.levelId)
      const taskTypeIdString = String(ruoePayload.taskTypeId)
      setSelectedExamId(examIdString)
      setSelectedLevelId(levelIdString)
      setSelectedTaskTypeId(taskTypeIdString)
      clearComposerState()
      setSelectedRuoEExercise({
        exerciseId: ruoePayload.exerciseId,
        taskTypeId: ruoePayload.taskTypeId,
        examId: ruoePayload.examId,
        levelId: ruoePayload.levelId,
        taskName: ruoePayload.taskName ?? null,
        taskCode: ruoePayload.taskCode ?? null,
        title: ruoePayload.title ?? null,
        questionCount: ruoePayload.questionCount ?? null,
        generatedAt: ruoePayload.generatedAt ?? null,
        teacherTheme: ruoePayload.teacherTheme ?? null,
        teacherSkillFocus: ruoePayload.teacherSkillFocus ?? null,
      })
    }

    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null })
  }, [clearComposerState, hydrateFromDraft, location.hash, location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    if (!selectedExamId) {
      setSelectedLevelId('')
      setSelectedTaskTypeId('')
      setSelectedRuoEExercise(null)
    }
  }, [selectedExamId])

  useEffect(() => {
    if (!selectedLevelId) {
      setSelectedTaskTypeId('')
      setSelectedRuoEExercise(null)
    }
  }, [selectedLevelId])

  useEffect(() => {
    setAiSuggestedTime(null)
  }, [selectedTaskTypeId])

  useEffect(() => {
    if (!selectedRuoEExercise) return
    const summaryExamId = String(selectedRuoEExercise.examId)
    const summaryLevelId = String(selectedRuoEExercise.levelId)
    const summaryTaskTypeId = String(selectedRuoEExercise.taskTypeId)

    if (selectedExamId !== summaryExamId) {
      setSelectedExamId(summaryExamId)
    }
    if (selectedLevelId !== summaryLevelId) {
      setSelectedLevelId(summaryLevelId)
    }
    if (selectedTaskTypeId !== summaryTaskTypeId) {
      setSelectedTaskTypeId(summaryTaskTypeId)
    }
  }, [selectedExamId, selectedLevelId, selectedRuoEExercise, selectedTaskTypeId])

  const classSummaries = useMemo<ClassSummary[]>(() => computeClassSummaries(teacherClasses, students), [teacherClasses, students])

  const selectedClassSummary = useMemo(() => {
    if (!selectedClassId) return null
    return classSummaries.find((cls) => String(cls.id) === selectedClassId) ?? null
  }, [classSummaries, selectedClassId])

  useEffect(() => {
    if (selectionMode !== 'class' || !selectedClassSummary) return
    setSelectedStudentIds((prev) => {
      if (classAutofillGuardRef.current) {
        classAutofillGuardRef.current = false
        return prev
      }
      return new Set(selectedClassSummary.students.map((student) => student.id))
    })
  }, [selectionMode, selectedClassSummary])

  const baseStudents = useMemo(
    () => (selectionMode === 'class' ? selectedClassSummary?.students ?? [] : students),
    [selectionMode, selectedClassSummary, students],
  )

  const filteredStudents = useMemo(() => filterStudents(baseStudents, filters), [baseStudents, filters])

  const totalAvailableStudents = baseStudents.length
  const visibleStudents = filteredStudents.length
  const selectedCount = selectedStudentIds.size

  const exams = useMemo(() => examsQuery.data ?? [], [examsQuery.data])
  const selectedExam = useMemo(
    () => (selectedExamId ? exams.find((exam) => String(exam.id) === selectedExamId) ?? null : null),
    [exams, selectedExamId],
  )
  const preferredLevelCode = useMemo(
    () => inferPreferredLevelCodeForExam(selectedExam?.code),
    [selectedExam?.code],
  )
  const levels = useMemo(() => levelsQuery.data ?? [], [levelsQuery.data])
  const taskTypes = useMemo(() => taskTypesQuery.data ?? [], [taskTypesQuery.data])
  const selectedTaskType = useMemo(() => {
    if (!selectedTaskTypeId) return null
    return taskTypes.find((task) => String(task.id) === selectedTaskTypeId) ?? null
  }, [selectedTaskTypeId, taskTypes])
  const effectiveTaskType = useMemo(() => {
    if (selectedTaskType) return selectedTaskType
    if (!selectedRuoEExercise) return null
    return {
      id: selectedRuoEExercise.taskTypeId,
      name: selectedRuoEExercise.taskName ?? 'Reading & Use of English task',
      taskCode: selectedRuoEExercise.taskCode ?? '',
      description: null,
      defaultTimeMinutes: null,
    }
  }, [selectedRuoEExercise, selectedTaskType])

  const hasAttachedExercise = Boolean(selectedRuoEExercise)
  const resolvedTaskTypeId = selectedTaskTypeId || (selectedRuoEExercise ? String(selectedRuoEExercise.taskTypeId) : '')

  useEffect(() => {
    if (!selectedTaskTypeId) {
      if (selectedRuoEExercise) {
        setSelectedRuoEExercise(null)
      }
      return
    }

    if (taskTypesQuery.isPending || taskTypesQuery.isFetching) {
      return
    }

    if (!selectedTaskType) {
      if (!selectedRuoEExercise || String(selectedRuoEExercise.taskTypeId) !== selectedTaskTypeId) {
        setSelectedRuoEExercise(null)
      }
      return
    }

    const isRuoE = isRuoeTaskCode(selectedTaskType.taskCode)
    if (!isRuoE) {
      setSelectedRuoEExercise(null)
      return
    }

    if (
      selectedRuoEExercise?.taskCode &&
      selectedRuoEExercise.taskCode !== selectedTaskType.taskCode
    ) {
      setSelectedRuoEExercise(null)
    }
  }, [
    selectedRuoEExercise,
    selectedTaskType,
    selectedTaskTypeId,
    taskTypesQuery.isFetching,
    taskTypesQuery.isPending,
  ])

  const applyExamSelection = useCallback(
    (value: string, clearComposer = false) => {
      if (clearComposer) {
        clearComposerState()
      } else {
        clearAttachedExercise()
      }
      setAutoAppliedExamId(null)
      setAutoAppliedLevelId(null)
      setSelectedExamId(value)
      setSelectedLevelId('')
      setSelectedTaskTypeId('')
    },
    [clearAttachedExercise, clearComposerState],
  )

  const applyLevelSelection = useCallback(
    (value: string, clearComposer = false) => {
      if (clearComposer) {
        clearComposerState()
      } else {
        clearAttachedExercise()
      }
      setAutoAppliedLevelId(null)
      setSelectedLevelId(value)
      setSelectedTaskTypeId('')
    },
    [clearAttachedExercise, clearComposerState],
  )

  const applyTaskTypeSelection = useCallback(
    (value: string, clearComposer = false) => {
      if (clearComposer) {
        clearComposerState()
      } else {
        clearAttachedExercise()
      }
      setSelectedTaskTypeId(value)
    },
    [clearAttachedExercise, clearComposerState],
  )

  const handleExamSelect = useCallback(
    (value: string) => {
      if (value === selectedExamId) return

      if (hasAttachedExercise) {
        const option = exams.find((exam) => String(exam.id) === value)
        setPendingSelectionChange({
          kind: 'exam',
          nextValue: value,
          label: option?.name ?? null,
        })
        return
      }

      applyExamSelection(value)
    },
    [applyExamSelection, exams, hasAttachedExercise, selectedExamId],
  )

  const handleLevelSelect = useCallback(
    (value: string) => {
      if (value === selectedLevelId) return

      if (hasAttachedExercise) {
        const option = levels.find((level) => String(level.id) === value)
        setPendingSelectionChange({
          kind: 'level',
          nextValue: value,
          label: option ? `${option.name}${option.code ? ` (${option.code})` : ''}` : null,
        })
        return
      }

      applyLevelSelection(value)
    },
    [applyLevelSelection, hasAttachedExercise, levels, selectedLevelId],
  )

  const handleTaskTypeSelect = useCallback(
    (value: string) => {
      if (value === selectedTaskTypeId) return

      const trimmedPrompt = promptText.trim()
      const hasComposerContent = trimmedPrompt.length > 0 || hasAttachedExercise
      if (hasComposerContent) {
        const option = taskTypes.find((task) => String(task.id) === value)
        setPendingSelectionChange({
          kind: 'taskType',
          nextValue: value,
          label: option?.name ?? null,
        })
        return
      }

      applyTaskTypeSelection(value)
    },
    [applyTaskTypeSelection, hasAttachedExercise, promptText, selectedTaskTypeId, taskTypes],
  )

  const handleCancelSelectionChange = useCallback(() => {
    setPendingSelectionChange(null)
  }, [])

  const handleConfirmSelectionChange = useCallback(() => {
    if (!pendingSelectionChange) return

    if (pendingSelectionChange.kind === 'exam') {
      applyExamSelection(pendingSelectionChange.nextValue, true)
    } else if (pendingSelectionChange.kind === 'level') {
      applyLevelSelection(pendingSelectionChange.nextValue, true)
    } else {
      applyTaskTypeSelection(pendingSelectionChange.nextValue, true)
    }

    setPendingSelectionChange(null)
  }, [applyExamSelection, applyLevelSelection, applyTaskTypeSelection, pendingSelectionChange])

  const studentIndex = useMemo(() => {
    const map = new Map<string, TeacherStudent>()
    students.forEach((student) => {
      map.set(student.id, student)
    })
    classSummaries.forEach((cls) => {
      cls.students.forEach((student) => {
        map.set(student.id, student)
      })
    })
    return map
  }, [students, classSummaries])

  const selectedStudents = useMemo(() => {
    if (selectedStudentIds.size === 0) return []
    const list: TeacherStudent[] = []
    selectedStudentIds.forEach((studentId) => {
      const student = studentIndex.get(studentId)
      if (student) list.push(student)
    })
    return list
  }, [selectedStudentIds, studentIndex])

  const { homogeneousExamId, homogeneousLevelId } = useMemo(() => {
    if (selectedStudents.length === 0) {
      return { homogeneousExamId: null as number | null, homogeneousLevelId: null as number | null }
    }

    let examId: number | null = null
    let levelId: number | null = null
    let examHomogeneous = true
    let levelHomogeneous = true

    for (const student of selectedStudents) {
      const currentExam = student.targetExamId
      const currentLevel = student.targetLevelId

      if (currentExam === null || (examId !== null && currentExam !== examId)) {
        examHomogeneous = false
      } else if (examId === null) {
        examId = currentExam
      }

      if (currentLevel === null || (levelId !== null && currentLevel !== levelId)) {
        levelHomogeneous = false
      } else if (levelId === null) {
        levelId = currentLevel
      }
    }

    return {
      homogeneousExamId: examHomogeneous ? examId : null,
      homogeneousLevelId: levelHomogeneous ? levelId : null,
    }
  }, [selectedStudents])

  useEffect(() => {
    if (selectedRuoEExercise) return
    if (!homogeneousExamId) {
      setAutoAppliedExamId(null)
      return
    }

    const homogeneousExamIdString = String(homogeneousExamId)
    const shouldApplyExam = !selectedExamId || selectedExamId === autoAppliedExamId

    if (shouldApplyExam && selectedExamId !== homogeneousExamIdString) {
      setSelectedExamId(homogeneousExamIdString)
      setSelectedLevelId('')
      setSelectedTaskTypeId('')
      setAutoAppliedExamId(homogeneousExamIdString)
      setAutoAppliedLevelId(null)
    } else if (shouldApplyExam) {
      setAutoAppliedExamId(homogeneousExamIdString)
    }
  }, [autoAppliedExamId, homogeneousExamId, selectedExamId, selectedRuoEExercise])

  useEffect(() => {
    if (selectedRuoEExercise) return
    if (!homogeneousLevelId || !homogeneousExamId) {
      if (!homogeneousLevelId) {
        setAutoAppliedLevelId(null)
      }
      return
    }

    const homogeneousLevelIdString = String(homogeneousLevelId)
    const homogeneousExamIdString = String(homogeneousExamId)
    const matchesExam = selectedExamId === homogeneousExamIdString
    const shouldApplyLevel = matchesExam && (!selectedLevelId || selectedLevelId === autoAppliedLevelId)

    if (shouldApplyLevel && selectedLevelId !== homogeneousLevelIdString) {
      setSelectedLevelId(homogeneousLevelIdString)
      setSelectedTaskTypeId('')
      setAutoAppliedLevelId(homogeneousLevelIdString)
    } else if (shouldApplyLevel) {
      setAutoAppliedLevelId(homogeneousLevelIdString)
    }
  }, [autoAppliedLevelId, homogeneousExamId, homogeneousLevelId, selectedExamId, selectedLevelId, selectedRuoEExercise])

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
    guardActive: Boolean(selectedRuoEExercise),
    preferredLevelCode,
    autoAppliedLevelId,
    setAutoAppliedLevelId,
    onAutoSelectLevel: handleAutoSelectSingleLevel,
  })

  const assignMutation = useMutation({
    mutationFn: async (payload: {
      studentIds: string[]
      taskTypeId: number
      prompt?: string | null
      ruoeExerciseId?: number | null
    }) => {
      if (!teacherId) throw new Error('Unable to determine teacher session.')

      const rows = payload.studentIds.map((studentId) => {
        const membershipId = studentIndex.get(studentId)?.membershipId
        if (!membershipId) {
          throw new Error('Unable to resolve student membership. Please refresh and try again.')
        }

        return {
          teacher_id: teacherId,
          student_id: studentId,
          student_membership_id: membershipId,
          task_type_id: payload.taskTypeId,
          prompt_text: payload.prompt ?? null,
          ruoe_exercise_id: payload.ruoeExerciseId ?? null,
          status: 'pending',
        }
      })

      const { error } = await supabase.from('assigned_prompts').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: (count) => {
      toast({ title: 'Task assigned', description: `Assigned to ${count} student${count === 1 ? '' : 's'}.` })
      clearComposerState()
      setSelectedStudentIds(new Set())
      setSelectedExamId('')
      setSelectedLevelId('')
      setSelectedTaskTypeId('')
      setAutoAppliedExamId(null)
      setAutoAppliedLevelId(null)
      setFilters({ search: '', exam: DEFAULT_FILTER })
      setSelectedClassId('')
      void refetchStudents()
      void refetchClasses()
      navigate('/dashboard', { replace: true })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unable to assign the task. Please try again.'
      setFormError(message)
      toast({ title: 'Assignment failed', description: message, variant: 'destructive' })
    },
  })

  const handleSelectionModeChange = useCallback((mode: SelectionMode) => {
    setSelectionMode(mode)
    setSelectedStudentIds(new Set())
    if (mode === 'individual') {
      setSelectedClassId('')
    } else {
      setFilters({ search: '', exam: DEFAULT_FILTER })
    }
  }, [])

  const handleClassSelect = useCallback((classId: string) => {
    setSelectedClassId(classId)
    setFilters({ search: '', exam: DEFAULT_FILTER })
  }, [])

  const handleStudentToggle = useCallback((studentId: string, checked: boolean) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(studentId)
      } else {
        next.delete(studentId)
      }
      return next
    })
  }, [])

  const handleToggleAllVisible = useCallback(
    (checked: boolean) => {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev)
        if (!checked) {
          filteredStudents.forEach((student) => next.delete(student.id))
          return next
        }
        filteredStudents.forEach((student) => next.add(student.id))
        return next
      })
    },
    [filteredStudents],
  )

  const handleAssign = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!teacherId || !isTeacher) {
        toast({
          title: 'Authentication error',
          description: 'We could not verify your teacher session. Please sign in again.',
          variant: 'destructive',
        })
        return
      }

      if (selectedStudentIds.size === 0) {
        const message = 'Select at least one student before assigning the task.'
        setFormError(message)
        toast({ title: 'Selection required', description: message, variant: 'destructive' })
        return
      }

      if (!resolvedTaskTypeId) {
        const message = 'Select the task type that you want to assign.'
        setFormError(message)
        toast({ title: 'Task type required', description: message, variant: 'destructive' })
        return
      }

      const trimmedPrompt = promptText.trim()
      const hasRuoEExercise = Boolean(selectedRuoEExercise)

      if (!trimmedPrompt && !hasRuoEExercise) {
        const message = 'Provide instructions or generate an exercise before assigning.'
        setFormError(message)
        toast({ title: 'Content required', description: message, variant: 'destructive' })
        return
      }

      if (trimmedPrompt && hasRuoEExercise) {
        const message = 'Remove the RUoE exercise or clear the prompt before assigning.'
        setFormError(message)
        toast({ title: 'Conflicting content', description: message, variant: 'destructive' })
        return
      }

      setFormError(null)

      assignMutation.mutate({
        studentIds: Array.from(selectedStudentIds),
        taskTypeId: Number(resolvedTaskTypeId),
        prompt: trimmedPrompt || null,
        ruoeExerciseId: selectedRuoEExercise?.exerciseId ?? null,
      })
    },
    [
      assignMutation,
      isTeacher,
      promptText,
      resolvedTaskTypeId,
      selectedRuoEExercise,
      selectedStudentIds,
      teacherId,
      toast,
    ],
  )

  const handlePromptInputChange = useCallback((value: string) => {
    clearAttachedExercise()
    setPromptText(value)
  }, [clearAttachedExercise])

  const handleAiInsert = useCallback(({ value, suggestedTimeMinutes }: AiInsertPayload) => {
    const trimmedValue = value.trim()
    clearAttachedExercise()
    setPromptText(trimmedValue)

    if (typeof suggestedTimeMinutes === 'number' && Number.isFinite(suggestedTimeMinutes) && suggestedTimeMinutes > 0) {
      setAiSuggestedTime(Math.round(suggestedTimeMinutes))
    } else {
      setAiSuggestedTime(null)
    }
  }, [clearAttachedExercise])

  const handleOcrAppend = useCallback((text: string) => {
    clearAttachedExercise()
    setPromptText((prev) => {
      const trimmedPrevious = prev.trim()
      const trimmedNew = text.trim()
      if (!trimmedPrevious) {
        return trimmedNew
      }
      return `${trimmedPrevious}\n\n${trimmedNew}`.trim()
    })
  }, [clearAttachedExercise])

  const handleClearRuoEExercise = useCallback(() => {
    clearComposerState()
  }, [clearComposerState])

  const handleRuoEExerciseSelect = useCallback((summary: RuoEAssignmentSummary) => {
    clearComposerState()
    setSelectedRuoEExercise(summary)
  }, [clearComposerState])

  const hasPromptContent = Boolean(promptText.trim())
  const canSubmit =
    selectedStudentIds.size > 0 &&
    Boolean(resolvedTaskTypeId) &&
    (hasPromptContent || Boolean(selectedRuoEExercise)) &&
    !assignMutation.isPending

  const allVisibleSelected =
    filteredStudents.length > 0 && filteredStudents.every((student) => selectedStudentIds.has(student.id))
  const partiallySelected = !allVisibleSelected && filteredStudents.some((student) => selectedStudentIds.has(student.id))

  const pendingChangeDialogCopy = useMemo(() => {
    if (!pendingSelectionChange) return null

    const { kind, label } = pendingSelectionChange
    const changeLabel = kind === 'taskType' ? 'task type' : kind
    const targetLabel =
      label ??
      (kind === 'taskType'
        ? 'this task type'
        : kind === 'exam'
          ? 'this exam'
          : 'this level')

    const reasons: string[] = []
    if (hasAttachedExercise) {
      reasons.push('the Reading & Use of English exercise you selected')
    }
    if (hasPromptContent) {
      reasons.push('the prompt you already prepared')
    }

    const reasonText =
      reasons.length === 0
        ? 'the current content'
        : reasons.length === 1
          ? reasons[0]
          : `${reasons[0]} and ${reasons[1]}`

    const title =
      kind === 'taskType'
        ? 'Clear current assignment content?'
        : `Change ${changeLabel} and clear current content?`
    const description = `Switching to ${targetLabel} will clear ${reasonText}. Do you want to continue?`
    const confirmLabel =
      kind === 'taskType'
        ? 'Clear and change task type'
        : `Clear and change ${changeLabel}`

    return {
      title,
      description,
      confirmLabel,
    }
  }, [hasAttachedExercise, hasPromptContent, pendingSelectionChange])

  return (
    <div className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
      <SectionHeaderBlock />

      {(studentsError || classesError || formError) && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            {studentsError && <div>{studentsError}</div>}
            {classesError && <div>{classesError}</div>}
            {formError && <div>{formError}</div>}
          </AlertDescription>
        </Alert>
      )}

      <form id="assign-task-form" onSubmit={handleAssign} className="space-y-8">
        <StudentSelectionCard
          mode={selectionMode}
          onModeChange={handleSelectionModeChange}
          classSummaries={classSummaries}
          selectedClassId={selectedClassId}
          onClassSelect={handleClassSelect}
          filters={filters}
          onFiltersChange={setFilters}
          studentsLoading={studentsLoading}
          classesLoading={classesLoading}
          exams={exams}
          students={filteredStudents}
          totalAvailable={totalAvailableStudents}
          visibleCount={visibleStudents}
          selectedCount={selectedCount}
          selectedStudentIds={selectedStudentIds}
          onStudentToggle={handleStudentToggle}
          onToggleAllVisible={handleToggleAllVisible}
          allVisibleSelected={allVisibleSelected}
          partiallySelected={partiallySelected}
        />

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
          attachedExerciseSummary={selectedRuoEExercise}
        />

        <PromptComposerCard
          promptText={promptText}
          onPromptChange={handlePromptInputChange}
          examName={exams.find((exam) => String(exam.id) === selectedExamId)?.name}
          examId={selectedExamIdNumeric}
          levelName={levels.find((level) => String(level.id) === selectedLevelId)?.name}
          levelId={selectedLevelIdNumeric}
          taskType={effectiveTaskType}
          currentPrompt={promptText}
          disabled={!resolvedTaskTypeId || assignMutation.isPending}
          onTextTranscribed={handleOcrAppend}
          onAiInsert={handleAiInsert}
          aiSuggestedTime={aiSuggestedTime}
          onShowToast={toast}
          ruoeExercise={selectedRuoEExercise}
          onSelectRuoEExercise={handleRuoEExerciseSelect}
          onClearRuoEExercise={handleClearRuoEExercise}
          ruoeGeneratorMode="assign"
        />

        <div className="hidden md:block">
          <Button type="submit" size="lg" disabled={!canSubmit} className="w-full">
            {assignMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Assigning…
              </>
            ) : (
              `Assign to ${selectedCount} student${selectedCount === 1 ? '' : 's'}`
            )}
          </Button>
        </div>
      </form>

      <MobileActionSpacer />

      <MobileActionBar>
        <Button type="submit" form="assign-task-form" size="touch" disabled={!canSubmit} className="w-full">
          {assignMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Assigning…
            </>
          ) : (
            `Assign to ${selectedCount} student${selectedCount === 1 ? '' : 's'}`
          )}
        </Button>
      </MobileActionBar>

      <AlertDialog
        open={Boolean(pendingSelectionChange)}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelSelectionChange()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingChangeDialogCopy?.title ?? 'Clear current assignment content?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingChangeDialogCopy?.description ??
                'Changing this setting will remove the prompt or generated exercise you already prepared. Do you want to continue?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelSelectionChange}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSelectionChange} disabled={!pendingSelectionChange}>
              {pendingChangeDialogCopy?.confirmLabel ?? 'Clear and continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SectionHeaderBlock() {
  return (
    <div>
      <Card className="border border-transparent bg-transparent shadow-none">
        <CardHeader className="px-0 pb-2 pt-0">
          <CardTitle className="text-3xl font-bold text-foreground">Assign New Task</CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Select the students, configure the task, and craft the prompt in one streamlined flow.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

interface StudentSelectionCardProps {
  mode: SelectionMode
  onModeChange: (mode: SelectionMode) => void
  classSummaries: ClassSummary[]
  selectedClassId: string
  onClassSelect: (classId: string) => void
  filters: SelectionFilters
  onFiltersChange: (next: SelectionFilters) => void
  studentsLoading: boolean
  classesLoading: boolean
  exams: ExamOption[]
  students: TeacherStudent[]
  totalAvailable: number
  visibleCount: number
  selectedCount: number
  selectedStudentIds: Set<string>
  onStudentToggle: (studentId: string, checked: boolean) => void
  onToggleAllVisible: (checked: boolean) => void
  allVisibleSelected: boolean
  partiallySelected: boolean
}

function StudentSelectionCard({
  mode,
  onModeChange,
  classSummaries,
  selectedClassId,
  onClassSelect,
  filters,
  onFiltersChange,
  studentsLoading,
  classesLoading,
  exams,
  students,
  totalAvailable,
  visibleCount,
  selectedCount,
  selectedStudentIds,
  onStudentToggle,
  onToggleAllVisible,
  allVisibleSelected,
  partiallySelected,
}: StudentSelectionCardProps) {
  const handleFilters = (patch: Partial<SelectionFilters>) => {
    onFiltersChange({ ...filters, ...patch })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <Users className="h-5 w-5 text-blue-600" />
          1. Select Students
        </CardTitle>
        <CardDescription>
          Choose individual learners or pick one of your classes. Filters and search adapt automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={mode} onValueChange={(value) => onModeChange(value as SelectionMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="individual">Individual</TabsTrigger>
            <TabsTrigger value="class">By class</TabsTrigger>
          </TabsList>
          <TabsContent value="individual" className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FilterSelect
                label="Filter by target exam"
                value={filters.exam}
                onValueChange={(value) => handleFilters({ exam: value })}
                placeholder={exams.length === 0 ? 'No exams available' : 'All exams'}
                disabled={exams.length === 0}
              >
                <SelectItem value={DEFAULT_FILTER}>All exams</SelectItem>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={String(exam.id)}>
                    {exam.name}
                  </SelectItem>
                ))}
              </FilterSelect>
              <FilterSearch
                value={filters.search}
                onValueChange={(value) => handleFilters({ search: value })}
                placeholder="Search by name or email"
                disabled={studentsLoading}
              />
            </div>
          </TabsContent>
          <TabsContent value="class" className="space-y-4 pt-6">
            <FilterSelect
              label="Select class"
              value={selectedClassId}
              onValueChange={onClassSelect}
              placeholder={
                classesLoading
                  ? 'Loading classes…'
                  : classSummaries.length === 0
                    ? 'No classes available'
                    : 'Choose a class'
              }
              disabled={classesLoading || classSummaries.length === 0}
            >
              {classSummaries.length === 0 && (
                <SelectItem value="__no_classes__" disabled>
                  No classes available
                </SelectItem>
              )}
              {classSummaries.map((cls) => (
                <SelectItem key={cls.id} value={String(cls.id)} className="space-y-1">
                  <span className="block font-medium">{cls.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {cls.students.length} student{cls.students.length === 1 ? '' : 's'}
                  </span>
                </SelectItem>
              ))}
            </FilterSelect>
          </TabsContent>
        </Tabs>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Selected students</h3>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allVisibleSelected ? true : partiallySelected ? 'indeterminate' : false}
                onCheckedChange={(value) => onToggleAllVisible(value === true)}
                aria-label="Select all visible students"
                disabled={students.length === 0}
              />
              <span className="text-sm text-muted-foreground">
                {visibleCount === 0
                  ? 'No students to display'
                  : `Selected ${selectedCount} of ${visibleCount} visible (${totalAvailable} total)`}
              </span>
            </div>
            <Badge variant="secondary">{selectedCount} selected</Badge>
          </div>

          {studentsLoading ? (
            <StudentListSkeleton />
          ) : students.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No students match the current filters.
            </div>
          ) : (
            <StudentResponsiveList
              students={students}
              selectedStudentIds={selectedStudentIds}
              onStudentToggle={onStudentToggle}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StudentResponsiveList({
  students,
  selectedStudentIds,
  onStudentToggle,
}: {
  students: TeacherStudent[]
  selectedStudentIds: Set<string>
  onStudentToggle: (studentId: string, checked: boolean) => void
}) {
  return (
    <div className="space-y-3">
      {students.map((student) => {
        const isSelected = selectedStudentIds.has(student.id)
        const checkboxId = `assign-task-student-${student.id}`

        return (
          <Card
            key={student.id}
            className={cn(
              'p-0 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
              isSelected ? 'border-primary/60 bg-primary/5' : 'hover:border-primary/40'
            )}
          >
            <label
              htmlFor={checkboxId}
              className="flex cursor-pointer flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <p className="font-medium text-foreground">{student.fullName}</p>
                <p className="text-sm text-muted-foreground">{student.email}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground md:text-sm">
                  <Badge variant="secondary">{student.targetExamName ?? 'Exam N/A'}</Badge>
                  <Badge variant="outline">{student.targetLevelName ?? 'Level N/A'}</Badge>
                </div>
              </div>
              <Checkbox
                id={checkboxId}
                checked={isSelected}
                onCheckedChange={(value) => onStudentToggle(student.id, value === true)}
                aria-label={`Select ${student.fullName}`}
                className="h-6 w-6 rounded-md border-2 border-primary/80 text-primary transition-all duration-150 hover:border-primary md:h-5 md:w-5"
              />
            </label>
          </Card>
        )
      })}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onValueChange,
  placeholder,
  disabled,
  children,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

function FilterSearch({ value, onValueChange, placeholder, disabled }: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="student-search">Search</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="student-search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn('pl-9')}
        />
      </div>
    </div>
  )
}

function StudentListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  )
}

function computeClassSummaries(classes: TeacherClass[], students: TeacherStudent[]): ClassSummary[] {
  const studentIndex = new Map(students.map((student) => [student.id, student]))

  return classes.map((cls) => {
    const members = cls.studentUserIds
      .map((studentId) => studentIndex.get(studentId))
      .filter((student): student is TeacherStudent => Boolean(student))

    const first = members[0]
    const homogeneousExam = first && members.every((member) => member.targetExamId === first.targetExamId) ? first.targetExamId : null
    const homogeneousLevel = first && members.every((member) => member.targetLevelId === first.targetLevelId) ? first.targetLevelId : null

    return {
      ...cls,
      students: members,
      homogeneousExamId: homogeneousExam ?? null,
      homogeneousExamName: homogeneousExam ? first?.targetExamName ?? null : null,
      homogeneousLevelId: homogeneousLevel ?? null,
      homogeneousLevelName: homogeneousLevel ? first?.targetLevelName ?? null : null,
    }
  })
}

function filterStudents(students: TeacherStudent[], filters: SelectionFilters) {
  const search = filters.search.trim().toLowerCase()
  const examFilter = filters.exam

  return students.filter((student) => {
    const matchesExam = examFilter === DEFAULT_FILTER || String(student.targetExamId ?? 'null') === examFilter
    const matchesSearch =
      !search ||
      student.fullName.toLowerCase().includes(search) ||
      student.email.toLowerCase().includes(search)
    return matchesExam && matchesSearch
  })
}

export default AssignTaskPage
