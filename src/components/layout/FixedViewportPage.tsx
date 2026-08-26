import React from 'react';
import { cn } from '@/lib/utils.ts';

interface FixedViewportPageProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string; // e.g., '1440px'
  paddingXClass?: string; // e.g., 'px-3 md:px-4'
  paddingYClass?: string; // e.g., 'py-4'
}

export const FixedViewportPage: React.FC<FixedViewportPageProps> = ({
  children,
  className,
  maxWidth = '1440px',
  paddingXClass = 'px-3 md:px-4',
  paddingYClass = 'py-4',
}) => {
  const containerStyle = { '--max-w': maxWidth } as React.CSSProperties;

  return (
    <div className={cn('h-full flex flex-col overflow-hidden', className)}>
      <div
        style={containerStyle}
        className={cn(
          'mx-auto w-full h-full min-h-0 overflow-hidden scroll-stable flex flex-col',
          'max-w-[var(--max-w)]',
          paddingXClass,
          paddingYClass,
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default FixedViewportPage;
