import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';

export interface CriteriaEvalItem {
  criterionName: string;
  score: string;
  feedback?: string;
}

export interface CriteriaPerformanceData {
  criterionName: string;
  averageScore: number;
  totalAttempts: number;
  trend: 'up' | 'down' | 'stable';
  latestScore?: number;
  maxPossibleScore: number;
}

interface WritingCriteriaTableProps {
  criteriaData: CriteriaPerformanceData[];
  selectedExamMaxScore: number;
  title?: string;
  description?: string;
}

const trendMeta = {
  up: { label: 'Improving', Icon: ArrowUp, className: 'text-emerald-700' },
  down: { label: 'Needs attention', Icon: ArrowDown, className: 'text-amber-700' },
  stable: { label: 'Stable', Icon: ArrowRight, className: 'text-slate-600' },
} as const;

export function WritingCriteriaTable({
  criteriaData,
  selectedExamMaxScore,
  title = 'Writing criteria',
  description = 'Average performance across completed writing activities.',
}: WritingCriteriaTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Criterion</th>
                <th className="py-3 pr-4 font-medium">Average</th>
                <th className="py-3 pr-4 font-medium">Attempts</th>
                <th className="py-3 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {criteriaData.map((criterion) => {
                const maximum = criterion.maxPossibleScore || selectedExamMaxScore || 1;
                const percentage = Math.max(0, Math.min(100, (criterion.averageScore / maximum) * 100));
                const { label, Icon, className } = trendMeta[criterion.trend];

                return (
                  <tr key={criterion.criterionName} className="border-b last:border-0">
                    <td className="py-4 pr-4 font-medium">{criterion.criterionName}</td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <span className="w-16 tabular-nums">
                          {criterion.averageScore.toFixed(1)} / {maximum}
                        </span>
                        <span className="h-2 w-28 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="py-4 pr-4 tabular-nums">{criterion.totalAttempts}</td>
                    <td className={`py-4 ${className}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="h-4 w-4" /> {label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
