import { Card, CardContent } from '@/components/ui/card.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import type { TeacherStudentProfile } from '@/features/teacher/student-details/types.ts'

interface TeacherStudentHeroProps {
  profile: TeacherStudentProfile
}

export function TeacherStudentHero({ profile }: TeacherStudentHeroProps) {
  return (
    <Card className="border-border bg-card shadow-sm dark:border-border/60 dark:bg-card/80">
      <CardContent className="space-y-4 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Progress overview for {profile.fullName}</h1>
          <p className="text-sm text-muted-foreground">Comprehensive overview to decide the next step with this student.</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {profile.targetExamName && (
              <Badge variant="secondary" className="dark:border-primary/40 dark:bg-primary/10 dark:text-primary">
                Target exam: {profile.targetExamName}
              </Badge>
            )}
            {profile.targetLevelName && (
              <Badge variant="outline" className="dark:border-border/60 dark:bg-muted/20">
                Target level: {profile.targetLevelName}
              </Badge>
            )}
            {profile.email && (
              <Badge variant="outline" className="dark:border-border/60 dark:bg-muted/20">
                {profile.email}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default TeacherStudentHero
