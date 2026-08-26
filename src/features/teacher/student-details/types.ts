export type WritingReviewStatus = 'pending_ai_evaluation' | 'pending_teacher_review' | 'teacher_reviewed'

export interface TeacherStudentProfile {
  studentId: string
  fullName: string
  email: string | null
  targetExamId: number | null
  targetExamName: string | null
  targetLevelId: number | null
  targetLevelName: string | null
  assignedTeacherId: string | null
  availableExams: Array<{
    examId: number
    examName: string | null
    maxScore: number | null
  }>
}

export interface TeacherWritingItem {
  submissionId: string
  taskTypeId: number | null
  taskCode: string | null
  taskName: string
  status: WritingReviewStatus
  origin: 'assigned' | 'self_practice'
  assignedPromptId: string | null
  submittedAt: string | null
  updatedAt: string | null
  evaluationCompletedAt: string | null
  aiOverallScore: number | null
  teacherOverallScore: number | null
  aiOverallCommentary: string | null
  teacherComments: string | null
  timeSpentSeconds: number | null
  defaultTimeMinutes: number | null
}

export interface TeacherStudentWritingsGroups {
  homeworkPending: TeacherWritingItem[]
  homeworkReviewed: TeacherWritingItem[]
  selfPractice: {
    pending: TeacherWritingItem[]
    reviewed: TeacherWritingItem[]
  }
}

export interface TeacherAssignedTaskItem {
  id: string
  taskTypeId: number | null
  taskCode: string | null
  taskName: string
  taskCategory: 'writing' | 'ruoe' | 'other'
  status: 'pending' | 'viewed' | 'submitted' | 'evaluated'
  assignedAt: string
  dueAt: string | null
  submittedAt: string | null
  submissionId: string | null
}

export interface TeacherStudentDetailsPayload {
  profile: TeacherStudentProfile
  writings: TeacherStudentWritingsGroups
  assignedTasks: {
    pending: TeacherAssignedTaskItem[]
    completed: TeacherAssignedTaskItem[]
  }
}
