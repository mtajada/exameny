import { getServiceRoleClient } from "./auth.ts";

interface JsonRecord {
  [key: string]: unknown;
}

function getEnvOptional(key: string): string | undefined {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

type RpcResult = { error: { message?: string; code?: string } | null };
type ServiceRoleClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};
type ServiceRoleClientFactory = () => ServiceRoleClient;

const defaultClientFactory: ServiceRoleClientFactory = () =>
  getServiceRoleClient();
let serviceRoleClientFactory: ServiceRoleClientFactory = defaultClientFactory;

function resolveServiceRoleClient(): ServiceRoleClient {
  return serviceRoleClientFactory();
}

function shouldSkipEventValidation(): boolean {
  return getEnvOptional("SKIP_EVENT_VALIDATION") === "true";
}

function assertEventFields(
  eventType: string,
  payload: JsonRecord,
  requiredFields: readonly string[],
): void {
  if (shouldSkipEventValidation()) {
    return;
  }

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`[events] ${eventType} missing required field: ${field}`);
    }
  }
}

export interface FinalizeInvitedSignupEventPayload extends JsonRecord {
  request_id: string;
  duration_ms: number;
  user_id: string;
  email: string | null;
  memberships_claimed: Array<
    { membership_id: number; academy_id: number; role: string }
  >;
  memberships_inactive: Array<
    { membership_id: number; academy_id: number; role: string }
  >;
  auto_selected_academy_id: number | null;
}

interface EventOptions {
  persist?: boolean;
}

async function persistEventOutbox(
  eventType: string,
  payload: JsonRecord,
): Promise<void> {
  try {
    const client = resolveServiceRoleClient();
    const { error } = await client.rpc("enqueue_event_outbox", {
      p_event_type: eventType,
      p_payload: payload,
    });
    if (error) {
      console.error("[events] Failed to enqueue event_outbox record.", {
        code: error.code,
      });
    }
  } catch (_error) {
    console.error("[events] Unexpected error inserting event_outbox record.");
  }
}

export interface AuthLoginAttemptEventPayload extends JsonRecord {
  request_id: string;
  user_id: string | null;
  email_normalizado: string | null;
  provider: string;
  outcome: "success" | "failure";
  timestamp: string;
}

export async function emitAuthLoginAttempt(
  payload: AuthLoginAttemptEventPayload,
  options?: EventOptions,
): Promise<void> {
  assertEventFields("auth_login_attempt", payload, [
    "request_id",
    "user_id",
    "email_normalizado",
    "provider",
    "outcome",
    "timestamp",
  ]);
  const persist = options?.persist ?? true;
  if (persist) {
    await persistEventOutbox("auth_login_attempt", payload);
  }
  console.info("[events] auth_login_attempt", {
    request_id: payload.request_id,
    outcome: payload.outcome,
  });
}

export async function emitFinalizeInvitedSignupEvent(
  payload: FinalizeInvitedSignupEventPayload,
  options?: EventOptions,
): Promise<void> {
  assertEventFields("finalize_invited_signup_result", payload, [
    "request_id",
    "duration_ms",
    "user_id",
    "email",
    "memberships_claimed",
    "memberships_inactive",
    "auto_selected_academy_id",
  ]);
  const persist = options?.persist ?? true;
  if (persist) {
    await persistEventOutbox("finalize_invited_signup_result", payload);
  }
  console.info("[events] finalize_invited_signup_result", {
    request_id: payload.request_id,
    duration_ms: payload.duration_ms,
  });
}

export interface SaveUserPreferencesEventPayload extends JsonRecord {
  request_id: string;
  duration_ms: number;
  user_id: string;
  target_exam_id: number | null;
  target_level_id: number | null;
  source: string;
}

