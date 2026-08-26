import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/useAuth';

export function LearnerSpeakingRoute({ children }: { children: ReactNode }) {
  const { activeMembershipId, memberships, role } = useAuth();
  const resolvedRole = role
    ?? memberships.find((membership) => membership.membershipId === activeMembershipId)?.role
    ?? (memberships.length === 1 ? memberships[0]?.role : null);

  if (resolvedRole === 'student') return <>{children}</>;

  return (
    <div className="container mx-auto max-w-2xl p-5 py-10">
      <Card>
        <CardContent className="space-y-5 py-8">
          <Alert>
            <AlertTitle>Speaking practice is a learner workspace</AlertTitle>
            <AlertDescription>
              Switch to an active learner membership before opening or saving a speaking rehearsal.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
