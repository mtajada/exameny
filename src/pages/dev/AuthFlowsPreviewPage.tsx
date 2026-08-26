import * as React from 'react';
import { Mail } from 'lucide-react';

import { AuthShell } from '@/components/auth/AuthShell';
import { AuthCard } from '@/components/auth/AuthCard';
import { OnboardingCard } from '@/components/auth/onboarding/OnboardingCard';
import { WaitingScreen } from '@/components/auth/onboarding/WaitingScreen';
import { AcademySelector } from '@/components/auth/onboarding/AcademySelector';
import type { MembershipSummary } from '@/contexts/AuthContextBase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveAuthMethodFlags } from '@/lib/auth/authFlags';

const oauthConfigs = [
  {
    provider: 'google' as const,
    label: 'Google',
    description: 'Workspace & Gmail',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d="M21.6 12.227c0-.638-.057-1.251-.164-1.84H12v3.48h5.4c-.232 1.247-.94 2.302-1.996 3.017v2.511h3.236c1.896-1.745 2.96-4.315 2.96-7.168Z"
          fill="#4285F4"
        />
        <path
          d="M12 22c2.7 0 4.968-.884 6.624-2.398l-3.236-2.51c-.9.612-2.05.973-3.388.973-2.607 0-4.813-1.761-5.6-4.13H3.05v2.594C4.695 19.887 8.092 22 12 22Z"
          fill="#34A853"
        />
        <path
          d="M6.4 13.935a5.987 5.987 0 0 1 0-3.87V7.471H3.05a10 10 0 0 0 0 9.058L6.4 13.935Z"
          fill="#FBBC05"
        />
        <path
          d="M12 6.153c1.471 0 2.794.506 3.836 1.5l2.872-2.872C16.96 2.99 14.7 2 12 2 8.091 2 4.695 4.113 3.05 7.471l3.35 2.594C7.187 7.914 9.394 6.153 12 6.153Z"
          fill="#EA4335"
        />
      </svg>
    ),
  },
  {
    provider: 'azure' as const,
    label: 'Microsoft',
    description: 'Microsoft 365',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <rect x="2" y="2" width="9" height="9" fill="#F25022" rx="0.5" />
        <rect x="13" y="2" width="9" height="9" fill="#7FBA00" rx="0.5" />
        <rect x="2" y="13" width="9" height="9" fill="#00A4EF" rx="0.5" />
        <rect x="13" y="13" width="9" height="9" fill="#FFB900" rx="0.5" />
      </svg>
    ),
  },
];

const mockInactiveMemberships: MembershipSummary[] = [
  {
    membershipId: 101,
    academyId: 1001,
    academyName: 'Oxford Language Lab',
    role: 'student',
    status: 'inactive',
    subscriptionStartDate: '2024-01-01',
    subscriptionEndDate: '2024-06-01',
  },
];

const mockActiveMemberships: MembershipSummary[] = [
  {
    membershipId: 201,
    academyId: 2001,
    academyName: 'BrightFuture Academy',
    role: 'student',
    status: 'active',
    subscriptionStartDate: '2024-05-10',
    subscriptionEndDate: null,
  },
  {
    membershipId: 202,
    academyId: 2002,
    academyName: 'Global English Institute',
    role: 'teacher',
    status: 'active',
    subscriptionStartDate: '2024-02-15',
    subscriptionEndDate: null,
  },
  {
    membershipId: 203,
    academyId: 2003,
    academyName: 'independent English Prep Center',
    role: 'academy_admin',
    status: 'awaiting_login',
    subscriptionStartDate: '2024-03-01',
    subscriptionEndDate: null,
  },
];

const examOptions = [
  { id: 1, name: 'independent English B2 First' },
  { id: 2, name: 'independent English C1 Advanced' },
];

const levelOptions = [
  { id: 10, examId: 1, name: 'Upper-Intermediate', code: 'B2' },
  { id: 11, examId: 1, name: 'First For Schools', code: 'B2 Schools' },
  { id: 20, examId: 2, name: 'Advanced', code: 'C1' },
];

const PreviewSection: React.FC<{ id: string; title: string; caption?: string; children: React.ReactNode }> = ({
  id,
  title,
  caption,
  children,
}) => (
  <section
    data-testid={id}
    className="space-y-6 rounded-2xl border border-border/60 bg-background p-6 shadow-sm lg:p-8"
  >
    <header className="space-y-1">
      {caption ? (
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{caption}</span>
      ) : null}
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </header>
    <div className="overflow-hidden rounded-xl border border-border/60 bg-slate-100">{children}</div>
  </section>
);