export async function emitSaveUserPreferencesCompletedEvent(
  payload: SaveUserPreferencesEventPayload,
  options?: EventOptions,
): Promise<void> {
  assertEventFields("save_user_preferences_completed", payload, [
    "request_id",
    "duration_ms",
    "user_id",
    "target_exam_id",
    "target_level_id",
    "source",
  ]);
  const persist = options?.persist ?? true;
  if (persist) {
    await persistEventOutbox("save_user_preferences_completed", payload);
  }
  console.info("[events] save_user_preferences_completed", {
    request_id: payload.request_id,
    source: payload.source,
    duration_ms: payload.duration_ms,
  });
}

// Accept null user ids so alias conflicts can be recorded before Supabase Auth rows exist.
export interface MembershipAliasConflictLogInput {
  userId: string | null;
  emailLogin: string;
  emailMembership: string;
  requestId: string;
  membershipId?: number | null;
  context?: JsonRecord;
}

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const resolveSupabaseEdgeUrl = (): string | null => {
  const baseUrl = getEnvOptional("SUPABASE_URL");
  if (!baseUrl) {
    return null;
  }
  return `${
    baseUrl.replace(/\/$/, "")
  }/functions/v1/log-membership-alias-conflict`;
};

const resolveLogAliasConflictToken = (): string | null =>
  getEnvOptional("LOG_ALIAS_CONFLICT_TOKEN") ?? null;

function buildAliasConflictBody(input: MembershipAliasConflictLogInput) {
  const payload: Record<string, unknown> = {
    user_id: input.userId ?? null,
    email_login: normalizeEmail(input.emailLogin),
    email_membership: normalizeEmail(input.emailMembership),
    request_id: input.requestId,
  };
  if (typeof input.membershipId === "number") {
    payload.membership_id = input.membershipId;
  }
  if (input.context && typeof input.context === "object") {
    payload.context = input.context;
  }
  return payload;
}

