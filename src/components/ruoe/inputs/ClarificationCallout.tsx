import React from 'react';
import { cn } from '@/lib/utils';

interface ClarificationCalloutProps {
  helperText?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const ClarificationCallout: React.FC<ClarificationCalloutProps> = ({
  helperText = 'Need more detail?',
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        'mt-4 flex flex-col gap-2 rounded-lg border border-slate-200/60 bg-white/70 px-3 py-2 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      {helperText ? (
        <span className="text-xs font-medium tracking-tight text-slate-500 sm:text-sm">
          {helperText}
        </span>
      ) : null}
      {children}
    </div>
  );
};

export default ClarificationCallout;