export default function AuthFlowsPreviewPage() {
  const [previewFullName, setPreviewFullName] = React.useState('');
  const [selectedExam, setSelectedExam] = React.useState<string>('1');
  const [selectedLevel, setSelectedLevel] = React.useState<string>('10');
  const authFlags = React.useMemo(() => resolveAuthMethodFlags(), []);
  const enabledOAuthConfigs = React.useMemo(
    () =>
      oauthConfigs.filter((config) => {
        if (config.provider === 'google') {
          return authFlags.google;
        }
        return authFlags.microsoft;
      }),
    [authFlags],
  );
  const showOAuth = enabledOAuthConfigs.length > 0;
  const showMagicLink = authFlags.magicLink;

  const filteredLevels = React.useMemo(
    () => levelOptions.filter((level) => !selectedExam || String(level.examId) === selectedExam),
    [selectedExam],
  );

  const [magicLinkEmail, setMagicLinkEmail] = React.useState('student@example.com');

  return (
    <div className="min-h-screen space-y-10 bg-slate-100 px-4 py-10 sm:px-8">
      <PreviewSection id="auth-screen" title="Sign-in hub" caption="/auth">
        <AuthShell contentWidth="lg">
          <AuthCard title="Sign in" description="Access your Exameny workspace.">
            {showOAuth ? (
              <div className="grid gap-3">
                {enabledOAuthConfigs.map((config) => (
                  <PreviewOAuthButton key={config.provider} label={config.label} description={config.description}>
                    {config.icon}
                  </PreviewOAuthButton>
                ))}
              </div>
            ) : null}
            {showMagicLink ? (
              <>
                {showOAuth ? (
                  <div className="relative flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border/70" aria-hidden="true" />
                    <span className="font-medium uppercase tracking-[0.18em]">Email</span>
                    <span className="h-px flex-1 bg-border/70" aria-hidden="true" />
                  </div>
                ) : null}
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                  }}
                >
                  <div className="space-y-2 text-left">
                    <Label className="text-sm font-medium" htmlFor="preview-magic-link-email">
                      Invited email address
                    </Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="preview-magic-link-email"
                        type="email"
                        autoComplete="email"
                        className="h-12 rounded-md border-border/70 bg-background pl-10"
                        value={magicLinkEmail}
                        onChange={(event) => setMagicLinkEmail(event.target.value)}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="h-12 w-full rounded-md text-sm font-semibold">
                    Email me a Magic Link
                  </Button>
                </form>
              </>
            ) : null}
            <p className="rounded-md border border-dashed border-border/70 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              Need access? Ask your academy administrator to invite you so memberships stay in sync.
            </p>
          </AuthCard>
        </AuthShell>
      </PreviewSection>

      <PreviewSection id="onboarding-step-1" title="Profile setup — Name" caption="Onboarding step 1">
        <AuthShell contentWidth="lg">
          <OnboardingCard
            title="What's your name?"
            description="Share your full name so we can match you to the right classes."
          >
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <div className="space-y-1.5">
                <Label className="text-sm font-medium" htmlFor="preview-full-name">
                  Full name
                </Label>
                <Input
                  id="preview-full-name"
                  placeholder="e.g., Anna Greene"
                  value={previewFullName}
                  onChange={(event) => setPreviewFullName(event.target.value)}
                  className="h-12 rounded-md"
                />
              </div>
              <Button className="h-12 w-full rounded-md text-sm font-semibold" type="submit">
                Save and continue
              </Button>
            </form>
          </OnboardingCard>
        </AuthShell>
      </PreviewSection>

      <PreviewSection id="onboarding-step-2" title="Profile setup — Goal" caption="Onboarding step 2">
        <AuthShell contentWidth="lg">
          <OnboardingCard
            title="Choose your goal"
            description="Pick the exam and level you're preparing for."
          >
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <div className="space-y-1.5">
                <Label className="text-sm font-medium" htmlFor="preview-exam">
                  Exam
                </Label>
                <Select
                  value={selectedExam}
                  onValueChange={(value) => {
                    setSelectedExam(value);
                    const firstLevel = levelOptions.find((level) => String(level.examId) === value);
                    setSelectedLevel(firstLevel ? String(firstLevel.id) : '');
                  }}
                >
                  <SelectTrigger id="preview-exam" className="h-12 rounded-md">
                    <SelectValue placeholder="Select an exam" />
                  </SelectTrigger>
                  <SelectContent>
                    {examOptions.map((exam) => (
                      <SelectItem key={exam.id} value={String(exam.id)}>
                        {exam.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium" htmlFor="preview-level">
                  Level
                </Label>
                <Select value={selectedLevel} onValueChange={(value) => setSelectedLevel(value)}>
                  <SelectTrigger id="preview-level" className="h-12 rounded-md">
                    <SelectValue placeholder="Select a level" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredLevels.map((level) => (
                      <SelectItem key={level.id} value={String(level.id)}>
                        {level.name} ({level.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="h-12 w-full rounded-md text-sm font-semibold" type="submit">
                Save and continue
              </Button>
            </form>
          </OnboardingCard>
        </AuthShell>
      </PreviewSection>

      <PreviewSection id="waiting-screen" title="Waiting screen" caption="No active academies">
        <AuthShell contentWidth="lg">
          <WaitingScreen
            variant="no-academy"
            membershipsInactive={mockInactiveMemberships}
            onRetry={() => Promise.resolve()}
            onLogout={() => Promise.resolve()}
          />
        </AuthShell>
      </PreviewSection>

      <PreviewSection id="academy-selector" title="Academy selector" caption="Membership switcher">
        <AuthShell contentWidth="lg">
          <AcademySelector
            memberships={mockActiveMemberships}
            activeAcademyId={2001}
            pendingAcademyId={null}
            error={null}
            onSelect={() => Promise.resolve()}
          />
        </AuthShell>
      </PreviewSection>
    </div>
  );
}

const PreviewOAuthButton: React.FC<{ label: string; description: string; children: React.ReactNode }> = ({
  label,
  description,
  children,
}) => (
  <div className="h-12 w-full rounded-md border border-border/70 bg-background px-4 py-2 shadow-sm">
    <div className="flex h-full items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-border/70 bg-white">{children}</span>
      <span className="flex flex-col items-start text-left">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </div>
  </div>
);
