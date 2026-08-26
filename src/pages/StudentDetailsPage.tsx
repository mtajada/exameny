import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  AssignedTasksSection,
  StudentDetailsSkeleton,
  StudentWritingsSection,
  TaskPerformanceSection,
  TeacherStudentHero,
  useTeacherStudentDetails,
  useTeacherStudentProgress,
} from '@/features/teacher/student-details/index.ts'
import { ProgressSummaryCards, type ExamOption } from '@/features/student-progress/components/index.ts'

const StudentDetailsPage = () => {
  const { studentId } = useParams<{ studentId: string }>()
  const navigate = useNavigate()
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null)

  const progress = useTeacherStudentProgress(studentId, selectedExamId)
  const details = useTeacherStudentDetails({ studentId, availableExams: progress.availableExams })

  const snapshot = progress.snapshot
  const studentDetails = details.details

  const examOptions: ExamOption[] = useMemo(
    () =>
      (progress.availableExams ?? []).map((exam) => ({
        value: String(exam.examId),
        label: exam.examName ?? `Exam ${exam.examId}`,
        maxScore: exam.maxScore ?? 100,
      })),
    [progress.availableExams],
  )

  const resolvedExamId = selectedExamId ?? snapshot?.metadata.examId ?? null

  const isLoading = progress.loading || details.loading
  const hasError = progress.error || details.error

  if (hasError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <Alert variant="destructive" className="max-w-xl">
          <AlertTitle>Unable to load the student information</AlertTitle>
          <AlertDescription className="space-y-3">
            {progress.error && <p>{progress.error}</p>}
            {details.error && <p>{details.error}</p>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                progress.refetch()
                details.refetch()
              }}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading || !snapshot || !studentDetails) {
    return <StudentDetailsSkeleton onBack={() => navigate(-1)} />
  }

  const { profile, writings, assignedTasks } = studentDetails
  const examName = snapshot.metadata.examName

  return (
    <div className="min-h-screen bg-muted/20 pt-10 pb-20 dark:bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-8">
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => navigate(-1)}>
          Back
        </Button>

        <TeacherStudentHero profile={profile} />

        <ProgressSummaryCards
          metrics={snapshot.aggregates}
          context="teacher"
          examName={examName}
        />

        <StudentWritingsSection
          homeworkPending={writings.homeworkPending}
          homeworkReviewed={writings.homeworkReviewed}
          selfPractice={writings.selfPractice}
        />

        <AssignedTasksSection pending={assignedTasks.pending} completed={assignedTasks.completed} />

        <TaskPerformanceSection
          snapshot={snapshot}
          examOptions={examOptions}
          selectedExamId={resolvedExamId}
          onExamChange={(value) => {
            const numericExamId = Number.parseInt(value, 10)
            setSelectedExamId(Number.isNaN(numericExamId) ? null : numericExamId)
          }}
        />
      </div>
    </div>
  )
}

export default StudentDetailsPage
