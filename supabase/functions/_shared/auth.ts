import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "./http-errors.ts";

const REQUEST_CLIENT_ENV_ERROR =
  "[auth] Missing SUPABASE_URL or EXAMENY_SUPABASE_PUBLISHABLE_KEY environment variable.";

function getEnvOptional(key: string): string | undefined {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function resolveSupabasePublishableKey(): string | undefined {
  const value = getEnvOptional("EXAMENY_SUPABASE_PUBLISHABLE_KEY");
  if (value && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function ensureRequestClientConfig(): { url: string; publishableKey: string } {
  const url = getEnvOptional("SUPABASE_URL");
  const publishableKey = resolveSupabasePublishableKey();
  if (!url || !publishableKey) {
    throw new Error(REQUEST_CLIENT_ENV_ERROR);
  }
  return { url, publishableKey };
}

function ensureServiceRoleConfig(): { url: string; secretKey: string } {
  const url = getEnvOptional("SUPABASE_URL");
  if (!url) {
    throw new Error("[auth] Missing SUPABASE_URL environment variable.");
  }
  const secretKey = getEnvOptional("EXAMENY_SUPABASE_SECRET_KEY");
  if (!secretKey) {
    throw new Error(
      "[auth] Missing EXAMENY_SUPABASE_SECRET_KEY environment variable.",
    );
  }
  return { url, secretKey };
}

export type PlatformRole = string;

export interface ProfileRecord {
  id: string;
  email: string | null;
  role: PlatformRole | null;
  academy_id: number | null;
  membership_id: number | null;
  full_name: string | null;
  platform_role?: PlatformRole | null;
}

export interface AuthContext {
  user: User;
  profile: ProfileRecord;
  supabase: SupabaseClient;
  authorization: string;
}

type PlainRecord = Record<string, unknown>;

const isPlainRecord = (value: unknown): value is PlainRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function normalizeAuthorization(value: string | null): string {
  if (!value) {
    throw new HttpError(401, "Missing Authorization header");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new HttpError(401, "Missing Authorization header");
  }
  const [scheme, ...rest] = trimmed.split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer") {
    throw new HttpError(401, "Authorization header must use Bearer token");
  }
  const token = rest.join(" ").trim();
  if (!token) {
    throw new HttpError(
      401,
      "Authorization header must include an access token",
    );
  }
  return `Bearer ${token}`;
}

function createRequestClient(authorization: string): SupabaseClient {
  const { url, publishableKey } = ensureRequestClientConfig();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

function parseNumericId(value: unknown): number | null {
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
}

interface MetadataMembershipRecord {
  membership_id: number | null;
  academy_id: number | null;
  role: PlatformRole | null;
  status: string | null;
}

const PLATFORM_ADMIN_ROLES: PlatformRole[] = ["platform_owner", "super_admin"];

function parseMembershipRecords(value: unknown): MetadataMembershipRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isPlainRecord(entry)) {
        return null;
      }
      const candidate = entry;
      const membershipId = parseNumericId(
        candidate.membership_id ?? candidate.id,
      );
      const academyId = parseNumericId(candidate.academy_id);
      const role = typeof candidate.role === "string"
        ? candidate.role as PlatformRole
        : null;
      const status = typeof candidate.status === "string"
        ? candidate.status
        : null;
      if (membershipId === null && academyId === null && !role) {
        return null;
      }
      return {
        membership_id: membershipId,
        academy_id: academyId,
        role,
        status,
      };
    })
    .filter((record): record is MetadataMembershipRecord => Boolean(record));
}

const parseStringOrNull = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

function resolveActiveMembership(
  memberships: MetadataMembershipRecord[],
  preferredAcademyId: number | null,
): { membership: MetadataMembershipRecord | null; academyId: number | null } {
  if (preferredAcademyId !== null) {
    const direct = memberships.find(
      (record) =>
        record.academy_id === preferredAcademyId &&
        (record.status === null || record.status === "active"),
    );
    if (direct) {
      return { membership: direct, academyId: preferredAcademyId };
    }
  }

  const fallback = memberships.find((record) => record.status === "active");
  if (fallback && fallback.academy_id !== null) {
    return { membership: fallback, academyId: fallback.academy_id };
  }

  return { membership: fallback ?? null, academyId: preferredAcademyId };
}

