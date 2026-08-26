import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Trophy, Edit3, BookOpen, ArrowRight, TrendingUp, Eye, CheckCircle, ChevronDown, MessagesSquare } from 'lucide-react';
import { useStudentTasks } from '@/hooks/useStudentTasks';
import { TaskItemCard } from './TaskItemCard';
import { TaskFilters, TypeFilter, StatusFilter } from './TaskFilters';
import { useProgressTeaser } from '@/hooks/useProgressTeaser';
import { TaskItemSkeleton } from './TaskItemSkeleton';

type DashboardLocationState = {
  focus?: StatusFilter;
  at?: number;
};

const isDashboardLocationState = (state: unknown): state is DashboardLocationState => {
  if (!state || typeof state !== 'object') return false;
  const candidate = state as { focus?: unknown; at?: unknown };
  const focus = candidate.focus;
  const at = candidate.at;
  const isValidFocus =
    focus === undefined ||
    focus === 'all' ||
    focus === 'homework' ||
    focus === 'in_progress' ||
    focus === 'completed';
  const isValidAt = at === undefined || typeof at === 'number';
  return isValidFocus && isValidAt;
};

const PAGINATED_STATUSES: StatusFilter[] = ['all', 'in_progress', 'completed'];
const PAGE_SIZE = 10;