// This helper is the single integration point for the internal-only Edge Function
// `log-membership-alias-conflict`. Callers must pass normalized context (user id,
// login email, membership email, request id) so the function can persist audit rows
// and emit `membership_alias_conflict_logged` events. Never write directly to
// the internal conflict table; use this helper instead so the shared secret and
// observability logic stay consistent. Internal storage is reachable only
// through the service-role-only public RPC.
export async function logMembershipAliasConflict(
  input: MembershipAliasConflictLogInput,
): Promise<void> {
  const edgeUrl = resolveSupabaseEdgeUrl();
  const internalToken = resolveLogAliasConflictToken();
  if (!edgeUrl || !internalToken) {
    console.error(
      "[events] Missing SUPABASE_URL or LOG_ALIAS_CONFLICT_TOKEN; cannot log alias conflict.",
      {
        requestId: input.requestId,
      },
    );
    return;
  }

  try {
    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${internalToken}`,
      },
      body: JSON.stringify(buildAliasConflictBody(input)),
    });

    if (!response.ok) {
      console.error("[events] Failed to log membership alias conflict.", {
        status: response.status,
        requestId: input.requestId,
      });
    }
  } catch (_error) {
    console.error(
      "[events] Unexpected error calling log-membership-alias-conflict.",
      { requestId: input.requestId },
    );
  }
}

export interface MembershipAliasConflictLoggedEventPayload extends JsonRecord {
  request_id: string;
  email_login: string;
  email_membership: string;
  user_id: string | null;
  detected_at: string;
  duration_ms: number;
}

export async function emitMembershipAliasConflictLogged(
  payload: MembershipAliasConflictLoggedEventPayload,
  options?: EventOptions,
): Promise<void> {
  assertEventFields("membership_alias_conflict_logged", payload, [
    "request_id",
    "email_login",
    "email_membership",
    "user_id",
    "detected_at",
    "duration_ms",
  ]);
  const persist = options?.persist ?? true;
  if (persist) {
    await persistEventOutbox("membership_alias_conflict_logged", payload);
  }
  console.info("[events] membership_alias_conflict_logged", {
    request_id: payload.request_id,
    duration_ms: payload.duration_ms,
  });
}

export interface MembershipRoleMigratedEventPayload extends JsonRecord {
  request_id: string;
  membership_id: number;
  academy_id: number | null;
  actor_user_id: string;
  actor_academy_id: number | null;
  old_role: string | null;
  new_role: string | null;
  cleaned_records: JsonRecord | null;
  duration_ms: number;
}

export async function emitMembershipRoleMigratedEvent(
  payload: MembershipRoleMigratedEventPayload,
  options?: EventOptions,
): Promise<void> {
  assertEventFields("membership_role_migrated", payload, [
    "request_id",
    "membership_id",
    "academy_id",
    "actor_user_id",
    "actor_academy_id",
    "old_role",
    "new_role",
    "cleaned_records",
    "duration_ms",
  ]);
  const persist = options?.persist ?? true;
  if (persist) {
    await persistEventOutbox("membership_role_migrated", payload);
  }
  console.info("[events] membership_role_migrated", {
    request_id: payload.request_id,
    duration_ms: payload.duration_ms,
  });
}

export interface MembershipAliasResolvedEventPayload extends JsonRecord {
  request_id: string;
  membership_id: number;
  normalized_email: string;
  actor_user_id: string;
  actor_academy_id: number | null;
  duration_ms: number;
}

export async function emitMembershipAliasResolvedEvent(
  payload: MembershipAliasResolvedEventPayload,
  options?: EventOptions,
): Promise<void> {
  assertEventFields("membership_alias_resolved", payload, [
    "request_id",
    "membership_id",
    "normalized_email",
    "actor_user_id",
    "actor_academy_id",
    "duration_ms",
  ]);
  const persist = options?.persist ?? true;
  if (persist) {
    await persistEventOutbox("membership_alias_resolved", payload);
  }
  console.info("[events] membership_alias_resolved", {
    request_id: payload.request_id,
    duration_ms: payload.duration_ms,
  });
}

export interface SetActiveAcademySuccessPayload extends JsonRecord {
  request_id: string;
  duration_ms: number;
  user_id: string;
  previous_academy_id: number | null;
  new_academy_id: number;
  role: string | null;
}

export async function emitSetActiveAcademySuccess(
  payload: SetActiveAcademySuccessPayload,
  options?: EventOptions,
): Promise<void> {
  assertEventFields("set_active_academy_success", payload, [
    "request_id",
    "duration_ms",
    "user_id",
    "previous_academy_id",
    "new_academy_id",
    "role",
  ]);
  const persist = options?.persist ?? true;
  if (persist) {
    await persistEventOutbox("set_active_academy_success", payload);
  }
  console.info("[events] set_active_academy_success", {
    request_id: payload.request_id,
    duration_ms: payload.duration_ms,
  });
}

export interface InviteMembersCalledPayload extends JsonRecord {
  request_id: string;
  admin_user_id: string;
  academy_id: number;
  emails_total: number;
  emails_created: number;
  emails_resend: number;
  emails_failed: number;
  duration_ms: number;
}

export async function emitInviteMembersCalled(
  payload: InviteMembersCalledPayload,
  options?: EventOptions,
): Promise<void> {
  assertEventFields("invite_members_called", payload, [
    "request_id",
    "admin_user_id",
    "academy_id",
    "emails_total",
    "emails_created",
    "emails_resend",
    "emails_failed",
    "duration_ms",
  ]);
  const persist = options?.persist ?? true;
  if (persist) {
    await persistEventOutbox("invite_members_called", payload);
  }
  console.info("[events] invite_members_called", {
    request_id: payload.request_id,
    duration_ms: payload.duration_ms,
  });
}

// Testing hook so Phase 3 observability events can run without touching the real client.
export function setEventsServiceRoleClientFactoryForTests(
  factory: ServiceRoleClientFactory,
): void {
  serviceRoleClientFactory = factory;
}

export function resetEventsServiceRoleClientFactoryForTests(): void {
  serviceRoleClientFactory = defaultClientFactory;
}

export const __testing = {
  setServiceRoleClientFactory: setEventsServiceRoleClientFactoryForTests,
  resetServiceRoleClientFactory: resetEventsServiceRoleClientFactoryForTests,
};
