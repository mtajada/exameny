import React from 'react';
import { cn } from '@/lib/utils.ts';

interface ExamTwoPaneFrameProps {
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}

/**
 * Reusable two-pane flex frame that keeps both columns full-height and
 * isolates vertical scrolling to the inner cards. Left spans roughly 2/3 on desktop.
 */
export const ExamTwoPaneFrame: React.FC<ExamTwoPaneFrameProps> = ({ left, right, className }) => {
  return (
    <div className={cn('flex-1 h-full min-h-0', className)}>
      <div className="flex flex-col gap-4 lg:h-full lg:min-h-0 lg:flex-row">
        <div className="flex flex-col lg:h-full lg:min-h-0 lg:flex-[2]">
          {left}
        </div>
        <div className="flex flex-col lg:h-full lg:min-h-0 lg:flex-1">
          {right}
        </div>
      </div>
    </div>
  );
};

export default ExamTwoPaneFrame;
