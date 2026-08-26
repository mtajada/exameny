import { Button } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'

interface StudentDetailsSkeletonProps {
  onBack: () => void
}

export function StudentDetailsSkeleton({ onBack }: StudentDetailsSkeletonProps) {
  return (
    <div className="min-h-screen bg-muted/20 py-10 dark:bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4">
        <Button variant="ghost" size="sm" className="w-fit" onClick={onBack}>
          Back
        </Button>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  )
}

export default StudentDetailsSkeleton
