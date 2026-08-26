import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, MessageCircle, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import cleanroomExercises from '../../content/cleanroom/data/exercises.json';

type Option = {
  letter: string;
  text: string;
  isCorrect?: boolean;
  feedback?: string;
};

type Question = {
  questionNumber: number;
  questionText?: string;
  correctAnswers?: string[];
  explanation?: string;
  options?: Option[];
};

type Exercise = {
  id: string;
  level: string;
  archetype: string;
  title: string;
  mainTextWithPlaceholders: string;
  learningObjectives: string[];
  questions: Question[];
};

const exercises = cleanroomExercises as Exercise[];

function labelForArchetype(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function DemoPage() {
  const [activeId, setActiveId] = useState(exercises[0]?.id ?? '');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const exercise = useMemo(
    () => exercises.find((candidate) => candidate.id === activeId) ?? exercises[0],
    [activeId],
  );

  if (!exercise) {
    return <main className="p-8">No demo fixtures are available.</main>;
  }

  const chooseExercise = (id: string): void => {
    setActiveId(id);
    setSelectedAnswers({});
    setRevealed({});
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <Link className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950" to="/landing">
              <ArrowLeft className="h-4 w-4" /> Back to Exameny
            </Link>
            <h1 className="mt-1 text-2xl font-semibold">Clean-room learning demo</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              to="/demo/speaking"
            >
              <MessageCircle className="h-4 w-4" /> Try speaking practice
            </Link>
            <Link
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              to="/demo/roles"
            >
              <Users className="h-4 w-4" /> View role workflows
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3">
          <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Eight activity types
          </p>
          <div className="space-y-1">
            {exercises.map((candidate) => (
              <button
                key={candidate.id}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  candidate.id === exercise.id ? 'bg-slate-950 text-white' : 'hover:bg-slate-100'
                }`}
                onClick={() => chooseExercise(candidate.id)}
                type="button"
              >
                <span className="block font-medium">{labelForArchetype(candidate.archetype)}</span>
                <span className={candidate.id === exercise.id ? 'text-slate-300' : 'text-slate-500'}>
                  {candidate.level}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">
            This static demo uses original fixtures and no remote account, analytics, or AI call. The full repository
            also contains authenticated learner, teacher, academy, and platform workflows.
          </div>

          <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-slate-950 px-3 py-1 font-medium text-white">{exercise.level}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {labelForArchetype(exercise.archetype)}
              </span>
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">{exercise.title}</h2>
            <div className="mt-5 whitespace-pre-line rounded-lg bg-slate-50 p-5 leading-8 text-slate-800">
              {exercise.mainTextWithPlaceholders}
            </div>

            <div className="mt-8 space-y-6">
              {exercise.questions.map((question) => {
                const selected = selectedAnswers[question.questionNumber];
                const selectedOption = question.options?.find((option) => option.letter === selected);
                const isRevealed = revealed[question.questionNumber];

                return (
                  <div key={question.questionNumber} className="rounded-xl border border-slate-200 p-5">
                    <h3 className="font-semibold">
                      {question.questionNumber}. {question.questionText ?? `Complete ${'{{' + question.questionNumber + '}}'}`}
                    </h3>

                    {question.options ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {question.options.map((option) => (
                          <button
                            key={option.letter}
                            className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
                              selected === option.letter
                                ? 'border-cyan-600 bg-cyan-50'
                                : 'border-slate-200 hover:border-slate-400'
                            }`}
                            onClick={() => setSelectedAnswers((current) => ({
                              ...current,
                              [question.questionNumber]: option.letter,
                            }))}
                            type="button"
                          >
                            <strong>{option.letter}.</strong> {option.text}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                        onClick={() => setRevealed((current) => ({
                          ...current,
                          [question.questionNumber]: !current[question.questionNumber],
                        }))}
                        type="button"
                      >
                        {isRevealed ? 'Hide sample answer' : 'Reveal sample answer'}
                      </button>
                    )}

                    {selectedOption && (
                      <div className={`mt-4 flex gap-3 rounded-lg p-4 text-sm leading-6 ${
                        selectedOption.isCorrect ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950'
                      }`}>
                        {selectedOption.isCorrect
                          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                          : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}
                        <p>{selectedOption.feedback}</p>
                      </div>
                    )}

                    {isRevealed && question.correctAnswers && (
                      <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                        <strong>Sample answer:</strong> {question.correctAnswers.join(' / ')}
                        {question.explanation && <p className="mt-1">{question.explanation}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>

          <aside className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Learning objectives</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
              {exercise.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}
