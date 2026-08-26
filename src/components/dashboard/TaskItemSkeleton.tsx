import React from 'react';
import { Skeleton } from '@/components/ui/skeleton.tsx';

export const TaskItemSkeleton: React.FC = () => {
  return (
    <div className="p-4 bg-card rounded-md border border-border space-y-2">
      <div className="flex justify-between items-start gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-3 w-3/4" />
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
};

export default TaskItemSkeleton;
