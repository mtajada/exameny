import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { fetchWeeklyCompletedCount } from '@/utils/progress';

export function useProgressTeaser() {
  const { user, memberships, activeAcademyId, activeMembershipId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(0);

  const resolvedMembership = useMemo(() => {
    if (activeMembershipId) {
      return memberships.find((membership) => membership.membershipId === activeMembershipId) ?? null;
    }
    if (activeAcademyId) {
      return memberships.find((membership) => membership.academyId === activeAcademyId) ?? null;
    }
    if (memberships.length === 1) {
      return memberships[0];
    }
    return null;
  }, [activeAcademyId, activeMembershipId, memberships]);

  const resolvedMembershipId = resolvedMembership?.membershipId ?? null;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id || !resolvedMembershipId) {
        setCompletedThisWeek(0);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true); setError(null);
      try {
        const count = await fetchWeeklyCompletedCount(supabase, resolvedMembershipId);
        if (!cancelled) setCompletedThisWeek(count);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to load progress';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user?.id, resolvedMembershipId]);

  return useMemo(() => ({ loading, error, completedThisWeek }), [loading, error, completedThisWeek]);
}
