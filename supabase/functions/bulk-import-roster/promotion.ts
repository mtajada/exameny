type RpcError = { message?: string };
type RpcSingleResult = { data: unknown; error: RpcError | null };
type RpcSingleBuilder = {
  single: <T = unknown>() => PromiseLike<RpcSingleResult>;
};
// Use only the `rpc` surface so different SupabaseClient instantiations remain assignable.
type RpcCapableClient = {
  rpc: (name: string, args?: Record<string, unknown>) => RpcSingleBuilder;
};

export type Role = "student" | "teacher" | "academy_admin";

export type MinimalMembership = {
  id: number;
  role: Role;
  [key: string]: unknown;
};

export interface PromoteMembershipResult<T extends MinimalMembership> {
  membership?: T;
  errorMessage?: string;
}

export interface RoleMigrationActorContext {
  userId: string;
  academyId: number | null;
  isPlatformAdmin: boolean;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function promoteMembershipToTeacher<T extends MinimalMembership>(
  adminClient: RpcCapableClient,
  existing: T,
  actor: RoleMigrationActorContext,
  requestId?: string,
): Promise<PromoteMembershipResult<T>> {
  const payload: Record<string, unknown> = {
    p_actor_user_id: actor.userId,
    p_actor_academy_id: actor.academyId,
    p_actor_is_platform_admin: actor.isPlatformAdmin,
    p_membership_id: existing.id,
    p_new_role: "teacher",
    p_reason: "bulk_import_roster",
  };
  if (requestId) payload.p_request_id = requestId;

  const { data, error } = await adminClient
    .rpc("migrate_membership_role", payload)
    .single<{
      metadata_payload: Record<string, unknown> | null;
      should_refresh_session: boolean | null;
      request_id: string | null;
    }>();
  if (error) {
    return { errorMessage: error.message };
  }

  const metadataPayload = isPlainRecord(data) &&
      (isPlainRecord(data.metadata_payload) || data.metadata_payload === null)
    ? data.metadata_payload
    : null;
  const shouldRefreshSession =
    isPlainRecord(data) && typeof data.should_refresh_session === "boolean"
      ? data.should_refresh_session
      : false;
  const responseRequestId =
    isPlainRecord(data) && typeof data.request_id === "string"
      ? data.request_id
      : null;

  const membership = {
    ...existing,
    role: "teacher" as Role,
    metadata_payload: metadataPayload,
    should_refresh_session: shouldRefreshSession,
    request_id: responseRequestId ?? requestId ?? null,
  } as T;
  return { membership };
}
