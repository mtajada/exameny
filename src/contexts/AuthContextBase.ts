import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import type { Tables } from '@/integrations/supabase/types.ts';
import type { EdgeFunctionErrorPayload } from '@/lib/auth/edge.ts';

export type MembershipRole = 'student' | 'teacher' | 'academy_admin';
export type PlatformRole = MembershipRole | 'super_admin' | 'platform_owner';
export type MembershipStatus = 'awaiting_login' | 'active' | 'inactive';

export type Profile = Tables<'profiles'>;

export interface UserPreferencesState {
  fullName: string | null;
  targetExamId: number | null;
  targetLevelId: number | null;
  activeAcademyId: number | null;
  isInitialSetupCompleted: boolean;
  updatedAt: string | null;
}

export interface MembershipSummary {
  membershipId: number;
  academyId: number;
  academyName: string;
  role: MembershipRole;
  status: MembershipStatus;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: MembershipRole | null;
  platformRole: PlatformRole | null;
  isPlatformAdmin: boolean;
  activeAcademyId: number | null;
  activeMembershipId: number | null;
  userPreferences: UserPreferencesState | null;
  memberships: MembershipSummary[];
  membershipsInactive: MembershipSummary[];
  isInitialSetupCompleted: boolean;
  isProcessingAuth: boolean;
  finalizeStatus: 'idle' | 'running' | 'success' | 'error';
  lastFinalizeError: EdgeFunctionErrorPayload | null;
  lastFinalizeRequestId: string | null;
  isLoading: boolean;
  error: string | null;
  isProfileComplete: boolean | null;
  isNameRequired: boolean;
  logout: () => Promise<{ error: Error | null }>;
  updateProfileCompletionStatus: (status: boolean) => void;
  refreshUserProfile: () => Promise<void>;
  retryFinalize: () => Promise<void>;
  selectActiveAcademy: (
    academyId: number,
  ) => Promise<{ error: EdgeFunctionErrorPayload | null }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
