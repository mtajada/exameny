import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatAuthMethodList, resolveAuthMethodFlags } from '@/lib/auth/authFlags';

const authMethodList = formatAuthMethodList(resolveAuthMethodFlags());

const stepContent = [
  {
    title: 'Invite email sent',
    description:
      'The academy admin created an awaiting_login membership and sent the template email pointing to /auth.',
    button: 'Simulate OAuth login',
    body: (
      <p className="text-sm text-muted-foreground">
        This mirrors the copy from invite-members and confirms the remote entry point stays passive until the user logs
        in.
      </p>
    ),
  },
  {
    title: 'OAuth provider callback',
    description:
      `The user chose ${authMethodList} to sign in. Supabase Auth redirected back to /auth with a pending session.`,
    button: 'Finalize invitation',
    body: (
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>auth-finalize-signup will lock every awaiting_login invitation for this email.</li>
        <li>ROLE_CONFLICT and alias incidents are surfaced before any UI changes.</li>
      </ul>
    ),
  },
  {
    title: 'finalize_invited_signup()',
    description:
      'Edge Function claimed the invitations, reconciled user_preferences.active_academy_id, and returned metadata.',
    button: 'Complete onboarding',
    body: (
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>memberships_claimed includes every membership promoted in this session.</li>
        <li>should_refresh_session is true so the client regenerates JWT claims.</li>
      </ul>
    ),
  },
];

export const InviteFlowHarness = () => {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [submittedName, setSubmittedName] = useState<string | null>(null);

  if (step <= 2) {
    const content = stepContent[step];
    return (
      <Card data-testid="invite-step-card" className="max-w-2xl border border-dashed">
        <CardHeader>
          <CardTitle>{content.title}</CardTitle>
          <CardDescription>{content.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {content.body}
          <Button
            className="w-full"
            data-testid="invite-step-button"
            onClick={() => setStep((prev) => prev + 1)}
          >
            {content.button}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 3) {
    return (
      <Card className="max-w-xl border border-primary/30">
        <CardHeader>
          <CardTitle>Onboarding — Full name</CardTitle>
          <CardDescription>
            The user must provide a full name before dashboards unlock. This replicates the first screen inside
            OnboardingFlow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="text-sm font-medium" htmlFor="harness-full-name">
            Full name
          </label>
          <Input
            id="harness-full-name"
            data-testid="onboarding-name-input"
            placeholder="e.g., Maria Santos"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
          <Button
            data-testid="onboarding-save-button"
            onClick={() => {
              setSubmittedName(fullName.trim() || null);
              setStep(4);
            }}
            disabled={fullName.trim().length === 0}
          >
            Save name
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="waiting-screen" className="max-w-2xl border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle>You don&apos;t have any active academies yet.</CardTitle>
        <CardDescription>Waiting screen copy after onboarding and finalize_invited_signup.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your academy hasn&apos;t granted you access yet. We&apos;ll refresh finalize_invited_signup when you click
          Retry, or you can sign out safely.
        </p>
        <p className="text-sm font-medium">Submitted name: {submittedName ?? 'Not provided'}</p>
        <div className="flex gap-3">
          <Button variant="default">Retry finalize flow</Button>
          <Button variant="outline">Sign out</Button>
        </div>
      </CardContent>
    </Card>
  );
};
