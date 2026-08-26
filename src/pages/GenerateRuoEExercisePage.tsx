import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/useAuth'
import { useAutoProgress, getProgressModeForLayout } from '@/features/ruoe/generation/useAutoProgress'
import { getRuoEFunctionName, getRuoELayoutKey } from '@/config/ruoeFunctionMap'
import type { AssignmentDraft } from '@/types/assignments'
import {
  TaskGenerationScreen,
  getRuoeTips,
  getTaskGenerationCopy,
} from '@/features/task-generation'

interface GeneratedExerciseResponse {
  exerciseId: number
  traceId?: string
  success?: boolean
}

interface ExerciseContext {
  taskTypeId: number
  examId: number
  levelId: number
  taskCode?: string | null
  taskName?: string | null
  teacherTheme?: string | null
  teacherSkillFocus?: string | null
  source?: 'assignment' | 'practice'
  existingExerciseId?: number | null
  assignmentDraft?: AssignmentDraft | null
}

const TIP_ROTATION_INTERVAL_MS = 4500


const GenerateRuoEExercisePage = () => {
  const location = useLocation() as ReturnType<typeof useLocation> & { state?: ExerciseContext | null }
  const navigate = useNavigate()
  const { role } = useAuth()

  const context = location.state ?? null

  if (!context?.taskTypeId || !context.examId || !context.levelId) {
    return (
      <MissingContextCard
        onBack={() => {
          if (role === 'teacher') {
            navigate('/teacher/assign-task', { replace: true })
          } else {
            navigate('/select-ai-task-type?type=ruoe', { replace: true })
          }
        }}
      />
    )
  }

  const isTeacherFlow = context.source === 'assignment' && role === 'teacher'

  if (isTeacherFlow) {
    return <TeacherRuoEGenerator initialContext={context} />
  }

  return <StudentRuoEGenerator context={context} />
}

const MissingContextCard = ({ onBack }: { onBack: () => void }) => (
  <div className="container mx-auto max-w-3xl p-4 py-8">
    <Card>
      <CardContent className="py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Generation unavailable</AlertTitle>
          <AlertDescription className="mt-2 text-sm text-muted-foreground">
            We could not determine the exercise context. Please start again.
          </AlertDescription>
        </Alert>
        <div className="mt-6 flex justify-center">
          <Button onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go back
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
)

const StudentRuoEGenerator = ({ context }: { context: ExerciseContext }) => {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { taskCode, taskTypeId, teacherTheme, teacherSkillFocus } = context

  const layoutKey = useMemo(() => {
    if (!taskCode) return null
    try {
      return getRuoELayoutKey(taskCode)
    } catch {
      return null
    }
  }, [taskCode])
  const progressMode = useMemo(() => getProgressModeForLayout(layoutKey ?? undefined), [layoutKey])
  const { progress, setProgress } = useAutoProgress(isLoading, progressMode)
  const [currentTipIndex, setCurrentTipIndex] = useState(0)
  const tips = useMemo(() => getRuoeTips(taskCode), [taskCode])
  const copy = useMemo(() => getTaskGenerationCopy({ skill: 'ruoe', taskName: context.taskName }), [context.taskName])
  const statusText = isLoading && progress >= 98 ? 'Finalizing' : copy.statusLabel
  const hasFetched = useRef(false)

  useEffect(() => {
    if (tips.length <= 1) return
    const tipInterval = window.setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % tips.length)
    }, TIP_ROTATION_INTERVAL_MS)
    return () => window.clearInterval(tipInterval)
  }, [tips])

  useEffect(() => {
    setCurrentTipIndex(0)
  }, [tips])

  const invokeGenerateExercise = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setProgress(0)

    try {
      const functionName = taskCode ? getRuoEFunctionName(taskCode) : null
      if (!functionName) {
        throw new Error('Unable to resolve the generation function for this task.')
      }

      const { data, error: funcError } = await supabase.functions.invoke(functionName, {
        body: {
          taskTypeId,
          teacherTheme: teacherTheme || undefined,
          teacherSkillFocus: teacherSkillFocus || undefined,
        },
      })

      if (funcError) {
        if (funcError.message.includes('Function timed out')) {
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

      if (!data || typeof (data as GeneratedExerciseResponse).exerciseId !== 'number') {
        throw new Error('Exercise generation returned an invalid response.')
      }

      setProgress(100)
      navigate(`/ruoe-practice/${(data as GeneratedExerciseResponse).exerciseId}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not generate the exercise. Please try again.'
      setError(message)
      setProgress(0)
    } finally {
      setIsLoading(false)
    }
  }, [taskCode, taskTypeId, teacherTheme, teacherSkillFocus, navigate, setProgress])

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true
    void invokeGenerateExercise()
  }, [invokeGenerateExercise])

  const handleGoBack = useCallback(() => {
    navigate('/select-ai-task-type?type=ruoe', { replace: true })
  }, [navigate])

  if (error) {
    return (
      <div className="container mx-auto max-w-2xl min-h-screen flex items-center justify-center p-4 py-8">
        <Card className="w-full">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Generation Failed</AlertTitle>
              <AlertDescription className="mt-2 mb-4 text-sm">{error}</AlertDescription>
            </Alert>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={invokeGenerateExercise}>
                <Loader2 className="mr-2 h-4 w-4" /> Try Again
              </Button>
              <Button variant="outline" onClick={handleGoBack}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <TaskGenerationScreen
      title={copy.title}
      subtitle={copy.subtitle}
      statusText={statusText}
      isLoading={isLoading}
      progress={progress}
      tips={tips}
      tipsTitle={copy.tipsTitle}
      activeTipIndex={currentTipIndex}
      supportingCopy={copy.supportingCopy}
      monitorCopy={copy.monitorCopy}
    />
  )
}

const TeacherRuoEGenerator = ({ initialContext }: { initialContext: ExerciseContext }) => {
  const navigate = useNavigate()

  const handleReturn = useCallback(() => {
    navigate('/teacher/assign-task', {
      replace: true,
      state: {
        assignmentDraft: initialContext.assignmentDraft ?? null,
      },
    })
  }, [initialContext.assignmentDraft, navigate])

  return (
    <div className="container mx-auto max-w-2xl p-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">RUoE generator moved</CardTitle>
          <CardDescription>
            Reading & Use of English exercises are now generated directly inside the Assign Task flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTitle>Generate from Assign Task</AlertTitle>
            <AlertDescription>
              Open the assignment form to add optional guidance, generate the exercise, and review the preview without leaving the page.
            </AlertDescription>
          </Alert>
          <Button onClick={handleReturn} className="w-full sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" /> Return to Assign Task
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
export default GenerateRuoEExercisePage
