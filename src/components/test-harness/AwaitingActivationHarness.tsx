import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const AwaitingActivationHarness = () => {
  const [status, setStatus] = useState<'awaiting_login' | 'active'>('awaiting_login');

  return (
    <Card className="max-w-xl border border-muted-foreground/30">
      <CardHeader>
        <CardTitle>Membership status transition</CardTitle>
        <CardDescription>
          Mirrors the UI copy when a membership moves from awaiting_login to active and updates metadata.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p data-testid="membership-status" className="text-sm font-medium">
          Current status: {status === 'awaiting_login' ? 'awaiting_login (locked)' : 'active (dashboard unlocked)'}
        </p>
        <p className="text-sm text-muted-foreground">
          The client will call auth-finalize-signup when the status is awaiting_login. Once the invite is claimed,
          metadata_payload and should_refresh_session propagate to the AuthContext.
        </p>
        <Button
          data-testid="activate-membership-button"
          disabled={status === 'active'}
          onClick={() => setStatus('active')}
        >
          {status === 'active' ? 'Membership activated' : 'Activate membership'}
        </Button>
      </CardContent>
    </Card>
  );
};