const StudentDashboard: React.FC = () => {
  const { user, userPreferences } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = isDashboardLocationState(location.state) ? location.state : null;

  const { tasks, loading, error, source } = useStudentTasks({ limit: Number.POSITIVE_INFINITY, includeAllHomework: true });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const { completedThisWeek } = useProgressTeaser();
  const preferencesLoaded = userPreferences !== null;
  const userName = userPreferences?.fullName?.trim() || user?.email || 'Student';

  // Count homework items (teacher-assigned and not finished)
  const homeworkCount = useMemo(() => (
    tasks.filter((t) => t.origin === 'teacher' && t.status !== 'evaluated' && t.status !== 'completed').length
  ), [tasks]);

  const filteredTasks = tasks.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (statusFilter !== 'all') {
      // Map "completed" to include Writing evaluated + RUoE completed
      if (statusFilter === 'completed') {
        if (!(t.status === 'evaluated' || t.status === 'completed')) return false;
      } else if (statusFilter === 'homework') {
        // Homework = teacher-origin tasks not yet finished (not evaluated/completed)
        if (!(t.origin === 'teacher' && t.status !== 'evaluated' && t.status !== 'completed')) return false;
      } else if (t.status !== statusFilter) return false;
    }
    return true;
  });

  const isPaginatedStatus = PAGINATED_STATUSES.includes(statusFilter);
  const totalFiltered = filteredTasks.length;
  const showingCount = isPaginatedStatus ? Math.min(visibleCount, totalFiltered) : totalFiltered;
  const displayedTasks = isPaginatedStatus ? filteredTasks.slice(0, showingCount) : filteredTasks;
  const canLoadMore = isPaginatedStatus && showingCount < totalFiltered;

  useEffect(() => {
    if (!isPaginatedStatus) return;
    setVisibleCount(PAGE_SIZE);
  }, [statusFilter, typeFilter, isPaginatedStatus]);

  const focusTarget = locationState?.focus;

  // Initialize/update filter from URL or navigation state (e.g., ?status=homework)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const s = params.get('status');
    if (s === 'homework' || s === 'in_progress' || s === 'completed' || s === 'all') {
      if (statusFilter !== s) setStatusFilter(s as StatusFilter);
    }
    // Handle header-triggered focus even if URL didn't change
    if (focusTarget === 'homework' && statusFilter !== 'homework') {
      setStatusFilter('homework');
    }
  }, [location.search, focusTarget, statusFilter]);

  // Keep URL in sync when user changes the status filter from the UI
  const handleStatusChange = (val: StatusFilter) => {
    if (!val || val === statusFilter) return;
    setStatusFilter(val);
    const params = new URLSearchParams(location.search);
    if (val === 'all') {
      params.delete('status');
    } else {
      params.set('status', val);
    }
    const search = params.toString();
    const hash = location.hash || '#task-filters';
    navigate(`/dashboard${search ? `?${search}` : ''}${hash}`, { replace: true });
  };

  const handleLoadMore = () => setVisibleCount((prev) => prev + PAGE_SIZE);

  const handleStartWriting = () => navigate('/select-ai-task-type');
  const handleStartRuoE = () => navigate('/select-ai-task-type?type=ruoe');
  const handleStartSpeaking = () => navigate('/speaking');
  const actionsGridColsLg = 'lg:grid-cols-3';

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return '-'; }
  };

  const liveSummary = (() => {
    const status = statusFilter === 'all' ? 'all statuses' : statusFilter.replace('_', ' ');
    const type = typeFilter === 'all' ? 'all types' : (typeFilter === 'ruoe' ? 'R and UoE' : 'Writing');
    if (totalFiltered === 0) {
      return `No ${type} tasks for ${status}.`;
    }
    if (showingCount < totalFiltered) {
      return `Showing ${showingCount} of ${totalFiltered} ${type} tasks for ${status}.`;
    }
    return `Showing all ${totalFiltered} ${type} tasks for ${status}.`;
  })();

  // Smooth-scroll to anchor if provided (header link uses #task-filters)
  useEffect(() => {
    const hash = location.hash;
    if (!hash) return;
    const id = hash.replace('#', '');
    // Delay slightly to ensure content is mounted
    const t = setTimeout(() => {
      const el = document.getElementById(id) || document.querySelector(hash);
      if (el && 'scrollIntoView' in el) {
        try { (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* no-op */ }
      }
    }, 50);
    return () => clearTimeout(t);
  }, [location.hash, loading]);

  return (
    <div className="container mx-auto p-6 md:p-8 max-w-6xl space-y-10">
      {/* Skip links for accessibility */}
      <div className="sr-only focus-within:not-sr-only absolute top-2 left-2 z-50 bg-white dark:bg-slate-900 border rounded shadow p-2 space-x-2">
        <a href="#my-tasks" className="underline">Skip to My Tasks</a>
        <a href="#task-filters" className="underline">Skip to Filters</a>
      </div>
      <div className="text-center space-y-4">
        {preferencesLoaded ? (
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Welcome, {userName}!</h1>
        ) : (
          <Skeleton className="h-10 w-3/4 mx-auto" />
        )}

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${actionsGridColsLg} gap-4 max-w-4xl mx-auto`}>
          {/* Start Writing - Primary Action */}
          <Card
            className="cursor-pointer group hover:shadow-lg hover:-translate-y-1 transition-all duration-200 border-2 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:border-primary focus-visible:shadow-lg bg-gradient-to-br from-primary/5 to-primary/10"
            onClick={handleStartWriting}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleStartWriting(); } }}
            role="button"
            tabIndex={0}
            aria-label="Start writing practice - Create essays, articles, and other writing tasks"
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-3 p-3 rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Edit3 className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900 group-hover:text-primary transition-colors">
                Start Writing
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Essays, articles, reviews, and more
              </p>
              <div className="flex items-center justify-center gap-1 mt-2 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-sm font-medium">Begin practice</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </CardHeader>
          </Card>

          {/* Start R&UoE - Secondary Action */}
          <Card
            className="cursor-pointer group hover:shadow-lg hover:-translate-y-1 transition-all duration-200 border-2 hover:border-teal-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:border-teal-500 focus-visible:shadow-lg bg-gradient-to-br from-teal-50/50 to-teal-100/50"
            onClick={handleStartRuoE}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleStartRuoE(); } }}
            role="button"
            tabIndex={0}
            aria-label="Start Reading and Use of English practice - Multiple choice, gap fills, and reading comprehension"
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-3 p-3 rounded-full bg-teal-100 w-16 h-16 flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                <BookOpen className="h-8 w-8 text-teal-600" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900 group-hover:text-teal-700 transition-colors">
                Start Reading and Use of English
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Reading comprehension & grammar
              </p>
              <div className="flex items-center justify-center gap-1 mt-2 text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-sm font-medium">Begin practice</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer group hover:shadow-lg hover:-translate-y-1 transition-all duration-200 border-2 hover:border-cyan-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:border-cyan-500 focus-visible:shadow-lg bg-gradient-to-br from-cyan-50/50 to-sky-100/50"
            onClick={handleStartSpeaking}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleStartSpeaking(); } }}
            role="button"
            tabIndex={0}
            aria-label="Start speaking practice with an original guided conversation"
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-3 p-3 rounded-full bg-cyan-100 w-16 h-16 flex items-center justify-center group-hover:bg-cyan-200 transition-colors">
                <MessagesSquare className="h-8 w-8 text-cyan-700" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900 group-hover:text-cyan-800 transition-colors">
                Start Speaking
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Guided conversation rehearsal
              </p>
              <div className="flex items-center justify-center gap-1 mt-2 text-cyan-700 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-sm font-medium">Begin practice</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </CardHeader>
          </Card>

        </div>
        <div className="mt-8 max-w-md mx-auto">
          <div className="bg-gradient-to-r from-primary/5 via-teal-50/50 to-amber-50/50 rounded-lg p-4 border border-gray-200/50 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-amber-100">
                  <Trophy className="h-4 w-4 text-amber-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{completedThisWeek} tasks completed this week</p>
                  <p className="text-xs text-gray-600">Keep up the great work!</p>
                </div>
              </div>
              <Link
                to="/progress"
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-primary hover:text-primary/80 bg-white/80 hover:bg-white rounded-md border border-gray-200/50 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group"
                aria-label="View detailed progress and statistics"
              >
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                <span>View Progress</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Card className="shadow-sm border border-primary/20 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle>My Tasks</CardTitle>
          <Button
            asChild
            variant="link"
            size="sm"
            className="h-auto px-0 py-0 text-primary hover:text-primary/80"
            aria-label="View all tasks in board view"
          >
            <Link to="/my-tasks" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 group hover:bg-primary/5 transition-colors">
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span>View all</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div id="task-filters">
            <TaskFilters
              typeFilter={typeFilter}
              statusFilter={statusFilter}
              onTypeChange={setTypeFilter}
              onStatusChange={handleStatusChange}
              homeworkCount={homeworkCount}
            />
          </div>

          {/* Source-specific errors with Retry */}
          {(source?.assigned?.error || source?.submissions?.error || source?.ruoe?.error) && (
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
                  <AlertTitle>Couldn’t load R&UoE attempts</AlertTitle>
                  <AlertDescription className="flex items-center justify-between">
                    <span className="mr-4">{source.ruoe.error}</span>
                    <Button size="sm" variant="outline" onClick={() => source.ruoe.refetch?.()}>Retry</Button>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
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
          ) : filteredTasks.length === 0 ? (
            statusFilter === 'homework' ? (
              <div className="text-center py-10">
                <div className="mx-auto mb-3 p-3 rounded-full bg-green-50 border border-green-200 w-14 h-14 flex items-center justify-center">
                  <CheckCircle className="h-7 w-7 text-green-600" aria-hidden="true" />
                </div>
                <p className="text-base font-medium text-gray-900">You're all caught up</p>
                <p className="text-sm text-muted-foreground mt-1">No homework assigned right now.</p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-10">No tasks to show for these filters.</div>
            )
          ) : (
            <div className="space-y-3" id="my-tasks">
              <div className="sr-only" aria-live="polite">{liveSummary}</div>
              {displayedTasks.map((t) => {
                const typeLabel = t.type === 'writing' ? 'Writing' : 'R&UoE';
                const originLabel = t.origin === 'teacher' ? 'Teacher' : 'AI';
                const metaSegments = [typeLabel, originLabel];
                const badges: Array<{ text: string; variant?: 'default' | 'secondary' | 'outline' }> = [
                  { text: typeLabel, variant: 'secondary' },
                ];
                const isRetryableStatus = t.status === 'in_progress' || t.status === 'completed';
                if (t.type === 'ruoe' && isRetryableStatus) {
                  if (typeof t.attemptNumber === 'number') {
                    badges.push({ text: `Attempt #${t.attemptNumber}`, variant: 'outline' });
                  }
                  const statusLabel = t.status === 'completed' ? 'Completed' : 'In progress';
                  badges.push({
                    text: statusLabel,
                    variant: t.status === 'completed' ? 'default' : 'outline',
                  });
                  const attemptLabel = typeof t.attemptNumber === 'number'
                    ? `Attempt #${t.attemptNumber}`
                    : 'Attempt';
                  metaSegments.push(`${attemptLabel} (${statusLabel})`);
                }
                const meta = metaSegments.join(' • ');
                return (
                  <TaskItemCard
                    key={`${t.type}-${t.id}`}
                    id={`${t.type}-${t.id}`}
                    origin={t.origin}
                    title={t.title}
                    description={t.description}
                    date={formatDate(t.date)}
                    onClick={() => navigate(t.navTarget.to, t.navTarget.state ? { state: t.navTarget.state } : undefined)}
                    meta={meta}
                    badges={badges}
                    scorePercent={(t.type === 'ruoe' && t.status === 'completed') || (t.type === 'writing' && t.status === 'evaluated') ? t.score : undefined}
                    scoreTooltip={typeof t.score === 'number' ? `${Math.round(t.score)}%` : undefined}
                    estimatedMinutes={t.status === 'evaluated' || t.status === 'completed' ? undefined : t.estimatedMinutes}
                  />
                );
              })}
              {isPaginatedStatus && (
                <div className="flex flex-col items-center gap-3 pt-4 text-center border-t border-border/60">
                  <p className="text-xs text-muted-foreground">
                    {canLoadMore ? `Showing ${showingCount} of ${totalFiltered} tasks` : `Showing all ${totalFiltered} tasks`}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {canLoadMore && (
                      <Button
                        size="compact"
                        variant="support"
                        onClick={handleLoadMore}
                        aria-label="Load 10 more tasks"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        Load 10 more
                      </Button>
                    )}
                    <Button asChild variant="link" size="sm" className="text-muted-foreground hover:text-primary" aria-label="View all tasks">
                      <Link to="/my-tasks">View all tasks</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentDashboard;
