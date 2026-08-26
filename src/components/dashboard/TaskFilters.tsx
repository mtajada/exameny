import React from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';

export type TypeFilter = 'all' | 'writing' | 'ruoe';
// Replace 'not_started' with semantic 'homework' for UI filtering
export type StatusFilter = 'all' | 'homework' | 'in_progress' | 'completed';

interface TaskFiltersProps {
  typeFilter: TypeFilter;
  statusFilter: StatusFilter;
  onTypeChange: (val: TypeFilter) => void;
  onStatusChange: (val: StatusFilter) => void;
  // Optional count of homework items to surface notification cue
  homeworkCount?: number;
}

export const TaskFilters: React.FC<TaskFiltersProps> = ({
  typeFilter,
  statusFilter,
  onTypeChange,
  onStatusChange,
  homeworkCount = 0,
}) => {
  // We no longer show 'submitted' in UI. For simplicity, expose 'completed' to include
  // Writing evaluated + RUoE completed where used.
  const showHomeworkBadge = typeof homeworkCount === 'number' && homeworkCount > 0;
  const homeworkBadgeText = homeworkCount > 99 ? '99+' : String(homeworkCount);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" aria-label="Task filters">
      <div className="flex items-center gap-2" aria-label="Filter by type">
        <span className="text-sm text-muted-foreground" id="type-filter-label">Type:</span>
        <ToggleGroup type="single" value={typeFilter} onValueChange={(v) => v && onTypeChange(v as TypeFilter)} aria-labelledby="type-filter-label">
          <ToggleGroupItem value="all" aria-label="All types">All</ToggleGroupItem>
          <ToggleGroupItem value="writing" aria-label="Writing">Writing</ToggleGroupItem>
          <ToggleGroupItem value="ruoe" aria-label="Reading & Use of English">R&UoE</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex items-center gap-2" aria-label="Filter by status">
        <span className="text-sm text-muted-foreground" id="status-filter-label">Status:</span>
        <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => v && onStatusChange(v as StatusFilter)} aria-labelledby="status-filter-label">
          <ToggleGroupItem value="all" aria-label="All statuses">All</ToggleGroupItem>
          <ToggleGroupItem value="homework" aria-label="Homework" className="relative inline-flex items-center gap-1">
            Homework
            {showHomeworkBadge && (
              <Badge
                variant="destructive"
                className="px-1.5 h-5 min-w-[1.25rem] rounded-full flex items-center justify-center text-[10px] leading-none"
                aria-label={`${homeworkBadgeText} homework items`}
              >
                {homeworkBadgeText}
              </Badge>
            )}
          </ToggleGroupItem>
          <ToggleGroupItem value="in_progress" aria-label="In progress">In progress</ToggleGroupItem>
          <ToggleGroupItem value="completed" aria-label="Completed">Completed</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
};
