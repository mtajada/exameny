import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, type NavigateFunction } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/useAuth'
import ResponsiveList, { type Column } from '@/components/common/ResponsiveList'
import SectionHeader from '@/components/common/SectionHeader'
import useTeacherClasses from '@/hooks/teacher/useTeacherClasses'
import useAssignedStudents, { type AssignedStudent } from '@/hooks/teacher/useAssignedStudents'
import usePendingReviews, { type PendingReviewRow, type TaskOriginFilter } from '@/hooks/teacher/usePendingReviews'
import { LuCheck, LuClipboardList, LuEye, LuFilter, LuSearch, LuTriangle, LuUsers } from 'react-icons/lu'
import { teacherQuickActions } from '@/features/navigation/teacherQuickActions'
import { type TimeDisplayTone } from '@/utils/time-format'

const DEFAULT_FILTER = 'all'

type PendingFilterState = {
  search: string
  classId: string
  taskType: string
  origin: TaskOriginFilter
}

type StudentFilterState = {
  search: string
  classId: string
  examType: string
}

function TeacherDashboard() {
  const navigate = useNavigate()
  const { user, userPreferences } = useAuth()

  const teacherName =
    userPreferences?.fullName?.trim() ||
    user?.email ||
    'Teacher'

  const [pendingFilters, setPendingFilters] = useState<PendingFilterState>({
    search: '',
    classId: DEFAULT_FILTER,
    taskType: DEFAULT_FILTER,
    origin: 'teacher',
  })

  const [studentFilters, setStudentFilters] = useState<StudentFilterState>({
    search: '',
    classId: DEFAULT_FILTER,
    examType: DEFAULT_FILTER,
  })

  const sharedClassFilter = pendingFilters.classId === DEFAULT_FILTER ? DEFAULT_FILTER : Number(pendingFilters.classId)

  const {
    classes: teacherClasses,
    loading: classesLoading,
    error: classesError,
    refetch: refetchClasses,
  } = useTeacherClasses(true)

  const pendingReviews = usePendingReviews({
    taskType: pendingFilters.taskType,
    origin: pendingFilters.origin,
    search: pendingFilters.search,
    classFilterId: sharedClassFilter,
    classes: teacherClasses,
  })

  const assignedStudents = useAssignedStudents({
    search: studentFilters.search,
    examFilter: studentFilters.examType,
    classFilterId: sharedClassFilter,
    classes: teacherClasses,
  })

  const isLoading = classesLoading || pendingReviews.loading || assignedStudents.loading

  const errors = useMemo(
    () => [classesError, pendingReviews.error, assignedStudents.error].filter(Boolean) as string[],
    [classesError, pendingReviews.error, assignedStudents.error],
  )

  const hasBlockingError = errors.length > 0

  const classOptions = useMemo(
    () => [
      { value: DEFAULT_FILTER, label: 'All Classes' },
      ...teacherClasses.map((cls) => ({ value: String(cls.id), label: cls.name })),
    ],
    [teacherClasses],
  )

  const examTypes = useMemo(
    () =>
      Array.from(
        new Set(
          assignedStudents.students
            .map((student) => student.target_exam_name)
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort(),
    [assignedStudents.students],
  )

  const showSkeleton = isLoading && !hasBlockingError && pendingReviews.filtered.length === 0 && assignedStudents.filtered.length === 0

  const handlePendingFiltersChange = (next: PendingFilterState) => {
    setPendingFilters(next)
    setStudentFilters((prev) => (prev.classId === next.classId ? prev : { ...prev, classId: next.classId }))
  }

  const handleStudentFiltersChange = (next: StudentFilterState) => {
    setStudentFilters(next)
    setPendingFilters((prev) => (prev.classId === next.classId ? prev : { ...prev, classId: next.classId }))
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-8 bg-white p-6 md:p-8 dark:bg-gray-900">
      <DashboardHero
        teacherName={teacherName}
        onAssignTask={() => navigate('/teacher/assign-task')}
        onCreatePrintExercise={() => navigate('/teacher/print-exercise')}
      />

      {hasBlockingError && <DashboardErrorAlert errors={errors} onRetry={() => void Promise.all([refetchClasses(), pendingReviews.refetch(), assignedStudents.refetch()])} />}

      {showSkeleton ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-8">
          <PendingReviewsCard
            filters={pendingFilters}
            onFiltersChange={handlePendingFiltersChange}
            classOptions={classOptions}
            reviews={pendingReviews.filtered}
            taskTypes={pendingReviews.taskTypes}
            loading={pendingReviews.loading}
            onNavigate={navigate}
          />

          <StudentsCard
            filters={studentFilters}
            onFiltersChange={handleStudentFiltersChange}
            classOptions={classOptions}
            examTypes={examTypes}
            students={assignedStudents.filtered}
            loading={assignedStudents.loading}
            onNavigate={navigate}
          />
        </div>
      )}
    </div>
  )
}

function DashboardHero({
  teacherName,
  onAssignTask,
  onCreatePrintExercise,
}: {
  teacherName: string
  onAssignTask: () => void
  onCreatePrintExercise: () => void
}) {
  const actions = teacherQuickActions.map((action) => ({
    ...action,
    onClick: action.id === 'assign-task' ? onAssignTask : onCreatePrintExercise,
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">Welcome, {teacherName}!</h1>
      <div className="grid w-full gap-2 sm:grid-cols-2 sm:gap-3 md:w-fit">
        {actions.map(({ id, label, icon: Icon, onClick, variant }) => (
          <Button
            key={id}
            size="touch"
            variant={variant}
            onClick={onClick}
            className={variant === 'outline' ? 'w-full gap-2 border-dashed' : 'w-full gap-2'}
          >
            <Icon className="h-5 w-5" /> {label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function DashboardErrorAlert({ errors, onRetry }: { errors: string[]; onRetry: () => void }) {
  return (
    <Alert variant="destructive" className="bg-red-50 p-4 text-red-700 shadow-sm dark:bg-red-900/20 dark:text-red-300">
      <LuTriangle className="h-5 w-5" />
      <AlertTitle className="font-semibold">Error loading data</AlertTitle>
      <AlertDescription className="space-y-1 text-sm">
        {errors.map((message) => (
          <div key={message}>{message}</div>
        ))}
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  )
}

interface PendingReviewsCardProps {
  filters: PendingFilterState
  onFiltersChange: (next: PendingFilterState) => void
  classOptions: Array<{ value: string; label: string }>
  reviews: PendingReviewRow[]
  taskTypes: string[]
  loading: boolean
  onNavigate: NavigateFunction
}

function PendingReviewsCard({ filters, onFiltersChange, classOptions, reviews, taskTypes, loading, onNavigate }: PendingReviewsCardProps) {
  const handleFilterChange = (patch: Partial<PendingFilterState>) => {
    onFiltersChange({ ...filters, ...patch })
  }

  const columns = useMemo<Column<PendingReviewRow>[]>(
    () => {
      const toneContainerClasses: Record<TimeDisplayTone, string> = {
        neutral: 'border border-border bg-muted/40 dark:bg-muted/20',
        positive: 'border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
        negative: 'border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10',
      }

      const toneActualClasses: Record<TimeDisplayTone, string> = {
        neutral: 'text-foreground',
        positive: 'text-emerald-700 dark:text-emerald-300',
        negative: 'text-rose-700 dark:text-rose-300',
      }

      const toneHelperClasses: Record<TimeDisplayTone, string> = {
        neutral: 'text-muted-foreground',
        positive: 'text-emerald-600 dark:text-emerald-400',
        negative: 'text-rose-600 dark:text-rose-400',
      }

      const renderTimeDisplay = (row: PendingReviewRow, variant: 'table' | 'card') => {
        const meta = row.timeMeta
        const containerClass = `rounded-md px-3 py-2 ${toneContainerClasses[meta.tone]}`
        const helperSize = variant === 'card' ? 'text-[11px]' : 'text-xs'
        const actualBase = variant === 'card' ? 'text-base font-semibold' : 'font-medium'
        const actualClass = `${actualBase} ${meta.hasData ? toneActualClasses[meta.tone] : 'text-muted-foreground'}`
        const helperClass = `${helperSize} ${toneHelperClasses[meta.tone]}`

        return (
          <div className={containerClass}>
            <span className={actualClass}>{meta.actualLabel}</span>
            <span className={helperClass}>{meta.helperText}</span>
          </div>
        )
      }

      return [
        {
          key: 'student',
          header: 'Student',
          render: (row) => <span className="font-medium">{row.student_name}</span>,
          renderCard: (row) => <div className="font-medium text-foreground">{row.student_name}</div>,
        },
        {
          key: 'task',
          header: 'Task',
          render: (row) => row.task_name,
          renderCard: (row) => <div className="text-sm text-muted-foreground">{row.task_name}</div>,
        },
        {
          key: 'date',
          header: 'Submission Date',
          render: (row) => row.submission_date_display,
          renderCard: (row) => <div className="text-xs text-muted-foreground">{row.submission_date_display}</div>,
        },
        {
          key: 'time',
          header: 'Actual Time',
          render: (row) => renderTimeDisplay(row, 'table'),
          renderCard: (row) => renderTimeDisplay(row, 'card'),
        },
        {
          key: 'action',
          header: 'Action',
          render: (row) => (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => onNavigate(`/evaluation/${row.submission_id}`)}>
                <LuEye className="h-4 w-4" /> Review
              </Button>
            </div>
          ),
          renderCard: (row) => (
            <div className="flex justify-end">
              <Button size="touch" variant="outline" className="gap-2" onClick={() => onNavigate(`/evaluation/${row.submission_id}`)}>
                <LuEye className="h-4 w-4" /> Review
              </Button>
            </div>
          ),
        },
      ]
    },
    [onNavigate],
  )

  return (
    <Card className="border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/50">
      <CardHeader className="border-b border-gray-200 p-4 md:p-6 dark:border-gray-700">
        <SectionHeader
          title="Pending Review Tasks"
          description="Submissions from students that require your evaluation."
          icon={<LuClipboardList className="h-5 w-5" />}
          iconClassName="bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
          right={
            <FilterRow>
              <SearchInput
                placeholder="Search student..."
                value={filters.search}
                onChange={(value) => handleFilterChange({ search: value })}
              />
              <SelectFilter
                icon={<LuFilter className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                value={filters.classId}
                onValueChange={(value) => {
                  handleFilterChange({ classId: value })
                }}
                options={classOptions}
              />
              <SelectFilter
                icon={<LuFilter className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                value={filters.taskType}
                onValueChange={(value) => handleFilterChange({ taskType: value })}
                options={[{ value: DEFAULT_FILTER, label: 'All Task Types' }, ...taskTypes.map((type) => ({ value: type, label: type }))]}
              />
              <SelectFilter
                icon={<LuFilter className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                value={filters.origin}
                onValueChange={(value) => handleFilterChange({ origin: value as TaskOriginFilter })}
                options={[
                  { value: 'teacher', label: 'Teacher-Created' },
                  { value: 'ai', label: 'AI-Generated' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </FilterRow>
          }
        />
      </CardHeader>
      <CardContent className="p-0">
        {reviews.length > 0 ? (
          <ResponsiveList data={reviews} columns={columns} rowKey={(row) => row.submission_id} empty={null} />
        ) : (
          <EmptyState
            icon={loading ? null : <LuCheck className="h-12 w-12 text-green-500" />}
            title={loading ? 'Loading tasks...' : 'All Caught Up!'}
            description={loading ? 'Fetching pending tasks...' : 'No pending review tasks. Great job!'}
          />
        )}
      </CardContent>
    </Card>
  )
}

interface StudentsCardProps {
  filters: StudentFilterState
  onFiltersChange: (next: StudentFilterState) => void
  classOptions: Array<{ value: string; label: string }>
  examTypes: string[]
  students: AssignedStudent[]
  loading: boolean
  onNavigate: NavigateFunction
}

function StudentsCard({ filters, onFiltersChange, classOptions, examTypes, students, loading, onNavigate }: StudentsCardProps) {
  const handleFilterChange = (patch: Partial<StudentFilterState>) => {
    onFiltersChange({ ...filters, ...patch })
  }

  const columns = useMemo<Column<AssignedStudent>[]>(
    () => [
      {
        key: 'name',
        header: 'Student Name',
        render: (row) => (
          <Link to={`/teacher/student/${row.student_id}`} className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
            {row.full_name}
          </Link>
        ),
        renderCard: (row) => (
          <div className="font-medium text-foreground">
            <Link to={`/teacher/student/${row.student_id}`} className="hover:underline">
              {row.full_name}
            </Link>
          </div>
        ),
      },
      {
        key: 'exam',
        header: 'Target Exam',
        render: (row) => row.target_exam_name || '—',
        renderCard: (row) => <div className="text-sm text-muted-foreground">{row.target_exam_name || '—'}</div>,
      },
      {
        key: 'action',
        header: 'Quick Action',
        render: (row) => (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => onNavigate(`/teacher/student/${row.student_id}`)}>
              <LuEye className="h-4 w-4" /> View Profile
            </Button>
          </div>
        ),
        renderCard: (row) => (
          <div className="flex justify-end">
            <Button size="touch" variant="outline" className="gap-2" onClick={() => onNavigate(`/teacher/student/${row.student_id}`)}>
              <LuEye className="h-4 w-4" /> View Profile
            </Button>
          </div>
        ),
      },
    ],
    [onNavigate],
  )

  return (
    <Card className="border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/50">
      <CardHeader className="border-b border-gray-200 p-4 md:p-6 dark:border-gray-700">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center text-xl font-semibold text-gray-800 dark:text-gray-200">
              <LuUsers className="mr-3 h-6 w-6 text-teal-500" /> My Students
            </CardTitle>
            <CardDescription className="pt-1 text-sm text-gray-500 dark:text-gray-400">
              Students assigned to you for guidance and task assignment.
            </CardDescription>
          </div>
          <FilterRow>
            <SearchInput
              placeholder="Search student..."
              value={filters.search}
              onChange={(value) => handleFilterChange({ search: value })}
            />
            <SelectFilter
              icon={<LuFilter className="h-4 w-4 text-gray-500" />}
              value={filters.classId}
              onValueChange={(value) => handleFilterChange({ classId: value })}
              options={classOptions}
            />
            {examTypes.length > 0 && (
              <SelectFilter
                icon={<LuFilter className="h-4 w-4 text-gray-500" />}
                value={filters.examType}
                onValueChange={(value) => handleFilterChange({ examType: value })}
                options={[{ value: DEFAULT_FILTER, label: 'All Exam Types' }, ...examTypes.map((exam) => ({ value: exam, label: exam }))]}
              />
            )}
          </FilterRow>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {students.length > 0 ? (
          <ResponsiveList data={students} columns={columns} rowKey={(row) => row.student_id} empty={null} />
        ) : (
          <EmptyState
            icon={loading ? null : <LuUsers className="h-12 w-12 text-blue-500" />}
            title={loading ? 'Loading students...' : 'No Students Assigned'}
            description={loading ? 'Fetching students assigned to you...' : "You don't have any students yet. Use the assign task button to get started!"}
          />
        )}
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-4 text-center">
        <Skeleton className="mx-auto h-9 w-3/5 rounded-md" />
        <Skeleton className="mx-auto h-11 w-52 rounded-md" />
      </div>
      <SkeletonCard rows={3} />
      <SkeletonCard rows={2} />
    </div>
  )
}

function SkeletonCard({ rows }: { rows: number }) {
  return (
    <Card className="border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/50">
      <CardHeader className="border-b border-gray-200 p-4 md:p-6 dark:border-gray-700">
        <Skeleton className="mb-1.5 h-7 w-2/5 rounded-md" />
        <Skeleton className="h-4 w-4/5 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-4 md:p-6">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </CardContent>
    </Card>
  )
}

function FilterRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
}

interface SearchInputProps {
  placeholder: string
  value: string
  onChange: (value: string) => void
}

function SearchInput({ placeholder, value, onChange }: SearchInputProps) {
  return (
    <div className="relative">
      <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} className="pl-9" />
    </div>
  )
}

interface SelectFilterProps {
  icon: ReactNode
  value: string
  onValueChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

function SelectFilter({ icon, value, onValueChange, options }: SelectFilterProps) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-gray-500 dark:text-gray-400">
      {icon}
      <p className="mt-3 text-lg font-semibold">{title}</p>
      <p className="text-sm">{description}</p>
    </div>
  )
}

export default TeacherDashboard
