import { useMemo } from 'react';

import { useAuth } from './useAuth';

export const useActiveAcademy = () => {
  const { activeAcademyId, memberships } = useAuth();

  const activeMembership = useMemo(
    () => memberships.find((membership) => membership.academyId === activeAcademyId) ?? null,
    [activeAcademyId, memberships],
  );

  return {
    activeAcademyId,
    activeMembership,
    hasMultipleActiveAcademies: memberships.length > 1,
  };
};
