import * as React from 'react';

import type { MembershipSummary } from '@/contexts/AuthContextBase';
import type { EdgeFunctionErrorPayload } from '@/lib/auth/edge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mapSelectorErrorToCopy, SELECTOR_ERROR_FALLBACK } from '@/lib/auth/errorCopy';
import { OnboardingCard } from './OnboardingCard';

interface AcademySelectorProps {
  memberships: MembershipSummary[];
  activeAcademyId: number | null;
  pendingAcademyId: number | null;
  error?: EdgeFunctionErrorPayload | null;
  onSelect: (academyId: number) => Promise<void> | void;
}

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

export const AcademySelector: React.FC<AcademySelectorProps> = ({
  memberships,
  activeAcademyId,
  pendingAcademyId,
  error,
  onSelect,
}) => (
  <OnboardingCard
    title="Choose your academy"
    description="Select where you want to continue."
    footer={
      error ? (
        <div className="text-sm text-red-600">
          <p>{mapSelectorErrorToCopy(error)}</p>
          {(error.code || error.requestId) ? (
            <span className="mt-1 block text-xs text-red-500/80">
              {error.code ? `Error code: ${error.code}` : null}
              {error.code && error.requestId ? ' · ' : null}
              {error.requestId ? `Request ID: ${error.requestId}` : null}
            </span>
          ) : null}
        </div>
      ) : null
    }
  >
    <div className="space-y-3">
      {memberships.map((membership) => {
        const isActive = membership.academyId === activeAcademyId;
        const isPending = pendingAcademyId === membership.academyId;
        return (
          <Button
            key={membership.membershipId}
            type="button"
            variant="outline"
            className={cn(
              'h-auto w-full justify-between rounded-md border-border/70 bg-background px-4 py-4 text-left shadow-sm transition-colors',
              isActive ? 'border-primary/60 ring-2 ring-primary/15' : 'hover:border-primary/40 hover:bg-muted/40',
            )}
            onClick={() => void onSelect(membership.academyId)}
            disabled={isPending}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-base font-semibold text-foreground">{membership.academyName}</span>
              <p className="text-xs text-muted-foreground">
                {isPending ? 'Updating selection…' : isActive ? 'Current selection' : 'Tap to set as active'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-xs">
              <Badge variant="outline" className="rounded-sm border-border/70 px-3 py-1 text-xs">
                {roleCopy[membership.role]}
              </Badge>
              <Badge
                variant={membership.status === 'active' ? 'default' : 'outline'}
                className={cn(
                  'rounded-sm px-3 py-1 text-xs',
                  membership.status === 'active'
                    ? 'bg-primary/90 text-primary-foreground'
                    : 'border-border/70 text-muted-foreground',
                )}
              >
                {statusCopy[membership.status]}
              </Badge>
            </div>
          </Button>
        );
      })}
    </div>
  </OnboardingCard>
);
