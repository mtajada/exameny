import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import DashboardMetrics from '../DashboardMetrics';
import QuickActions from '../QuickActions';

interface Metrics {
  totalMembers: number;
  activeStudents: number;
  activeTeachers: number;
  totalClasses: number;
}

const INITIAL_METRICS: Metrics = {
  totalMembers: 0,
  activeStudents: 0,
  activeTeachers: 0,
  totalClasses: 0,
};

export default function DashboardTab() {
  const { activeAcademyId } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const academyIdRef = useRef<number | null>(activeAcademyId);

  useEffect(() => {
    academyIdRef.current = activeAcademyId;
    if (!activeAcademyId) {
      setMetrics(INITIAL_METRICS);
      setIsLoading(false);
      setError('Select an academy to view dashboard metrics.');
    }
  }, [activeAcademyId]);

  const fetchMetrics = useCallback(async () => {
      const requestedAcademyId = activeAcademyId;
      if (!requestedAcademyId) {
        setMetrics(INITIAL_METRICS);
        setError('Select an academy to view dashboard metrics.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Step 1: Fetch all ACTIVE academy memberships
        const { data: activeMembers, error: membersError } = await supabase
          .from('academy_memberships')
          .select('role')
          .eq('academy_id', requestedAcademyId)
          .eq('status', 'active');

        if (membersError) throw membersError;

        // Step 2: Fetch classes count
        const { count: classesCount, error: classesError } = await supabase
          .from('classes')
          .select('id', { count: 'exact', head: true })
          .eq('academy_id', requestedAcademyId);

        if (classesError) throw classesError;

        // Step 3: Calculate metrics from the fetched active members
        const totalMembers = activeMembers?.length || 0;
        const activeStudents = activeMembers?.filter(m => m.role === 'student').length || 0;
        const activeTeachers = activeMembers?.filter(m => m.role === 'teacher').length || 0;
        const totalClasses = classesCount || 0;

        if (academyIdRef.current !== requestedAcademyId) {
          return;
        }
        setMetrics({
          totalMembers,
          activeStudents,
          activeTeachers,
          totalClasses
        });

      } catch (err) {
        console.error('Error fetching metrics:');
        if (academyIdRef.current !== requestedAcademyId) {
          return;
        }
        setError('Failed to load dashboard metrics');
        setMetrics(INITIAL_METRICS);
      } finally {
        if (academyIdRef.current === requestedAcademyId) {
          setIsLoading(false);
        }
      }
    }, [activeAcademyId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardMetrics metrics={metrics} isLoading={isLoading} />
      <QuickActions totalMembers={metrics.totalMembers} />
    </div>
  );
}
