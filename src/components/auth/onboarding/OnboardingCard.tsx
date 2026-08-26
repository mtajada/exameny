import * as React from 'react';

import { AuthCard, type AuthCardProps } from '@/components/auth/AuthCard';
import { cn } from '@/lib/utils';

type OnboardingCardProps = AuthCardProps;

export const OnboardingCard: React.FC<OnboardingCardProps> = ({
  title,
  description,
  footer,
  className,
  children,
  contentClassName,
  headerClassName,
  footerClassName,
  ...props
}) => (
  <AuthCard
    title={title}
    description={description}
    footer={footer}
    className={cn('w-full', className)}
    contentClassName={cn('space-y-6', contentClassName)}
    headerClassName={headerClassName}
    footerClassName={footerClassName}
    {...props}
  >
    {children}
  </AuthCard>
);
