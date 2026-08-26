import * as React from 'react';
import type { MembershipSummary } from '@/contexts/AuthContextBase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OnboardingCard } from './OnboardingCard';
import type { WaitingVariant } from './state';

interface WaitingScreenProps {
  variant: WaitingVariant;
  membershipsInactive: MembershipSummary[];
  onRetry: () => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
  isRetrying?: boolean;
  isLoggingOut?: boolean;
}

const variantCopy: Record<WaitingVariant, string> = {
  'no-academy': 'Your academy has not granted access yet.',
  'inactive-only': 'Your access is temporarily paused.',
};

const roleCopy: Record<MembershipSummary['role'], string> = {
  student: 'Student',
  teacher: 'Teacher',
  academy_admin: 'Academy admin',
};

const statusCopy: Record<MembershipSummary['status'], string> = {
  awaiting_login: 'Awaiting access',
  active: 'Active',
  inactive: 'Inactive',
};

export const WaitingScreen: React.FC<WaitingScreenProps> = ({
  variant,
  membershipsInactive,
  onRetry,
  onLogout,
  isRetrying = false,
  isLoggingOut = false,
}) => (
  <OnboardingCard
    title="You don't have any active academies yet."
    description={variantCopy[variant]}
    footer={
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          className="h-12 w-full rounded-md text-sm font-semibold sm:w-auto"
          onClick={() => void onRetry()}
          disabled={isRetrying}
          aria-busy={isRetrying}
        >
          <span className={isRetrying ? 'opacity-80' : undefined}>Retry</span>
        </Button>
        {onLogout ? (
          <Button
            variant="ghost"
            className="h-12 w-full rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground sm:w-auto"
            onClick={() => void onLogout()}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
          >
            <span className={isLoggingOut ? 'opacity-80' : undefined}>Sign out</span>
          </Button>
        ) : null}
      </div>
    }
  >
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We will keep your session active so you can try again as soon as access is enabled.
      </p>
      {membershipsInactive.length > 0 ? (
        <div className="rounded-md border border-border/70 bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Inactive academies</p>
          <ul className="mt-3 space-y-3">
            {membershipsInactive.map((membership) => (
              <li
                key={membership.membershipId}
                className="flex flex-col gap-3 rounded-md border border-border/60 bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <span className="text-sm font-medium text-foreground">{membership.academyName}</span>
                  <p className="text-xs text-muted-foreground">{roleCopy[membership.role]}</p>
                </div>
                <Badge variant="outline" className="w-fit rounded-sm border-border/70 px-3 py-1 text-xs">
                  {statusCopy[membership.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  </OnboardingCard>
);
