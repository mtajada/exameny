import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudentTasks, StudentTask, StudentTaskFilterOption } from '@/hooks/useStudentTasks.ts';
import { Input } from '@/components/ui/input.tsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { TaskItemCard } from '@/components/dashboard/TaskItemCard.tsx';
import { TaskItemSkeleton } from '@/components/dashboard/TaskItemSkeleton.tsx';
import { AlertCircle, ClipboardList, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

type OriginFilter = 'all' | 'teacher' | 'ai';
type SkillFilter = 'all' | 'writing' | 'ruoe';
type FilterValue = 'all' | string;

type CountedOption = StudentTaskFilterOption<string> & { count: number };

type PillOption = { value: FilterValue; label: string; count?: number };

const getExamKey = (task: StudentTask) => `${task.examTypeId ?? 'unknown'}::${task.levelId ?? 'any'}`;
const getPartKey = (task: StudentTask) => (task.meta.partKey ? `${task.meta.skill}::${task.meta.sectionLabel}::${task.meta.partKey}` : null);

const buildCountMap = (tasks: StudentTask[], extract: (task: StudentTask) => string | null) => {
  const map = new Map<string, number>();
  for (const task of tasks) {
    const key = extract(task);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};

const buildOptionsWithCounts = (
  options: StudentTaskFilterOption<string>[],
  counts: Map<string, number>,
): CountedOption[] => options
  .map((option) => ({ ...option, count: counts.get(option.value) ?? 0 }))
  .filter((option) => option.count > 0);

const buildExamOptions = (
  options: StudentTaskFilterOption<string>[],
  counts: Map<string, number>,
): CountedOption[] => {
  const seen = new Set<string>();
  const result: CountedOption[] = [];

  for (const option of options) {
    const count = counts.get(option.value) ?? 0;
    seen.add(option.value);
    if (count > 0) {
      result.push({ ...option, count });
    }
  }

  for (const [value, count] of counts.entries()) {
    if (count > 0 && !seen.has(value)) {
      result.push({ value, label: 'Unspecified exam', count });
    }
  }

  return result;
};

const makePillClass = (active: boolean) => cn(
  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap flex items-center gap-1',
  active ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted text-muted-foreground border-transparent hover:border-border'
);

const FilterPill = ({ option, active, onSelect }: { option: PillOption; active: boolean; onSelect: (value: FilterValue) => void }) => (
  <button
    type="button"
    onClick={() => onSelect(option.value)}
    className={makePillClass(active)}
    aria-pressed={active}
  >
    <span>{option.label}</span>
    {typeof option.count === 'number' && (
      <span className="text-[10px] opacity-80">{option.count}</span>
    )}
  </button>
);

const FilterSection = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={cn('flex flex-col gap-2', className)}>
    <span className="text-sm text-muted-foreground">{label}</span>
    {children}
  </div>
);

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '-';
  }
};

