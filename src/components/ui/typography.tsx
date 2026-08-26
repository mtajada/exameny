import * as React from 'react';

import { cn } from '@/lib/utils';

type TypographyBaseProps = React.HTMLAttributes<HTMLParagraphElement> & {
  children: React.ReactNode;
};

export function Eyebrow({ className, children, ...props }: TypographyBaseProps) {
  return (
    <p
      className={cn(
        'text-xs font-semibold uppercase tracking-[0.3em] text-slate-300',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

export function Lead({ className, children, ...props }: TypographyBaseProps) {
  return (
    <p
      className={cn('text-lg leading-relaxed text-slate-200', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function MutedText({ className, children, ...props }: TypographyBaseProps) {
  return (
    <p
      className={cn('text-sm text-slate-400', className)}
      {...props}
    >
      {children}
    </p>
  );
}
