// Shared progress utilities to keep weekly metrics consistent across views
import type { SupabaseClient } from '@supabase/supabase-js';

export function isWithinLast7Days(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return ts >= sevenDaysAgo;
}

type MinimalWritingEval = { evaluation_completed_at: string | null };
type MinimalRuoEAttempt = { completed_at: string | null };

export function countWeeklyCompletedFromData(
  writingEvaluations: MinimalWritingEval[] | null | undefined,
  ruoeAttempts: MinimalRuoEAttempt[] | null | undefined
): number {
  const w = (writingEvaluations || []).filter((e) => isWithinLast7Days(e.evaluation_completed_at)).length;
  const r = (ruoeAttempts || []).filter((a) => isWithinLast7Days(a.completed_at)).length;
  return w + r;
}

// Query-based helper used by hooks/components that don't have local data yet
export async function fetchWeeklyCompletedCount(
  supabase: SupabaseClient,
  studentMembershipId: number,
): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [evalsRes, attemptsRes] = await Promise.all([
    supabase
      .from('evaluations')
      .select('id, evaluation_completed_at, submission:submissions!inner(student_membership_id)')
      .eq('submission.student_membership_id', studentMembershipId)
      .gte('evaluation_completed_at', sevenDaysAgo),
    supabase
      .from('ruoe_user_attempts')
      .select('id')
      .eq('membership_id', studentMembershipId)
      .eq('status', 'completed')
      .gte('completed_at', sevenDaysAgo),
  ]);

  if (evalsRes.error) throw evalsRes.error;
  if (attemptsRes.error) throw attemptsRes.error;

  return (evalsRes.data?.length || 0) + (attemptsRes.data?.length || 0);
}
