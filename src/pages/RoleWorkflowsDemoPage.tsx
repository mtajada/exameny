import { useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  School,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

type RoleId = 'learner' | 'teacher' | 'academy';

type Workflow = {
  id: RoleId;
  label: string;
  summary: string;
  icon: typeof GraduationCap;
  steps: Array<{
    title: string;
    detail: string;
  }>;
  evidence: Array<{
    label: string;
    value: string;
  }>;
};

const workflows: Workflow[] = [
  {
    id: 'learner',
    label: 'Learner',
    summary: 'Practise, understand feedback, and choose the next useful task.',
    icon: GraduationCap,
    steps: [
      {
        title: 'Open an assigned or independent activity',
        detail: 'Choose an original writing, reading, or language-use task suited to the target level.',
      },
      {
        title: 'Submit a response',
        detail: 'Complete the activity and keep the answer connected to its instructions and learning goals.',
      },
      {
        title: 'Review explained feedback',
        detail: 'See evidence, corrections, and a focused recommendation instead of an unexplained score.',
      },
    ],
    evidence: [
      { label: 'Current focus', value: 'Linking ideas clearly' },
      { label: 'Completed this week', value: '3 original activities' },
      { label: 'Suggested next step', value: 'Revise contrast connectors' },
    ],
  },
  {
    id: 'teacher',
    label: 'Teacher',
    summary: 'Set purposeful work and use learner evidence to guide support.',
    icon: BookOpenCheck,
    steps: [
      {
        title: 'Prepare an assignment',
        detail: 'Select a level, skill, learning objective, and due date for a learner or class.',
      },
      {
        title: 'Follow submissions',
        detail: 'See which activities are ready for review without exposing data outside the configured service.',
      },
      {
        title: 'Turn patterns into teaching actions',
        detail: 'Use recurring mistakes and progress evidence to plan the next lesson or individual intervention.',
      },
    ],
    evidence: [
      { label: 'Assigned', value: 'Opinion writing · B2' },
      { label: 'Review queue', value: '2 synthetic submissions' },
      { label: 'Class focus', value: 'Supporting claims with examples' },
    ],
  },
  {
    id: 'academy',
    label: 'Academy',
    summary: 'Coordinate people, classes, and permissions from one workspace.',
    icon: School,
    steps: [
      {
        title: 'Organise the learning community',
        detail: 'Create classes and connect teachers and learners with explicit roles.',
      },
      {
        title: 'Manage access',
        detail: 'Invite members, review pending access, and keep administrative actions separate from teaching.',
      },
      {
        title: 'Monitor learning activity',
        detail: 'Use aggregate progress signals to support delivery without turning the demo into a source of real data.',
      },
    ],
    evidence: [
      { label: 'Demo classes', value: '2 synthetic groups' },
      { label: 'Members', value: '8 fictional accounts' },
      { label: 'Pending invitations', value: '1 synthetic invitation' },
    ],
  },
];

export default function RoleWorkflowsDemoPage() {
  const [activeRole, setActiveRole] = useState<RoleId>('learner');
  const workflow = workflows.find((candidate) => candidate.id === activeRole) ?? workflows[0];
  const ActiveIcon = workflow.icon;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <Link className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950" to="/demo">
              <ArrowLeft className="h-4 w-4" /> Back to the activity demo
            </Link>
            <h1 className="mt-1 text-2xl font-semibold">Role workflows</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4" /> Synthetic data only
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-700">One connected product</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight">See how each role supports the learning loop.</h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            This public walkthrough explains the authenticated product without creating an account or contacting a
            hosted database. Every name, count, and activity below is fictional.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3" role="tablist" aria-label="Role workflow">
          {workflows.map(({ id, label, summary, icon: Icon }) => (
            <button
              key={id}
              aria-controls={`workflow-${id}`}
              aria-selected={activeRole === id}
              className={`rounded-xl border p-5 text-left transition ${
                activeRole === id
                  ? 'border-slate-950 bg-slate-950 text-white shadow-lg'
                  : 'border-slate-200 bg-white hover:border-slate-400'
              }`}
              id={`role-${id}`}
              onClick={() => setActiveRole(id)}
              role="tab"
              type="button"
            >
              <Icon className={`h-6 w-6 ${activeRole === id ? 'text-cyan-300' : 'text-cyan-700'}`} />
              <span className="mt-4 block font-semibold">{label}</span>
              <span className={`mt-2 block text-sm leading-6 ${activeRole === id ? 'text-slate-300' : 'text-slate-600'}`}>
                {summary}
              </span>
            </button>
          ))}
        </div>

        <div
          aria-labelledby={`role-${workflow.id}`}
          className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]"
          id={`workflow-${workflow.id}`}
          role="tabpanel"
        >
          <article className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-50 p-3 text-cyan-800">
                <ActiveIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-slate-500">{workflow.label} workflow</p>
                <h3 className="text-xl font-semibold">From action to useful evidence</h3>
              </div>
            </div>

            <ol className="mt-8 space-y-7">
              {workflow.steps.map((step, index) => (
                <li className="grid grid-cols-[36px_1fr] gap-4" key={step.title}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h4 className="font-semibold">{step.title}</h4>
                    <p className="mt-1 leading-7 text-slate-600">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-cyan-700" />
              <h3 className="font-semibold">Example evidence</h3>
            </div>
            <dl className="mt-5 space-y-4">
              {workflow.evidence.map((item) => (
                <div className="rounded-xl bg-slate-50 p-4" key={item.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</dt>
                  <dd className="mt-2 font-medium text-slate-900">{item.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex gap-3 rounded-xl bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">
              <Users className="mt-0.5 h-5 w-5 shrink-0" />
              <p>The repository includes the authenticated implementation; this walkthrough remains safe to open.</p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
