import * as React from 'react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface AuthCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
}

/**
 * Shared card scaffold for every auth/onboarding surface so typography,
 * spacing, and elevation tokens stay consistent with the shadcn layout.
 */
export const AuthCard = React.forwardRef<HTMLDivElement, AuthCardProps>(function AuthCard(
  {
    title,
    description,
    footer,
    className,
    children,
    headerClassName,
    contentClassName,
    footerClassName,
    ...props
  },
  ref,
) {
  const hasHeaderContent = Boolean(title || description);

  return (
    <Card
      ref={ref}
      className={cn('w-full rounded-2xl border border-border/30 bg-background shadow-lg shadow-black/5 backdrop-blur-sm transition-all', className)}
      {...props}
    >
      {hasHeaderContent ? (
        <CardHeader className={cn('space-y-2 pb-4', headerClassName)}>
          {title ? <CardTitle className="text-2xl font-semibold text-foreground">{title}</CardTitle> : null}
          {description ? <CardDescription className="text-sm text-muted-foreground">{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn('space-y-6 pb-6', contentClassName)}>{children}</CardContent>
      {footer ? (
        <CardFooter className={cn('border-t border-border/60 bg-muted/40 p-6', footerClassName)}>{footer}</CardFooter>
      ) : null}
    </Card>
  );
});
