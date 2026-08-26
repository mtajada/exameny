import { ArrowRight, BookOpenCheck, GraduationCap, School, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const capabilities = [
  {
    icon: GraduationCap,
    title: 'Practise with purpose',
    text: 'Work through original writing, reading, and language-use activities calibrated from B1 to C2.',
  },
  {
    icon: BookOpenCheck,
    title: 'Understand the feedback',
    text: 'Review explanations, evidence, and next steps instead of receiving an unexplained score.',
  },
  {
    icon: School,
    title: 'Support a learning community',
    text: 'Teachers can assign work and review progress. Academies can manage classes, members, and roles.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link className="text-xl font-semibold tracking-tight" to="/landing">
          Exameny
        </Link>
        <nav className="flex items-center gap-3" aria-label="Primary navigation">
          <Link className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white" to="/demo">
            Public demo
          </Link>
          <Link
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/10"
            to="/auth"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:pt-24">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Open source English learning
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl">
            Better exam preparation starts with better feedback.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
            Exameny gives learners a place to practise, understand their mistakes, and build a clear record of
            progress. Teachers and academies can use the same workflow to assign work and support each learner.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200"
              to="/demo"
            >
              Explore the public demo <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              className="rounded-lg border border-white/20 px-5 py-3 font-semibold hover:bg-white/10"
              href="#how-it-works"
            >
              How it works
            </a>
          </div>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl shadow-cyan-950/30">
          <p className="text-sm font-medium text-cyan-300">A complete learning loop</p>
          <ol className="mt-5 space-y-5 text-slate-200">
            <li><strong className="text-white">1. Practise.</strong> Complete an original task suited to your level.</li>
            <li><strong className="text-white">2. Review.</strong> Inspect feedback tied to evidence in your response.</li>
            <li><strong className="text-white">3. Improve.</strong> Use progress and mistake patterns to choose the next task.</li>
          </ol>
          <div className="mt-7 flex gap-3 rounded-xl bg-slate-900/80 p-4 text-sm leading-6 text-slate-300">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
            <p>The public demo uses synthetic data and sends no learner information to a hosted service.</p>
          </div>
        </aside>
      </section>

      <section id="how-it-works" className="bg-white py-20 text-slate-950">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight">One product for the people doing the learning</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-slate-200 p-6">
                <Icon className="h-6 w-6 text-cyan-700" />
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-slate-400">
        Exameny is an independent project. It is not affiliated with or endorsed by an examination provider.
      </footer>
    </main>
  );
}
