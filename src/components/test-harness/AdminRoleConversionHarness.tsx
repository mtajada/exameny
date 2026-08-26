import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const AdminRoleConversionHarness = () => {
  const [result, setResult] = useState<null | {
    cleaned_records: { pending_invites_updated: boolean; requires_manual_follow_up: boolean };
    next_role: string;
  }>(null);

  const handleConvert = () => {
    setResult({
      cleaned_records: {
        pending_invites_updated: true,
        requires_manual_follow_up: false,
      },
      next_role: 'student',
    });
  };

  return (
    <Card className="max-w-2xl border border-dashed">
      <CardHeader>
        <CardTitle>Admin role conversion preview</CardTitle>
        <CardDescription>
          Simulates admin-membership-role Edge Function responses when an academy admin is converted to student or
          teacher.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The conversion locks memberships, records admin.membership_role_audit, and returns cleaned_records so Members
          tab can surface follow-up tasks.
        </p>
        <Button data-testid="convert-role-button" onClick={handleConvert}>
          Convert to student
        </Button>
        {result && (
          <div className="space-y-2 rounded border border-muted p-4" data-testid="conversion-result">
            <p className="text-sm font-medium">New role: {result.next_role}</p>
            <pre className="rounded bg-muted/60 p-3 text-xs">
              {JSON.stringify(result.cleaned_records, null, 2)}
            </pre>
            <p className="text-xs text-muted-foreground">
              Render this block when MANUAL_INTERVENTION_REQUIRED is false so admins see the exact server-side cleanup.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