export default function MyTasksPage() {
  const navigate = useNavigate();
  const { tasks, filters, loading, error, source } = useStudentTasks({ limit: 100 });
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [skill, setSkill] = useState<SkillFilter>('all');
  const [exam, setExam] = useState<FilterValue>('all');
  const [part, setPart] = useState<FilterValue>('all');

  const filteredBySkill = useMemo(
    () => (skill === 'all' ? tasks : tasks.filter((task) => task.meta.skill === skill)),
    [tasks, skill],
  );

  const examCounts = useMemo(() => buildCountMap(filteredBySkill, getExamKey), [filteredBySkill]);
  const examOptions = useMemo(
    () => buildExamOptions(filters.exams, examCounts),
    [filters.exams, examCounts],
  );
  const hasMultipleExamChoices = examOptions.length > 1;
  const singleExamOption = !hasMultipleExamChoices ? examOptions[0] : null;

  const tasksAfterExam = useMemo(
    () => (exam === 'all' ? filteredBySkill : filteredBySkill.filter((task) => getExamKey(task) === exam)),
    [filteredBySkill, exam],
  );

  const partCounts = useMemo(() => buildCountMap(tasksAfterExam, getPartKey), [tasksAfterExam]);
  const partCandidates = useMemo(
    () => (skill === 'all' ? [] : filters.parts.filter((option) => option.extra?.skill === skill)),
    [filters.parts, skill],
  );
  const partOptions = useMemo(
    () => buildOptionsWithCounts(partCandidates, partCounts),
    [partCandidates, partCounts],
  );

  const tasksAfterPart = useMemo(
    () => (part === 'all' ? tasksAfterExam : tasksAfterExam.filter((task) => getPartKey(task) === part)),
    [tasksAfterExam, part],
  );

  const tasksAfterOrigin = useMemo(
    () => (origin === 'all' ? tasksAfterPart : tasksAfterPart.filter((task) => task.origin === origin)),
    [tasksAfterPart, origin],
  );

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasksAfterOrigin;
    return tasksAfterOrigin.filter((task) => task.title?.toLowerCase().includes(q));
  }, [tasksAfterOrigin, query]);

  useEffect(() => {
    if (skill === 'all') {
      if (part !== 'all') setPart('all');
    }
  }, [skill, part]);

  useEffect(() => {
    if (exam !== 'all' && !examOptions.some((option) => option.value === exam)) {
      setExam('all');
    }
  }, [exam, examOptions]);

  useEffect(() => {
    if (part !== 'all' && !partOptions.some((option) => option.value === part)) {
      setPart('all');
    }
  }, [part, partOptions]);

  const totalAfterSkill = filteredBySkill.length;
  const totalAfterExam = tasksAfterExam.length;
  const _totalAfterPart = tasksAfterPart.length;

  const examPills: PillOption[] = useMemo(() => {
    if (!hasMultipleExamChoices) return [];
    const allOption: PillOption = { value: 'all', label: 'All exams', count: totalAfterSkill };
    const examSpecific = examOptions.map<PillOption>((option) => ({
      value: option.value,
      label: option.label,
      count: option.count,
    }));
    return [allOption, ...examSpecific];
  }, [hasMultipleExamChoices, examOptions, totalAfterSkill]);

  const partPills: PillOption[] = useMemo(() => {
    if (skill === 'all' || partOptions.length === 0) return [];
    const allOption: PillOption = { value: 'all', label: 'All parts', count: totalAfterExam };
    const specific = partOptions.map<PillOption>((option) => ({
      value: option.value,
      label: option.label,
      count: option.count,
    }));
    return [allOption, ...specific];
  }, [skill, partOptions, totalAfterExam]);

  const skillLabelMap = useMemo(
    () => new Map(filters.skills.map((option) => [option.value, option.label])),
    [filters.skills],
  );
  const examLabelMap = useMemo(
    () => new Map(filters.exams.map((option) => [option.value, option.label])),
    [filters.exams],
  );
  const partLabelMap = useMemo(
    () => new Map(filters.parts.map((option) => [option.value, option.label])),
    [filters.parts],
  );

  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (skill !== 'all') {
      chips.push({ key: 'skill', label: skillLabelMap.get(skill) ?? 'Skill', onClear: () => setSkill('all') });
    }
    if (exam !== 'all') {
      const label = examOptions.find((option) => option.value === exam)?.label ?? examLabelMap.get(exam) ?? 'Exam';
      chips.push({ key: 'exam', label, onClear: () => setExam('all') });
    }
    if (part !== 'all') {
      chips.push({ key: 'part', label: partLabelMap.get(part) ?? 'Part', onClear: () => setPart('all') });
    }
    if (origin !== 'all') {
      const originLabel = origin === 'teacher' ? 'Teacher assignments' : 'AI practice';
      chips.push({ key: 'origin', label: originLabel, onClear: () => setOrigin('all') });
    }
    if (query.trim()) {
      chips.push({ key: 'query', label: `Search: “${query.trim()}”`, onClear: () => setQuery('') });
    }
    return chips;
  }, [skill, exam, part, origin, query, skillLabelMap, examLabelMap, partLabelMap, examOptions]);

  const resetAllFilters = () => {
    setSkill('all');
    setExam('all');
    setPart('all');
    setOrigin('all');
    setQuery('');
  };

  const buildBadges = (task: StudentTask) => {
    const badges: { text: string; variant?: 'default' | 'secondary' | 'outline' }[] = [];
    const isRetryableStatus = task.status === 'in_progress' || task.status === 'completed';
    if (task.type === 'ruoe' && isRetryableStatus) {
      if (typeof task.attemptNumber === 'number') {
        badges.push({ text: `Attempt #${task.attemptNumber}`, variant: 'secondary' });
      }
      const statusLabel = task.status === 'completed' ? 'Completed' : 'In progress';
      badges.push({
        text: statusLabel,
        variant: task.status === 'completed' ? 'default' : 'outline',
      });
    }
    const levelBadge = task.levelCode ?? task.levelName ?? null;
    const fallBackExam = task.examTypeName ?? task.examTypeCode ?? null;
    if (levelBadge || fallBackExam) {
      badges.push({ text: levelBadge ?? fallBackExam!, variant: 'default' });
    }
    if (task.meta.partLabel) {
      badges.push({ text: task.meta.partLabel, variant: 'outline' });
    }
    return badges.length ? badges : undefined;
  };

  const buildMetaLine = (task: StudentTask) => {
    const segments: string[] = [task.meta.skillLabel];
    if (task.meta.sectionLabel && task.meta.sectionLabel !== task.meta.skillLabel) {
      segments.push(task.meta.sectionLabel);
    }
    const originSegment = task.origin === 'teacher'
      ? (task.teacherName ? `Teacher • ${task.teacherName}` : 'Teacher assignment')
      : 'AI practice';
    segments.push(originSegment);
    if (task.type === 'ruoe') {
      const isRetryableStatus = task.status === 'in_progress' || task.status === 'completed';
      if (isRetryableStatus) {
        const attemptLabel = typeof task.attemptNumber === 'number'
          ? `Attempt #${task.attemptNumber}`
          : 'Attempt';
        const statusLabel = task.status === 'completed' ? 'Completed' : 'In progress';
        segments.push(`${attemptLabel} (${statusLabel})`);
      }
    }
    return segments.join(' • ');
  };

  const groups = useMemo(() => {
    const homework: StudentTask[] = [];
    const inProgress: StudentTask[] = [];
    const done: StudentTask[] = [];
    for (const task of filteredTasks) {
      const isHomework = task.origin === 'teacher' && task.status !== 'evaluated' && task.status !== 'completed';
      if (isHomework) {
        homework.push(task);
      } else if (task.status === 'in_progress') {
        inProgress.push(task);
      } else if (task.status === 'evaluated' || task.status === 'completed') {
        done.push(task);
      }
    }
    return { homework, inProgress, done };
  }, [filteredTasks]);

  const summaryText = `Showing ${filteredTasks.length} tasks.`;

  return (
    <div className="container mx-auto p-6 md:p-8 max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">My Tasks</h1>
        <p className="text-sm text-muted-foreground">
          View your tasks by status. Homework shows assignments from your teacher that you still need to finish, In progress shows what you’re currently working on, and Completed shows finished work with results. Use search and filters to focus, and click any card to continue or review.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5" aria-label="Task filters">
          <div className="flex flex-col gap-2">
            <label htmlFor="task-search" className="sr-only">Search by title</label>
            <Input
              id="task-search"
              type="search"
              placeholder="Search by title"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search by title"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <FilterSection label="Skill">
              <ToggleGroup type="single" value={skill} onValueChange={(value) => setSkill((value as SkillFilter) || 'all')}>
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="writing">Writing</ToggleGroupItem>
                <ToggleGroupItem value="ruoe">R&amp;UoE</ToggleGroupItem>
              </ToggleGroup>
            </FilterSection>

            <FilterSection label="Origin">
              <ToggleGroup type="single" value={origin} onValueChange={(value) => setOrigin((value as OriginFilter) || 'all')} aria-label="Filter by origin">
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="teacher">
                  <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" aria-hidden="true" /> Teacher</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="ai">
                  <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </FilterSection>

            <FilterSection label="Exam">
              {hasMultipleExamChoices ? (
                <div className="flex flex-wrap gap-2">
                  {examPills.map((option) => (
                    <FilterPill
                      key={`exam-${option.value}`}
                      option={option}
                      active={exam === option.value}
                      onSelect={(value) => setExam(value)}
                    />
                  ))}
                </div>
              ) : singleExamOption ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{singleExamOption.label}</Badge>
                  <span className="text-xs text-muted-foreground">{singleExamOption.count} tasks</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No exam metadata yet.</p>
              )}
            </FilterSection>
          </div>

          {skill === 'all' && filters.parts.length > 0 && (
            <FilterSection label="Part">
              <p className="text-xs text-muted-foreground">Choose a skill above to filter by part.</p>
            </FilterSection>
          )}

          {partPills.length > 0 && (
            <FilterSection label="Part">
              <div className="flex flex-wrap gap-2">
                {partPills.map((option) => (
                  <FilterPill
                    key={`part-${option.value}`}
                    option={option}
                    active={part === option.value}
                    onSelect={(value) => setPart(value)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1" aria-label="Active filters">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Active filters</span>
              {activeFilters.map((chip) => (
                <Badge key={chip.key} variant="outline" className="flex items-center gap-1 text-xs">
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onClear}
                    aria-label={`Remove ${chip.label} filter`}
                    className="rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={resetAllFilters}>Reset</Button>
            </div>
          )}

          <div className="sr-only" aria-live="polite">{summaryText}</div>
        </CardContent>
      </Card>

      {(source.assigned.error || source.submissions.error || source.ruoe.error) && (
        <div className="space-y-2">
          {source.assigned.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn’t load assigned prompts</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span className="mr-4">{source.assigned.error}</span>
                <Button size="sm" variant="outline" onClick={() => source.assigned.refetch?.()}>Retry</Button>
              </AlertDescription>
            </Alert>
          )}
          {source.submissions.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn’t load writing submissions</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span className="mr-4">{source.submissions.error}</span>
                <Button size="sm" variant="outline" onClick={() => source.submissions.refetch?.()}>Retry</Button>
              </AlertDescription>
            </Alert>
          )}
          {source.ruoe.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn’t load R&amp;UoE attempts</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span className="mr-4">{source.ruoe.error}</span>
                <Button size="sm" variant="outline" onClick={() => source.ruoe.refetch?.()}>Retry</Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" aria-busy="true">
          <TaskItemSkeleton />
          <TaskItemSkeleton />
          <TaskItemSkeleton />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading tasks</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card role="region" aria-labelledby="col-homework-title" className="min-h-[200px]">
            <CardHeader className="py-3">
              <CardTitle id="col-homework-title" className="text-base">Homework</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {groups.homework.length === 0 ? (
                <div className="text-xs text-muted-foreground">No items</div>
              ) : (
                groups.homework.map((task) => (
                  <TaskItemCard
                    key={`${task.type}-${task.id}`}
                    id={`${task.type}-${task.id}`}
                    origin={task.origin}
                    title={task.title}
                    description={task.description}
                    date={formatDate(task.date)}
                    onClick={() => navigate(task.navTarget.to, task.navTarget.state ? { state: task.navTarget.state } : undefined)}
                    meta={buildMetaLine(task)}
                    badges={buildBadges(task)}
                    estimatedMinutes={task.estimatedMinutes}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="col-inprogress-title" className="min-h-[200px]">
            <CardHeader className="py-3">
              <CardTitle id="col-inprogress-title" className="text-base">In progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {groups.inProgress.length === 0 ? (
                <div className="text-xs text-muted-foreground">No items</div>
              ) : (
                groups.inProgress.map((task) => (
                  <TaskItemCard
                    key={`${task.type}-${task.id}`}
                    id={`${task.type}-${task.id}`}
                    origin={task.origin}
                    title={task.title}
                    description={task.description}
                    date={formatDate(task.date)}
                    onClick={() => navigate(task.navTarget.to, task.navTarget.state ? { state: task.navTarget.state } : undefined)}
                    meta={buildMetaLine(task)}
                    badges={buildBadges(task)}
                    estimatedMinutes={task.estimatedMinutes}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="col-done-title" className="min-h-[200px]">
            <CardHeader className="py-3">
              <CardTitle id="col-done-title" className="text-base">Completed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {groups.done.length === 0 ? (
                <div className="text-xs text-muted-foreground">No items</div>
              ) : (
                groups.done.map((task) => (
                  <TaskItemCard
                    key={`${task.type}-${task.id}`}
                    id={`${task.type}-${task.id}`}
                    origin={task.origin}
                    title={task.title}
                    description={task.description}
                    date={formatDate(task.date)}
                    onClick={() => navigate(task.navTarget.to, task.navTarget.state ? { state: task.navTarget.state } : undefined)}
                    meta={buildMetaLine(task)}
                    badges={buildBadges(task)}
                    scorePercent={typeof task.score === 'number' ? task.score : undefined}
                    scoreTooltip={typeof task.score === 'number' ? `${Math.round(task.score)}%` : undefined}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
