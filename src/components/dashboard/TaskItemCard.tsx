import React from 'react';
import { Badge } from '@/components/ui/badge.tsx';
import { Clock } from 'lucide-react';

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

interface TaskItemCardProps {
  id: string;
  title: string | null;
  description: string | null;
  date: string;
  onClick: () => void;
  // New multi-badge API
  badges?: Array<{ text: string; variant?: BadgeVariant; icon?: React.ReactNode }>;
  // Optional RUoE score pill
  scorePercent?: number;
  scoreTooltip?: string;
  // Origin accent (left border color)
  origin?: 'teacher' | 'ai';
  // Optional metadata line (e.g., Assigned by …)
  meta?: string;
  // Backward-compat single badge
  badgeText?: string;
  badgeVariant?: BadgeVariant | null | undefined;
  // Estimated minutes for time pill
  estimatedMinutes?: number;
}

const truncateText = (text: string | null, maxLength: number): string => {
    if (!text) return '-';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

export const TaskItemCard: React.FC<TaskItemCardProps> = ({
  id,
  title,
  description,
  onClick,
  badges,
  scorePercent,
  scoreTooltip,
  origin,
  meta,
  badgeText,
  badgeVariant,
  estimatedMinutes,
}) => {
    const borderClass = origin === 'teacher'
      ? 'border-l-2 border-amber-400'
      : origin === 'ai'
        ? 'border-l-2 border-teal-400'
        : 'border';

    const scoreClass = (val: number) => {
      if (val < 50) return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300';
      if (val < 70) return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300';
      if (val < 85) return 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300';
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300';
    };

    return (
      <>
        <div
          key={id}
          className={`p-3 bg-card rounded-md hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:ring-offset-background transition-all duration-200 ease-out hover:-translate-y-0.5 cursor-pointer space-y-2 group dark:border-gray-700 hover:border-primary/60 dark:hover:border-primary/40 border ${borderClass}`}
          onClick={onClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
          role="button"
          tabIndex={0}
        >
          <div className="flex justify-between items-start gap-2">
            <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 group-hover:text-primary dark:group-hover:text-primary-foreground/90 transition-colors duration-200">
              {truncateText(title, 42)}
            </h4>
            {/* Backwards compatibility: single badge if badges not provided */}
            {!badges && badgeText && (
              <Badge variant={badgeVariant || 'secondary'} className="text-xs whitespace-nowrap">{badgeText}</Badge>
            )}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 min-h-[30px]">{truncateText(description, 80)}</p>
          {meta && (
            <p className="text-[11px] text-muted-foreground">{meta}</p>
          )}
          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-wrap gap-1.5 items-center">
              {badges && badges.map((b, idx) => (
                <Badge key={`${id}-badge-${idx}`} variant={b.variant || 'secondary'} className="text-[10px] flex items-center gap-1 transition-all duration-200 group-hover:scale-105">
                  {b.icon}
                  {b.text}
                </Badge>
              ))}
              {typeof scorePercent === 'number' && (
                <span
                  title={scoreTooltip}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-all duration-200 group-hover:scale-105 group-hover:shadow-sm ${scoreClass(Math.round(scorePercent))}`}
                >
                  {Math.round(scorePercent)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {typeof estimatedMinutes === 'number' && (
                <div className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400" aria-label={`Estimated time ${estimatedMinutes} minutes`}>
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  ~{estimatedMinutes} min
                </div>
              )}
            </div>
          </div>
        </div>

      </>
    );
};
