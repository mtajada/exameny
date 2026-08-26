import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle } from 'lucide-react';

interface EvaluationSummaryPillsProps {
  correct: number;
  incorrect: number;
  percentage: number;
  className?: string;
}

export const EvaluationSummaryPills: React.FC<EvaluationSummaryPillsProps> = ({
  correct,
  incorrect,
  percentage,
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <Badge variant="outline" className="text-sm border-green-500 text-green-700">
        <CheckCircle className="h-3 w-3 mr-1" />
        {correct} correct
      </Badge>
      <Badge variant="outline" className="text-sm border-red-500 text-red-700">
        <XCircle className="h-3 w-3 mr-1" />
        {incorrect} incorrect
      </Badge>
      <Badge variant="outline" className="text-sm">
        {percentage}% score
      </Badge>
    </div>
  );
};