export function shouldRequireAcademyMembership(
  options:
    | { requireAcademy?: boolean; academyOptionalRoles?: PlatformRole[] }
    | undefined,
  role: PlatformRole | null,
  academyId: number | null,
): boolean {
  if (!options?.requireAcademy) {
    return false;
  }

  if (academyId) {
    return false;
  }

  const academyOptionalRoles = options.academyOptionalRoles ?? [];
  if (!role) {
    return true;
  }

  return !academyOptionalRoles.includes(role);
}

export async function requireAuth(request: Request, options?: {
  allowedRoles?: PlatformRole[];
  requireAcademy?: boolean;
  academyOptionalRoles?: PlatformRole[];
}): Promise<AuthContext> {
  const authorization = normalizeAuthorization(
    request.headers.get("authorization") ??
      request.headers.get("Authorization"),
  );
  const supabase = createRequestClient(authorization);

  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult?.user) {
    throw new HttpError(401, "Invalid or expired access token", userError);
  }

  const user = userResult.user;
  const appMetadata = isPlainRecord(user.app_metadata) ? user.app_metadata : {};
  const userMetadata = isPlainRecord(user.user_metadata)
    ? user.user_metadata
    : {};

  const rawActiveAcademyId = parseNumericId(appMetadata.active_academy_id);
  const memberships = parseMembershipRecords(appMetadata.memberships);
  const { membership: activeMembership, academyId: resolvedAcademyId } =
    resolveActiveMembership(
      memberships,
      rawActiveAcademyId,
    );

  let activeAcademyId = resolvedAcademyId;
  const activeMembershipId = activeMembership?.membership_id ?? null;
  const membershipRole = activeMembership?.role ?? null;

  const metadataActiveRole = parseStringOrNull(appMetadata.active_role);
  const rawPlatformRole = parseStringOrNull(appMetadata.platform_role);
  const platformRole =
    rawPlatformRole && PLATFORM_ADMIN_ROLES.includes(rawPlatformRole)
      ? rawPlatformRole
      : (
        metadataActiveRole && PLATFORM_ADMIN_ROLES.includes(metadataActiveRole)
          ? metadataActiveRole
          : null
      );

  const effectiveRole = membershipRole ?? metadataActiveRole ?? platformRole ??
    null;

  if (activeAcademyId === null && membershipRole) {
    const membershipAcademyId = activeMembership?.academy_id;
    if (membershipAcademyId !== null && membershipAcademyId !== undefined) {
      activeAcademyId = membershipAcademyId;
    }
  }

  if (
    options?.allowedRoles &&
    (!effectiveRole || !options.allowedRoles.includes(effectiveRole))
  ) {
    throw new HttpError(
      403,
      "User does not have permission to access this resource",
    );
  }

  if (shouldRequireAcademyMembership(options, effectiveRole, activeAcademyId)) {
    throw new HttpError(
      403,
      "User must belong to an academy to access this resource",
    );
  }

  return {
    user,
    profile: {
      id: user.id,
      email: typeof user.email === "string" ? user.email : null,
      role: effectiveRole,
      academy_id: activeAcademyId,
      membership_id: activeMembershipId,
      full_name: parseStringOrNull(userMetadata.full_name),
      platform_role: platformRole,
    },
    supabase,
    authorization,
  };
}

export function getServiceRoleClient(): SupabaseClient {
  const { url, secretKey } = ensureServiceRoleConfig();
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AuthUserMetadataUpdate {
  app_metadata?: PlainRecord;
  user_metadata?: PlainRecord;
}

export function buildAuthUserMetadataUpdate(
  payload: unknown,
): AuthUserMetadataUpdate | null {
  if (!isPlainRecord(payload)) {
    return null;
  }

  const update: AuthUserMetadataUpdate = {};
  const record = payload;

  if (isPlainRecord(record.app_metadata)) {
    update.app_metadata = record.app_metadata;
  }
  if (isPlainRecord(record.user_metadata)) {
    update.user_metadata = record.user_metadata;
  }

  return Object.keys(update).length > 0 ? update : null;
}

export async function applyMetadataPayload(
  userId: string,
  payload: unknown,
): Promise<void> {
  const update = buildAuthUserMetadataUpdate(payload);
  if (!update) {
    return;
  }

  const { error } = await getServiceRoleClient().auth.admin.updateUserById(
    userId,
    update,
  );
  if (error) {
    throw new HttpError(
      500,
      "We could not refresh your session metadata. Try again.",
      {
        message: error.message,
        status: error.status,
      },
    );
  }
}
