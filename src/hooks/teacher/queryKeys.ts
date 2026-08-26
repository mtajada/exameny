export const teacherQueryKeys = {
  all: ['teacher'] as const,
  classes: (academyId?: number | null) => [...teacherQueryKeys.all, 'classes', academyId ?? 'no-academy'] as const,
  roster: (teacherId?: string | null, academyId?: number | null) =>
    [...teacherQueryKeys.all, 'roster', teacherId ?? 'unknown', academyId ?? 'no-academy'] as const,
  assignedStudents: (teacherId?: string | null, academyId?: number | null) =>
    [...teacherQueryKeys.all, 'assigned-students', teacherId ?? 'unknown', academyId ?? 'no-academy'] as const,
  pendingReviews: (teacherId?: string | null, academyId?: number | null) =>
    [...teacherQueryKeys.all, 'pending-reviews', teacherId ?? 'unknown', academyId ?? 'no-academy'] as const,
  studentProgress: (teacherId?: string | null, studentId?: string | null, academyId?: number | null, examId?: number | string | null) =>
    [...teacherQueryKeys.all, 'student-progress', teacherId ?? 'unknown', studentId ?? 'unknown', academyId ?? 'no-academy', examId ?? 'any'] as const,
  studentDetails: (teacherId?: string | null, studentId?: string | null, academyId?: number | null) =>
    [...teacherQueryKeys.all, 'student-details', teacherId ?? 'unknown', studentId ?? 'unknown', academyId ?? 'no-academy'] as const,
}

export type TeacherQueryKey =
  | ReturnType<typeof teacherQueryKeys.classes>
  | ReturnType<typeof teacherQueryKeys.roster>
  | ReturnType<typeof teacherQueryKeys.assignedStudents>
  | ReturnType<typeof teacherQueryKeys.pendingReviews>
  | ReturnType<typeof teacherQueryKeys.studentProgress>
  | ReturnType<typeof teacherQueryKeys.studentDetails>
