import type { StudentProgressSnapshot } from '@/features/student-progress/types.ts'
import { ExamSelector, TaskPerformanceList, type ExamOption } from '@/features/student-progress/components/index.ts'

interface TaskPerformanceSectionProps {
  snapshot: StudentProgressSnapshot
  examOptions: ExamOption[]
  selectedExamId: number | null
  onExamChange: (value: string) => void
}

export function TaskPerformanceSection({ snapshot, examOptions, selectedExamId, onExamChange }: TaskPerformanceSectionProps) {
  // Default to the resolved exam id from the snapshot when no explicit selection is provided
  const selectorValue = selectedExamId != null ? String(selectedExamId) : String(snapshot.metadata.examId)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Task performance</h2>
          <p className="text-sm text-muted-foreground">Review average scores by task type.</p>
        </div>
        {examOptions.length > 1 && (
          <ExamSelector value={selectorValue} options={examOptions} onChange={onExamChange} />
        )}
      </div>

      <TaskPerformanceList
        tasks={snapshot.taskPerformance}
        context="teacher"
        title="Average by task type"
        description="Prioritize what to review based on the student's performance."
      />
    </div>
  )
}

export default TaskPerformanceSection
