import React from 'react';
import { Sparkles } from 'lucide-react';

import { AuthShell } from '@/components/auth/AuthShell';
import { AuthCard } from '@/components/auth/AuthCard';

interface AuthGateLoadingCardProps {
  title?: string;
  description?: string;
  message?: string;
}

/**
 * Shared loading presentation for auth-protected routes so every guard
 * keeps the same AuthShell layout and copy.
 */
export function AuthGateLoadingCard({
  title = 'Syncing your access',
  description = 'We are preparing your academies.',
  message = 'Validating invitations and refreshing your session.',
}: AuthGateLoadingCardProps) {
  return (
    <AuthShell contentWidth="lg">
      <AuthCard
        title={title}
        description={description}
        className="w-full"
        contentClassName="space-y-4 pb-6"
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Sparkles className="h-5 w-5 animate-spin text-foreground" aria-hidden="true" />
          <p>{message}</p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
