import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthContext, type PlatformRole, requireAuth } from "./auth.ts";
import {
  buildAdminForbiddenError,
  HttpError,
  isHttpError,
} from "./http-errors.ts";

export const ADMIN_ALLOWED_ROLES: PlatformRole[] = [
  "academy_admin",
  "platform_owner",
  "super_admin",
];
export const PLATFORM_ADMIN_ROLES: PlatformRole[] = [
  "platform_owner",
  "super_admin",
];
export const ADMIN_ACADEMY_REQUIRED_COPY =
  "Select an active academy before running this action.";

type ProfileRoleRow = { role: unknown };
type UserPreferencesRow = { active_academy_id: unknown };
type AcademyMembershipRow = { id: unknown; role: unknown; status: unknown };

type AdminAuthDeps = {
  requireAuth: typeof requireAuth;
  fetchPlatformRole: (
    client: SupabaseClient,
    userId: string,
  ) => Promise<PlatformRole | null>;
  fetchActiveAcademyId: (
    client: SupabaseClient,
    userId: string,
  ) => Promise<number | null>;
  fetchActiveAcademyAdminMembershipId: (
    client: SupabaseClient,
    userId: string,
    academyId: number,
  ) => Promise<number | null>;
};

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[-]?\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

const fetchPlatformRoleFromDb = async (
  client: SupabaseClient,
  userId: string,
): Promise<PlatformRole | null> => {
  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRoleRow>();

  if (error) {
    throw new HttpError(500, "Failed to verify administrator privileges.", {
      reason: "profile_role_lookup_failed",
      details: error.message,
    });
  }

  const role = typeof data?.role === "string" ? data.role : null;
  if (!role || !PLATFORM_ADMIN_ROLES.includes(role)) {
    return null;
  }

  return role;
};

const fetchActiveAcademyIdFromDb = async (
  client: SupabaseClient,
  userId: string,
): Promise<number | null> => {
  const { data, error } = await client
    .from("user_preferences")
    .select("active_academy_id")
    .eq("user_id", userId)
    .maybeSingle<UserPreferencesRow>();

  if (error) {
    throw new HttpError(500, "Failed to verify administrator privileges.", {
      reason: "user_preferences_lookup_failed",
      details: error.message,
    });
  }

  return parseNumericId(data?.active_academy_id);
};

const fetchActiveAcademyAdminMembershipIdFromDb = async (
  client: SupabaseClient,
  userId: string,
  academyId: number,
): Promise<number | null> => {
  const { data, error } = await client
    .from("academy_memberships")
    .select("id, role, status")
    .eq("user_id", userId)
    .eq("academy_id", academyId)
    .maybeSingle<AcademyMembershipRow>();

  if (error) {
    throw new HttpError(500, "Failed to verify administrator privileges.", {
      reason: "membership_lookup_failed",
      details: error.message,
    });
  }

  const status = typeof data?.status === "string" ? data.status : null;
  const role = typeof data?.role === "string" ? data.role : null;
  if (status !== "active" || role !== "academy_admin") {
    return null;
  }

  return parseNumericId(data?.id);
};

const defaultAdminAuthDeps: AdminAuthDeps = {
  requireAuth,
  fetchPlatformRole: fetchPlatformRoleFromDb,
  fetchActiveAcademyId: fetchActiveAcademyIdFromDb,
  fetchActiveAcademyAdminMembershipId:
    fetchActiveAcademyAdminMembershipIdFromDb,
};

export async function authenticateAdminRequest(
  request: Request,
  deps: Partial<AdminAuthDeps> = {},
): Promise<AuthContext> {
  const resolvedDeps = { ...defaultAdminAuthDeps, ...deps };
  try {
    const authContext = await resolvedDeps.requireAuth(request);
    const userId = authContext.user.id;

    const platformRole = await resolvedDeps.fetchPlatformRole(
      authContext.supabase,
      userId,
    );
    const actorIsPlatformAdmin = platformRole !== null;

    const academyId = await resolvedDeps.fetchActiveAcademyId(
      authContext.supabase,
      userId,
    );

    if (actorIsPlatformAdmin) {
      return {
        ...authContext,
        profile: {
          ...authContext.profile,
          role: platformRole,
          platform_role: platformRole,
          academy_id: academyId,
        },
      };
    }

    const actorAcademyId = academyId;
    if (!actorAcademyId) {
      throw buildAdminForbiddenError({ code: "ACTIVE_ACADEMY_REQUIRED" });
    }

    const membershipId = await resolvedDeps.fetchActiveAcademyAdminMembershipId(
      authContext.supabase,
      userId,
      actorAcademyId,
    );

    if (!membershipId) {
      throw buildAdminForbiddenError({ code: "ROLE_NOT_ALLOWED" });
    }

    return {
      ...authContext,
      profile: {
        ...authContext.profile,
        role: "academy_admin",
        platform_role: null,
        academy_id: actorAcademyId,
        membership_id: membershipId,
      },
    };
  } catch (error) {
    if (isHttpError(error) && error.status === 403) {
      throw buildAdminForbiddenError();
    }
    throw error;
  }
}

export function resolveAdminActorContext(
  context: AuthContext,
): { actorAcademyId: number | null; actorIsPlatformAdmin: boolean } {
  const role = context.profile.role ?? null;
  if (!role || !ADMIN_ALLOWED_ROLES.includes(role)) {
    throw buildAdminForbiddenError({ code: "ROLE_NOT_ALLOWED" });
  }

  const platformRole = context.profile.platform_role ?? role;
  const actorIsPlatformAdmin = platformRole
    ? PLATFORM_ADMIN_ROLES.includes(platformRole)
    : false;
  const actorAcademyId = context.profile.academy_id ?? null;

  if (!actorIsPlatformAdmin && actorAcademyId === null) {
    throw new HttpError(403, ADMIN_ACADEMY_REQUIRED_COPY);
  }

  return { actorAcademyId, actorIsPlatformAdmin };
}

export const __testing = {
  parseNumericId,
  fetchPlatformRoleFromDb,
  fetchActiveAcademyIdFromDb,
  fetchActiveAcademyAdminMembershipIdFromDb,
  defaultAdminAuthDeps,
};
