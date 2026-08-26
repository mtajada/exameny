import { Link, useLocation } from 'react-router-dom';
import { InviteFlowHarness } from '@/components/test-harness/InviteFlowHarness';
import { MultiAcademyHarness } from '@/components/test-harness/MultiAcademyHarness';
import { AwaitingActivationHarness } from '@/components/test-harness/AwaitingActivationHarness';
import { AdminRoleConversionHarness } from '@/components/test-harness/AdminRoleConversionHarness';
import { Button } from '@/components/ui/button';

const scenarios = [
  { id: 'invite-flow', label: 'Invite → waiting screen', component: InviteFlowHarness },
  { id: 'multi-academy', label: 'Multi-academy selector', component: MultiAcademyHarness },
  { id: 'awaiting-status', label: 'Awaiting → active', component: AwaitingActivationHarness },
  { id: 'admin-role', label: 'Admin role conversion', component: AdminRoleConversionHarness },
];

const TestHarnessPage = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const scenarioId = params.get('scenario') ?? scenarios[0]!.id;
  const activeScenario = scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0]!;
  const ScenarioComponent = activeScenario.component;

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">E2E Test Harness</p>
            <p className="text-sm text-muted-foreground">
              These scenarios mock Edge Function responses so Playwright can exercise onboarding, selector, and admin
              flows without remote Supabase access.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {scenarios.map((scenario) => (
              <Button
                key={scenario.id}
                asChild
                size="sm"
                variant={scenario.id === scenarioId ? 'default' : 'outline'}
              >
                <Link to={`/__tests__/harness?scenario=${scenario.id}`}>{scenario.label}</Link>
              </Button>
            ))}
          </div>
        </div>

        <ScenarioComponent />
      </div>
    </div>
  );
};

export default TestHarnessPage;
