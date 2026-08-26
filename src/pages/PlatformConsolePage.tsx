import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const PlatformConsolePage: React.FC = () => {
  return (
    <div className="container mx-auto max-w-5xl px-6 py-12">
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Platform Console</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Manage every academy from one place</h1>
          <p className="mt-3 text-base text-muted-foreground">
            This workspace is reserved for platform owners and super admins. Review invitations, monitor deployments,
            and jump into any academy dashboard without switching accounts.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Global actions</CardTitle>
            <CardDescription>Shortcuts and diagnostic entries for cross-academy operations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-muted p-4 text-sm text-muted-foreground">
              <p>Future releases will surface analytics, member search, and environment toggles here.</p>
              <p className="font-medium text-foreground">
                For now, use the navigation actions below to reach academy dashboards or OAuth settings.
              </p>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-3">
              <Button variant="default">View academy directory</Button>
              <Button variant="outline">Review pending invitations</Button>
              <Button variant="secondary">Open deployment logs</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PlatformConsolePage;
