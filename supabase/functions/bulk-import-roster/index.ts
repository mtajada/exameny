import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { resolveSupabasePublishableKey } from "../_shared/auth.ts";
import { createCorsHeaders } from "../_shared/cors.ts";
import {
  buildInvitationRedirect,
  DEFAULT_SITE_URL,
} from "../_shared/invitation-redirect.ts";
import { sendLoginReminderEmail } from "../_shared/send-login-reminder-email.ts";
import {
  applyMetadataSync,
  applyMetadataUpdates,
  extractMetadataUpdates,
  type JsonRecord,
  normalizeMetadataPayload,
} from "../_shared/metadata-sync.ts";
import { buildInviteMembersTemplate } from "../_shared/templates/invite-members.ts";
import type { InviteRole } from "../_shared/templates/template-helpers.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import {
  type MinimalMembership,
  promoteMembershipToTeacher,
  type Role,
} from "./promotion.ts";

const MAX_ROWS = 500;

const parseSupabaseBigint = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? value as T[] : [];

type InviteMode = "create" | "resend";

const toInviteRole = (role: string | null | undefined): InviteRole => {
  if (role === "teacher" || role === "academy_admin") {
    return role;
  }
  return "student";
};

export const buildMembershipRedirect = (
  siteUrl: string | null | undefined,
  member: { id?: unknown; academy_id?: unknown } | null | undefined,
  fallbackAcademyId: unknown,
) => {
  const normalizedMembershipId = parseSupabaseBigint(member?.id);
  const normalizedMembershipAcademyId = parseSupabaseBigint(member?.academy_id);
  const normalizedFallbackAcademyId = parseSupabaseBigint(fallbackAcademyId) ??
    (typeof fallbackAcademyId === "number" && Number.isFinite(fallbackAcademyId)
      ? fallbackAcademyId
      : null);

  return buildInvitationRedirect(siteUrl, {
    membershipId: normalizedMembershipId ?? null,
    academyId: normalizedMembershipAcademyId ?? normalizedFallbackAcademyId ??
      null,
  });
};

interface BulkImportRow {
  email: string;
  full_name: string;
  role?: Role;
  class_name?: string;
  class_description?: string;
  teacher_email?: string;
  subscription_end_date?: string; // YYYY-MM-DD
}

interface BulkImportOptions {
  createClasses?: boolean;
  sendEmailsToNew?: boolean;
  resendPendingInvites?: boolean;
  sendLoginReminders?: boolean;
  /** @deprecated retained for backward compatibility */
  sendResetForExistingUsers?: boolean;
  updateSubscriptionForExisting?: boolean;
  dryRun?: boolean;
}

interface BulkImportPayload {
  rows: BulkImportRow[];
  options?: BulkImportOptions;
}

export type MembershipRecord = MinimalMembership & {
  academy_id: number;
  email: string;
  status: string;
  user_id: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  metadata_payload?: JsonRecord | null;
  should_refresh_session?: boolean | null;
  request_id?: string | null;
  metadata_targets?: unknown;
};

type NewMembership = {
  academy_id: number;
  email: string;
  role: Role;
  status: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
};

type ClassRecord = { id: number; name: string };

type ClassMembershipRow = {
  class_id: number;
  membership_id: number;
  academy_memberships?: { role?: Role; user_id?: string | null } | null;
};

type StudentClassMembershipRow = { class_id: number; membership_id: number };

interface BulkImportSummary {
  newMemberships: number;
  updatedMemberships: number;
  reactivatedMemberships: number;
  classesCreated: number;
  classesReused: number;
  teachersReplaced: number;
  classAssignments: number;
  movedStudents: number;
  skippedAssignments: number;
  emailsInvited: number;
  loginRemindersSent: number;
  conflicts: number;
}

type Issue = {
  row: number;
  email?: string;
  error?: string;
  warnings?: string[];
};
type Detail = {
  row: number;
  email: string;
  actions: string[];
  warnings?: string[];
  error?: string;
};

type MetadataCarrier = {
  metadata_payload?: unknown;
  should_refresh_session?: unknown;
  request_id?: unknown;
  metadata_targets?: unknown;
};

type MembershipWithMetadata = MembershipRecord & MetadataCarrier;

type NormalizedMetadataResult = {
  payload: JsonRecord | null;
  shouldRefresh: boolean;
  requestId: string | null;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function computeDefaultEndDate(base = new Date()) {
  return new Date(base.getFullYear() + 1, base.getMonth(), 0);
}
function normalizeClassName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}
function toKey(str: string) {
  return normalizeClassName(str).toLowerCase();
}

const MEMBERSHIP_COLUMNS =
  "id, academy_id, email, role, status, user_id, subscription_start_date, subscription_end_date" as const;
const CLASS_COLUMNS = "id, name" as const;
const CLASS_MEMBERSHIP_COLUMNS =
  "class_id, membership_id, academy_memberships!inner(role)" as const;
const CLASS_MEMBERSHIP_WITH_USER_COLUMNS =
  "class_id, membership_id, academy_memberships!inner(user_id, role)" as const;
const STUDENT_CLASS_MEMBERSHIP_COLUMNS = "class_id, membership_id" as const;

const METADATA_SYNC_COPY =
  "We could not refresh membership metadata after bulk import. Try again.";

const normalizeMetadataResult = (
  candidate: MetadataCarrier | null | undefined,
): NormalizedMetadataResult => ({
  payload: normalizeMetadataPayload(candidate?.metadata_payload),
  shouldRefresh: candidate?.should_refresh_session === true,
  requestId: typeof candidate?.request_id === "string" &&
      candidate.request_id.trim().length > 0
    ? candidate.request_id
    : null,
});

const asMetadataCarrier = (value: unknown): MetadataCarrier | null =>
  isPlainRecord(value) ? value as MetadataCarrier : null;

const asMembershipWithMetadata = (
  value: unknown,
): MembershipWithMetadata | null =>
  isPlainRecord(value) ? value as MembershipWithMetadata : null;

type RpcError = { message?: string; code?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcBuilder = PromiseLike<RpcResult> & {
  single: <T = unknown>() => PromiseLike<RpcResult>;
};

type QueryResult = { data: unknown; error: RpcError | null };
type SelectBuilder = {
  select: (columns?: string) => SelectBuilder;
  maybeSingle: <T = unknown>() => PromiseLike<QueryResult>;
  returns: <T = unknown>() => PromiseLike<QueryResult>;
};
type FilterBuilder = SelectBuilder & {
  eq: (field: string, value: unknown) => FilterBuilder;
  in: (field: string, values: unknown[]) => FilterBuilder;
};
type TableBuilder = {
  select: (columns?: string) => FilterBuilder;
  insert: (record: unknown) => FilterBuilder;
  update: (record: unknown) => FilterBuilder;
  delete: () => FilterBuilder;
};

type SelectBuilderLike = {
  select: (columns?: string) => unknown;
  maybeSingle: <T = unknown>() => PromiseLike<QueryResult>;
  returns: <T = unknown>() => PromiseLike<QueryResult>;
};

type FilterBuilderLike = SelectBuilderLike & {
  eq: (field: string, value: unknown) => unknown;
  in: (field: string, values: unknown[]) => unknown;
};

type TableBuilderLike = {
  select: (columns?: string) => unknown;
  insert: (record: unknown) => unknown;
  update: (record: unknown) => unknown;
  delete: () => unknown;
};

type SchemaClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => RpcBuilder;
};
type SyncMetadataAdminClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => RpcBuilder;
};

async function syncMetadataAfterMembershipChange(params: {
  adminClient: SyncMetadataAdminClient;
  membership: MembershipWithMetadata;
  metadataCandidates: Array<MetadataCarrier | null | undefined>;
  performedChange: boolean;
  fallbackRequestId: string;
  issues: Issue[];
  rowIndex: number;
  email?: string;
  applyMetadata?: (userId: string, payload: JsonRecord) => Promise<void>;
  metadataTargets?: unknown;
  applyMetadataUpdatesFn?: typeof applyMetadataUpdates;
}) {
  const {
    adminClient,
    membership,
    metadataCandidates,
    performedChange,
    fallbackRequestId,
    issues,
    rowIndex,
    email,
    applyMetadata,
    metadataTargets,
    applyMetadataUpdatesFn,
  } = params;

  const userId = typeof membership.user_id === "string"
    ? membership.user_id
    : null;
  if (!userId) return;

  const metadataUpdates = extractMetadataUpdates(
    metadataTargets,
    {
      userId,
      payload: membership.metadata_payload,
      shouldRefreshSession: membership.should_refresh_session,
      requestId: membership.request_id ?? fallbackRequestId,
    },
  );
  const primaryTarget =
    metadataUpdates.find((update) => update.userId === userId) ?? null;
  let requestId: string | null = primaryTarget?.requestId ?? fallbackRequestId;

  let metadataTargetsError = false;
  if (metadataUpdates.length) {
    try {
      const applyUpdates = applyMetadataUpdatesFn ?? applyMetadataUpdates;
      await applyUpdates(metadataUpdates, METADATA_SYNC_COPY);
    } catch (error) {
      metadataTargetsError = true;
      const message = error instanceof Error ? error.message : String(error);
      issues.push({
        row: rowIndex,
        email,
        error: `Metadata sync failed: ${message}`,
      });
      console.error("[bulk-import-roster] metadata sync failed", {
        request_id: requestId,
      });
    }
  }

  const normalizedTargets: NormalizedMetadataResult[] = primaryTarget
    ? [{
      payload: primaryTarget.payload,
      shouldRefresh: primaryTarget.shouldRefreshSession,
      requestId: primaryTarget.requestId,
    }]
    : [];

  const normalized = [
    ...normalizedTargets,
    ...metadataCandidates
      .filter((c): c is MetadataCarrier => Boolean(c))
      .map((candidate) => normalizeMetadataResult(candidate)),
  ];

  const candidateRequestsRefresh = normalized.some((c) => c.shouldRefresh);
  let selected: NormalizedMetadataResult | null =
    normalized.find((c) => c.payload && c.shouldRefresh) ?? null;
  const requestIdFromCandidates =
    normalized.find((c) => c.requestId)?.requestId ?? null;

  requestId = selected?.requestId ?? requestIdFromCandidates ?? requestId;
  const needsSync =
    (!primaryTarget || !primaryTarget.payload || metadataTargetsError) &&
    (performedChange || candidateRequestsRefresh);

  if (!selected || !selected.payload || !selected.shouldRefresh) {
    if (!needsSync) return;

    try {
      const rpcArgs: Record<string, unknown> = { p_user_id: userId };
      if (requestId) rpcArgs.p_request_id = requestId;

      const { data, error } = await adminClient
        .rpc("sync_user_metadata", rpcArgs)
        .single<MetadataCarrier>();

      if (error) {
        throw error;
      }

      selected = normalizeMetadataResult(asMetadataCarrier(data));
      requestId = selected.requestId ?? requestId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({
        row: rowIndex,
        email,
        error: `Metadata sync RPC failed: ${message}`,
      });
      console.error("[bulk-import-roster] sync_user_metadata failed", {
        request_id: requestId,
      });
      return;
    }
  }

  if (!selected || !selected.payload || !selected.shouldRefresh) {
    return;
  }

  if (!metadataTargetsError && primaryTarget && primaryTarget.payload) {
    return;
  }

  const apply = applyMetadata ??
    ((uid: string, payload: JsonRecord) =>
      applyMetadataSync(uid, payload, METADATA_SYNC_COPY));

  try {
    await apply(userId, selected.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({
      row: rowIndex,
      email,
      error: `Metadata sync failed: ${message}`,
    });
    console.error("[bulk-import-roster] metadata sync failed", {
      request_id: requestId,
    });
  }
}

export type StatusReconciliationResult = {
  latest: MembershipWithMetadata;
  statusChangeSucceeded: boolean;
  shouldAbort: boolean;
};

export function reconcileMembershipStatusResponse(params: {
  existing: MembershipRecord;
  requestedStatus: string;
  returnedMembership: MembershipWithMetadata | null;
  issues: Issue[];
  email: string;
  rowIndex: number;
}): StatusReconciliationResult {
  const {
    existing,
    requestedStatus,
    returnedMembership,
    issues,
    email,
    rowIndex,
  } = params;
  const latest = (returnedMembership ?? existing) as MembershipWithMetadata;

  if (latest.status !== requestedStatus) {
    if (latest.status === existing.status) {
      issues.push({
        row: rowIndex,
        email,
        warnings: [
          `Membership remained at status '${latest.status}' (requested '${requestedStatus}') - proceeding without status change.`,
        ],
      });
      return { latest, statusChangeSucceeded: false, shouldAbort: false };
    }

    issues.push({
      row: rowIndex,
      email,
      error:
        `Update membership failed: requested status '${requestedStatus}' but database returned '${latest.status}'`,
    });
    return { latest, statusChangeSucceeded: false, shouldAbort: true };
  }

  const statusChangeSucceeded = latest.status !== existing.status;
  return { latest, statusChangeSucceeded, shouldAbort: false };
}

export type BulkImportSupabaseClient = {
  from: (tableName: string) => TableBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => RpcBuilder;
  schema: (schemaName: string) => SchemaClient;
  auth: {
    getUser: () => PromiseLike<
      { data: { user: { id: string } | null } | null; error: RpcError | null }
    >;
  };
};

export type BulkImportCreateClient = (
  ...args: Parameters<typeof createClient>
) => BulkImportSupabaseClient;
const wrapSelectBuilder = (builder: SelectBuilderLike): SelectBuilder => ({
  select: (columns?: string) =>
    wrapSelectBuilder(builder.select(columns) as SelectBuilderLike),
  maybeSingle: builder.maybeSingle,
  returns: builder.returns,
});

const wrapFilterBuilder = (builder: FilterBuilderLike): FilterBuilder => ({
  select: (columns?: string) =>
    wrapSelectBuilder(builder.select(columns) as SelectBuilderLike),
  eq: (field: string, value: unknown) =>
    wrapFilterBuilder(builder.eq(field, value) as FilterBuilderLike),
  in: (field: string, values: unknown[]) =>
    wrapFilterBuilder(builder.in(field, values) as FilterBuilderLike),
  maybeSingle: builder.maybeSingle,
  returns: builder.returns,
});

const wrapTableBuilder = (builder: TableBuilderLike): TableBuilder => ({
  select: (columns?: string) =>
    wrapFilterBuilder(builder.select(columns) as FilterBuilderLike),
  insert: (record: unknown) =>
    wrapFilterBuilder(builder.insert(record) as FilterBuilderLike),
  update: (record: unknown) =>
    wrapFilterBuilder(builder.update(record) as FilterBuilderLike),
  delete: () => wrapFilterBuilder(builder.delete() as FilterBuilderLike),
});

const defaultCreateClient: BulkImportCreateClient = (...args) => {
  const client = createClient(...args);
  return {
    from: (tableName: string) =>
      wrapTableBuilder(client.from(tableName) as unknown as TableBuilderLike),
    rpc: (fn: string, args?: Record<string, unknown>) => client.rpc(fn, args),
    schema: (schemaName: string) => ({
      rpc: (fn: string, args?: Record<string, unknown>) =>
        client.schema(schemaName).rpc(fn, args),
    }),
    auth: {
      getUser: () => client.auth.getUser(),
    },
  };
};

export async function handleBulkImportRoster(
  req: Request,
  deps: { createClient?: BulkImportCreateClient } = {},
): Promise<Response> {
  const corsHeaders = createCorsHeaders(req);
  const jsonResponse = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  const ok = (payload: unknown, status = 200) => jsonResponse(status, payload);
  const fail = (status: number, message: string) =>
    ok({ error: message }, status);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestIdHeader = req.headers.get("x-request-id");
    const requestId = requestIdHeader && requestIdHeader.trim().length > 0
      ? requestIdHeader.trim()
      : crypto.randomUUID();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return fail(401, "Unauthorized");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabasePublishableKey = resolveSupabasePublishableKey() ?? "";
    if (!supabaseUrl || !supabasePublishableKey) {
      console.error(
        "[bulk-import-roster] Missing Supabase environment variables for user-scoped client.",
      );
      return fail(500, "Server misconfigured");
    }

    const createClientFn = deps.createClient ?? defaultCreateClient;
    const userClient = createClientFn(
      supabaseUrl,
      supabasePublishableKey,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: academyId, error: academyErr } = await userClient.rpc(
      "get_my_academy_id_from_jwt",
    );
    const { data: userRole, error: roleErr } = await userClient.rpc(
      "get_my_role_from_jwt",
    );
    const { data: userResult, error: userErr } = await userClient.auth
      .getUser();
    if (academyErr || roleErr) {
      return fail(500, "Failed to fetch user context");
    }
    if (userErr || !userResult?.user?.id) {
      return fail(401, "Unauthorized");
    }
    const roleValue = typeof userRole === "string" ? userRole : null;
    const actorIsPlatformAdmin = roleValue === "platform_owner" ||
      roleValue === "super_admin";
    if (
      !academyId || (!actorIsPlatformAdmin && roleValue !== "academy_admin")
    ) {
      return fail(401, "Unauthorized");
    }
    const actorUserId = userResult.user.id;

    const adminClient = createClientFn(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("EXAMENY_SUPABASE_SECRET_KEY") ?? "",
    );
    const siteUrl = Deno.env.get("SITE_URL") || DEFAULT_SITE_URL;
    const normalizedAcademyId = parseSupabaseBigint(academyId);
    const fallbackAcademyId = normalizedAcademyId ??
      (typeof academyId === "number" && Number.isFinite(academyId)
        ? academyId
        : null);
    let academyName = "Exameny";
    if (fallbackAcademyId !== null) {
      const { data: academyRowData, error: academyLookupError } =
        await adminClient
          .from("academies")
          .select("name")
          .eq("id", fallbackAcademyId)
          .maybeSingle<{ name: string }>();
      const academyRow = isPlainRecord(academyRowData) ? academyRowData : null;
      if (academyLookupError) {
        console.error("[bulk-import-roster] academy lookup failed");
      } else if (
        academyRow && typeof academyRow.name === "string" &&
        academyRow.name.trim().length > 0
      ) {
        academyName = academyRow.name.trim();
      }
    }
    const buildRedirectForMembership = (
      member: MembershipRecord | undefined | null,
    ) => buildMembershipRedirect(siteUrl, member ?? null, fallbackAcademyId);

    const payload: BulkImportPayload = await req.json();
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const legacyReminderFlag = payload?.options?.sendResetForExistingUsers;
    const options: Required<BulkImportOptions> = {
      createClasses: payload?.options?.createClasses ?? true,
      sendEmailsToNew: payload?.options?.sendEmailsToNew ?? true,
      resendPendingInvites: payload?.options?.resendPendingInvites ?? false,
      sendLoginReminders: payload?.options?.sendLoginReminders ??
        (typeof legacyReminderFlag === "boolean" ? legacyReminderFlag : false),
      sendResetForExistingUsers: typeof legacyReminderFlag === "boolean"
        ? legacyReminderFlag
        : false,
      updateSubscriptionForExisting:
        payload?.options?.updateSubscriptionForExisting ?? true,
      dryRun: payload?.options?.dryRun ?? false,
    };

    // Basic validation
    if (rows.length === 0) {
      return fail(400, "No rows provided");
    }
    if (rows.length > MAX_ROWS) {
      return fail(400, `Maximum ${MAX_ROWS} rows allowed per import`);
    }

    // Normalize and filter invalid rows
    const normalizedRows = rows.map((r, idx) => ({
      idx,
      email: (r.email || "").trim().toLowerCase(),
      full_name: (r.full_name || "").trim(),
      role: (r.role || "student") as Role,
      class_name: r.class_name ? normalizeClassName(r.class_name) : undefined,
      class_description: r.class_description
        ? r.class_description.trim()
        : undefined,
      teacher_email: r.teacher_email
        ? r.teacher_email.trim().toLowerCase()
        : undefined,
      subscription_end_date: r.subscription_end_date?.trim(),
    }));

    const issues: Issue[] = [];
    const validRows = normalizedRows.filter((r) => {
      const errs: string[] = [];
      if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
        errs.push("Invalid or missing email");
      }
      if (!r.full_name) errs.push("Missing full_name");
      if (
        r.subscription_end_date &&
        !/^\d{4}-\d{2}-\d{2}$/.test(r.subscription_end_date)
      ) errs.push("Invalid subscription_end_date (YYYY-MM-DD)");
      if (r.class_name && !options.createClasses && !r.teacher_email) {
        // For existing classes w/out teacher, it might be OK; we only warn here
      }
      if (errs.length) {
        issues.push({ row: r.idx, email: r.email, error: errs.join("; ") });
        return false;
      }
      return true;
    });

    // Collect key sets
    const teacherEmails = new Set(
      validRows.filter((r) => r.teacher_email).map((r) =>
        r.teacher_email as string
      ),
    );
    // If a row is a teacher-only row (role teacher and no class_name), include that email as well
    for (const r of validRows) {
      if (r.role === "teacher" && !r.teacher_email && !r.class_name) {
        teacherEmails.add(r.email);
      }
    }
    const studentEmails = new Set(
      validRows.filter((r) => (r.role ?? "student") === "student").map((r) =>
        r.email
      ),
    );
    const allEmails = new Set<string>([
      ...teacherEmails,
      ...studentEmails,
      ...validRows.map((r) => r.email),
    ]);
    const desiredClasses = new Map<
      string,
      { name: string; desc?: string; teacherEmail?: string }
    >();
    for (const r of validRows) {
      if (r.class_name) {
        const key = toKey(r.class_name);
        if (!desiredClasses.has(key)) {
          desiredClasses.set(key, {
            name: r.class_name,
            desc: r.class_description,
            teacherEmail: r.teacher_email,
          });
        } else {
          // If multiple teacher_emails provided for same class, keep the first and warn
          const existing = desiredClasses.get(key)!;
          if (
            r.teacher_email && existing.teacherEmail &&
            existing.teacherEmail !== r.teacher_email
          ) {
            issues.push({
              row: r.idx,
              email: r.email,
              warnings: [
                `Multiple teacher_email for class '${existing.name}'. Using first: ${existing.teacherEmail}`,
              ],
            });
          } else if (r.teacher_email && !existing.teacherEmail) {
            existing.teacherEmail = r.teacher_email;
          }
          if (!existing.desc && r.class_description) {
            existing.desc = r.class_description;
          }
        }
      }
    }

    // Preload memberships in current academy
    const emailsArray = Array.from(allEmails);
    const { data: membershipsData, error: memErr } = await adminClient
      .from("academy_memberships")
      .select(MEMBERSHIP_COLUMNS)
      .eq("academy_id", academyId)
      .in("email", emailsArray)
      .returns<MembershipRecord[]>();
    if (memErr) throw memErr;
    const existingMemberships = asArray<MembershipRecord>(membershipsData);
    const membershipByEmail = new Map<string, MembershipWithMetadata>();
    existingMemberships.forEach((m) =>
      membershipByEmail.set(m.email, m as MembershipWithMetadata)
    );

    // Preload classes for academy
    const { data: classesDataRaw, error: classesErr } = await adminClient
      .from("classes")
      .select(CLASS_COLUMNS)
      .eq("academy_id", academyId)
      .returns<ClassRecord[]>();
    if (classesErr) throw classesErr;
    const classesData = asArray<ClassRecord>(classesDataRaw);
    const classByKey = new Map<string, ClassRecord>();
    classesData.forEach((c) => classByKey.set(toKey(c.name), c));

    // Summary accumulators
    const summary: BulkImportSummary = {
      newMemberships: 0,
      updatedMemberships: 0,
      reactivatedMemberships: 0,
      classesCreated: 0,
      classesReused: 0,
      teachersReplaced: 0,
      classAssignments: 0,
      movedStudents: 0,
      skippedAssignments: 0,
      emailsInvited: 0,
      loginRemindersSent: 0,
      conflicts: 0,
    };

    const details: Detail[] = [];

    // STEP 1: Ensure teacher memberships exist (create or role-upgrade if needed)
    const teacherEmailsArr = Array.from(teacherEmails);
    const today = new Date();
    for (const tEmail of teacherEmailsArr) {
      const existing = membershipByEmail.get(tEmail);
      if (!existing) {
        if (!options.dryRun) {
          const { data: preparedData, error: prepErr } = await adminClient
            .rpc("admin_prepare_membership_invite", {
              p_academy_id: academyId,
              p_email: tEmail,
              p_role: "teacher",
            })
            .single<MembershipWithMetadata>();
          const prepared = asMembershipWithMetadata(preparedData);
          if (prepErr || !prepared) {
            issues.push({
              row: -1,
              email: tEmail,
              error: `Failed to prepare teacher membership: ${
                prepErr?.message ?? "Unknown error"
              }`,
            });
            continue;
          }
          summary.newMemberships++;
          membershipByEmail.set(tEmail, prepared);
        } else {
          summary.newMemberships++;
        }
      } else if (existing.role !== "teacher") {
        if (!options.dryRun) {
          const { membership: upgradedMembership, errorMessage } =
            await promoteMembershipToTeacher(
              adminClient,
              existing,
              {
                userId: actorUserId,
                academyId: fallbackAcademyId,
                isPlatformAdmin: actorIsPlatformAdmin,
              },
              requestId,
            );
          if (errorMessage) {
            issues.push({
              row: -1,
              email: tEmail,
              error: `Failed to promote to teacher: ${errorMessage}`,
            });
            continue;
          }

          const merged = (upgradedMembership ??
            {
              ...existing,
              role: "teacher" as Role,
            }) as MembershipWithMetadata;
          const roleChanged = merged.role !== existing.role;
          if (roleChanged) summary.updatedMemberships++;
          membershipByEmail.set(tEmail, merged);

          if (roleChanged) {
            await syncMetadataAfterMembershipChange({
              adminClient,
              membership: merged as MembershipWithMetadata,
              metadataCandidates: [
                upgradedMembership as MetadataCarrier | null | undefined,
              ],
              metadataTargets:
                (upgradedMembership as { metadata_targets?: unknown })
                  ?.metadata_targets,
              performedChange: true,
              fallbackRequestId: requestId,
              issues,
              rowIndex: -1,
              email: tEmail,
            });
          }
        } else {
          summary.updatedMemberships++;
        }
      }
    }

    // STEP 2: Ensure student memberships (create/reactivate/update dates)
    for (const r of validRows) {
      if ((r.role ?? "student") !== "student") continue;
      const existing = membershipByEmail.get(r.email);
      const desiredEnd = r.subscription_end_date ||
        ymd(computeDefaultEndDate(today));
      const desiredStart = ymd(today);

      if (!existing) {
        if (!options.dryRun) {
          const { data: preparedData, error: prepErr } = await adminClient
            .rpc("admin_prepare_membership_invite", {
              p_academy_id: academyId,
              p_email: r.email,
              p_role: "student",
            })
            .single<MembershipWithMetadata>();
          const prepared = asMembershipWithMetadata(preparedData);
          if (prepErr || !prepared) {
            issues.push({
              row: r.idx,
              email: r.email,
              error: `Failed to prepare student membership: ${
                prepErr?.message ?? "Unknown error"
              }`,
            });
            continue;
          }

          let latest: MembershipWithMetadata = prepared;
          summary.newMemberships++;

          const { data: datedMembershipData, error: dateErr } =
            await adminClient
              .rpc("update_membership_subscription_dates", {
                p_membership_id: prepared.id,
                p_subscription_start_date: desiredStart,
                p_subscription_end_date: desiredEnd,
                p_request_id: requestId,
              })
              .single<MembershipWithMetadata>();

          if (dateErr) {
            issues.push({
              row: r.idx,
              email: r.email,
              error: `Update subscription dates failed: ${dateErr.message}`,
            });
            membershipByEmail.set(r.email, latest);
            continue;
          }

          const datedMembership = asMembershipWithMetadata(datedMembershipData);
          latest = datedMembership ?? latest;
          summary.updatedMemberships++;
          membershipByEmail.set(r.email, latest);

          await syncMetadataAfterMembershipChange({
            adminClient,
            membership: latest,
            metadataCandidates: [asMetadataCarrier(datedMembershipData)],
            metadataTargets: datedMembership?.metadata_targets,
            performedChange: true,
            fallbackRequestId: requestId,
            issues,
            rowIndex: r.idx,
            email: r.email,
          });
        } else {
          summary.newMemberships++;
          summary.updatedMemberships++;
        }
      } else {
        const canPromoteToActive = !!existing.user_id &&
          existing.status === "inactive";
        const reactivationRequested = canPromoteToActive;
        const wantsDateUpdate = options.updateSubscriptionForExisting &&
          !!r.subscription_end_date;

        if (reactivationRequested || wantsDateUpdate) {
          if (!options.dryRun) {
            let latest: MembershipWithMetadata | null =
              existing as MembershipWithMetadata;
            let performedChange = false;
            let statusChangeSucceeded = false;
            let metadataFromStatus: MetadataCarrier | null = null;
            let metadataFromDates: MetadataCarrier | null = null;
            let metadataTargets: unknown =
              (existing as MetadataCarrier | null)?.metadata_targets ?? null;

            if (reactivationRequested) {
              const payload: Record<string, unknown> = {
                p_membership_id: existing.id,
                p_status: "active",
                p_force_status_active: true,
                p_request_id: requestId,
              };

              const { data: managedMembershipData, error: manageErr } =
                await adminClient
                  .rpc("admin_manage_membership", payload)
                  .single<MembershipWithMetadata>();

              if (manageErr) {
                issues.push({
                  row: r.idx,
                  email: r.email,
                  error: `Update membership failed: ${manageErr.message}`,
                });
                continue;
              }

              const managedMembership = asMembershipWithMetadata(
                managedMembershipData,
              );
              metadataFromStatus = asMetadataCarrier(managedMembershipData);
              metadataTargets = managedMembership?.metadata_targets ??
                metadataTargets;

              const reconciliation = reconcileMembershipStatusResponse({
                existing,
                requestedStatus: "active",
                returnedMembership: managedMembership,
                issues,
                email: r.email,
                rowIndex: r.idx,
              });

              latest = reconciliation.latest;
              statusChangeSucceeded = reconciliation.statusChangeSucceeded;

              if (reconciliation.shouldAbort) {
                membershipByEmail.set(r.email, reconciliation.latest);
                continue;
              }

              performedChange = performedChange || statusChangeSucceeded;
            }

            if (wantsDateUpdate) {
              const datePayload: Record<string, unknown> = {
                p_membership_id: (latest ?? existing).id,
                p_subscription_end_date: r.subscription_end_date,
                p_request_id: requestId,
              };
              if (!(latest ?? existing).subscription_start_date) {
                datePayload.p_subscription_start_date = desiredStart;
              }

              const { data: datedMembershipData, error: dateErr } =
                await adminClient
                  .rpc("update_membership_subscription_dates", datePayload)
                  .single<MembershipWithMetadata>();

              if (dateErr) {
                issues.push({
                  row: r.idx,
                  email: r.email,
                  error: `Update subscription dates failed: ${dateErr.message}`,
                });
                continue;
              }

              const datedMembership = asMembershipWithMetadata(
                datedMembershipData,
              );
              metadataFromDates = asMetadataCarrier(datedMembershipData);
              metadataTargets = datedMembership?.metadata_targets ??
                metadataTargets;

              const base = (datedMembership ?? latest ??
                existing) as MembershipWithMetadata;
              latest = base;
              performedChange = true;
            }

            if (reactivationRequested && statusChangeSucceeded) {
              summary.reactivatedMemberships++;
            }
            if (performedChange) summary.updatedMemberships++;
            const merged = (latest ?? existing) as MembershipWithMetadata;
            membershipByEmail.set(r.email, merged);

            if (performedChange) {
              await syncMetadataAfterMembershipChange({
                adminClient,
                membership: merged,
                metadataCandidates: [
                  metadataFromDates,
                  metadataFromStatus,
                  merged as MetadataCarrier,
                ],
                performedChange,
                fallbackRequestId: requestId,
                issues,
                rowIndex: r.idx,
                email: r.email,
                metadataTargets,
              });
            }
          } else {
            if (reactivationRequested) summary.reactivatedMemberships++;
            summary.updatedMemberships++;
          }
        }
      }
    }

    // STEP 3: Ensure classes exist (create if needed and allowed)
    const classesToCreate: Array<{ name: string; description?: string }> = [];
    for (const [key, meta] of desiredClasses.entries()) {
      if (!classByKey.has(key)) {
        // Require teacher for new class
        if (!meta.teacherEmail) {
          issues.push({
            row: -1,
            error:
              `Class '${meta.name}' has no teacher specified. Skipping creation.`,
          });
          continue;
        }
        classesToCreate.push({ name: meta.name, description: meta.desc });
      } else {
        summary.classesReused++;
      }
    }
    if (classesToCreate.length && !options.dryRun) {
      const { data: createdData, error: clsErr } = await adminClient
        .from("classes")
        .insert(
          classesToCreate.map((c) => ({
            academy_id: academyId,
            name: c.name,
            description: c.description ?? null,
          })),
        )
        .select(CLASS_COLUMNS)
        .returns<ClassRecord[]>();
      if (clsErr) {
        issues.push({
          row: -1,
          error: `Failed to create classes: ${clsErr.message}`,
        });
      } else {
        const created = asArray<ClassRecord>(createdData);
        summary.classesCreated += created.length;
        created.forEach((c) => classByKey.set(toKey(c.name), c));
      }
    } else if (classesToCreate.length) {
      summary.classesCreated += classesToCreate.length;
    }

    // Refresh created class IDs for downstream
    // STEP 4: Ensure/replace teacher in classes when specified
    // Map classId -> target teacher membership id (if any)
    const targetTeacherByClass = new Map<number, number>();
    for (const [key, meta] of desiredClasses.entries()) {
      const cls = classByKey.get(key);
      if (!cls) continue;
      if (!meta.teacherEmail) continue;
      const tm = membershipByEmail.get(meta.teacherEmail);
      if (!tm) continue; // should exist by now
      targetTeacherByClass.set(cls.id, tm.id);
    }

    // Fetch current teacher memberships for involved classes
    const classIds = Array.from(targetTeacherByClass.keys());
    if (classIds.length) {
      const { data: cmTeachersData, error: cmTErr } = await adminClient
        .from("class_members")
        .select(CLASS_MEMBERSHIP_COLUMNS)
        .in("class_id", classIds)
        .returns<ClassMembershipRow[]>();
      if (cmTErr) {
        issues.push({
          row: -1,
          error: `Failed to load class teacher memberships: ${cmTErr.message}`,
        });
      } else {
        const cmTeachers = asArray<ClassMembershipRow>(cmTeachersData);
        // Replace teachers: ensure only the designated teacher remains
        for (const classId of classIds) {
          const desiredMembershipId = targetTeacherByClass.get(classId)!;
          const current = cmTeachers.filter((x) =>
            x.class_id === classId && x.academy_memberships?.role === "teacher"
          );
          const toRemove = current.filter((x) =>
            x.membership_id !== desiredMembershipId
          ).map((x) => x.membership_id);
          const hasDesired = current.some((x) =>
            x.membership_id === desiredMembershipId
          );

          if (!options.dryRun) {
            if (toRemove.length) {
              const { error: delErr } = await adminClient
                .from("class_members")
                .delete()
                .eq("class_id", classId)
                .in("membership_id", toRemove)
                .returns<unknown>();
              if (delErr) {
                issues.push({
                  row: -1,
                  error:
                    `Failed to remove previous teacher(s) in class ${classId}: ${delErr.message}`,
                });
              } else summary.teachersReplaced += toRemove.length;
            }
            if (!hasDesired) {
              const { error: insErr } = await adminClient
                .from("class_members")
                .insert({
                  class_id: classId,
                  membership_id: desiredMembershipId,
                })
                .returns<unknown>();
              if (insErr) {
                issues.push({
                  row: -1,
                  error:
                    `Failed to add teacher to class ${classId}: ${insErr.message}`,
                });
              }
            }
          } else {
            summary.teachersReplaced += toRemove.length;
          }
        }
      }
    }

    // STEP 5: Move/add students to classes as requested
    const studentRows = validRows.filter((r) =>
      (r.role ?? "student") === "student" && r.class_name
    );
    if (studentRows.length) {
      const studentMembershipIds = studentRows
        .map((r) => membershipByEmail.get(r.email))
        .filter((m): m is MembershipRecord => Boolean(m))
        .map((m) => m.id);

      // Preload existing class memberships for these students
      const { data: existingCMData, error: cmErr } = await adminClient
        .from("class_members")
        .select(STUDENT_CLASS_MEMBERSHIP_COLUMNS)
        .in("membership_id", studentMembershipIds)
        .returns<StudentClassMembershipRow[]>();
      if (cmErr) {
        issues.push({
          row: -1,
          error:
            `Failed to load current student class memberships: ${cmErr.message}`,
        });
      }
      const existingCM = asArray<StudentClassMembershipRow>(existingCMData);

      for (const r of studentRows) {
        const member = membershipByEmail.get(r.email);
        if (!member) { // Should not happen
          details.push({
            row: r.idx,
            email: r.email,
            actions: [],
            error: "Membership not found",
          });
          summary.conflicts++;
          continue;
        }
        if (member.role !== "student") {
          details.push({
            row: r.idx,
            email: r.email,
            actions: [],
            error:
              `Membership role is '${member.role}', cannot assign as student`,
          });
          summary.conflicts++;
          continue;
        }
        const cls = classByKey.get(toKey(r.class_name!));
        if (!cls) {
          details.push({
            row: r.idx,
            email: r.email,
            actions: [],
            error: `Class '${r.class_name}' not created (no teacher)`,
          });
          summary.conflicts++;
          continue;
        }

        const current = existingCM.filter((x) => x.membership_id === member.id);
        const alreadyInTarget = current.some((x) => x.class_id === cls.id);
        const otherClasses = current.filter((x) => x.class_id !== cls.id).map(
          (x) => x.class_id,
        );

        if (!options.dryRun) {
          if (otherClasses.length) {
            const { error: delErr } = await adminClient
              .from("class_members")
              .delete()
              .eq("membership_id", member.id)
              .in("class_id", otherClasses)
              .returns<unknown>();
            if (delErr) {
              issues.push({
                row: r.idx,
                email: r.email,
                error:
                  `Failed to remove from previous classes: ${delErr.message}`,
              });
            } else summary.movedStudents++;
          }
          if (!alreadyInTarget) {
            const { error: insErr } = await adminClient
              .from("class_members")
              .insert({ class_id: cls.id, membership_id: member.id })
              .returns<unknown>();
            if (insErr) {
              issues.push({
                row: r.idx,
                email: r.email,
                error:
                  `Failed to add to class '${cls.name}': ${insErr.message}`,
              });
            } else summary.classAssignments++;
          } else {
            summary.skippedAssignments++;
          }
        } else {
          if (otherClasses.length) summary.movedStudents++;
          if (!alreadyInTarget) summary.classAssignments++;
          else summary.skippedAssignments++;
        }

        details.push({
          row: r.idx,
          email: r.email,
          actions: [
            otherClasses.length
              ? `removed-from:${otherClasses.join(",")}`
              : "no-removal",
            alreadyInTarget ? "already-in-target" : `added-to:${cls.name}`,
          ],
        });
      }
    }

    // STEP 6: Assign teacher in student_profiles (only for claimed memberships and classes with a teacher user_id)
    // Build class -> teacher user_id map, preferring explicit teacherEmail, otherwise use unique existing teacher
    const classIdsFromStudents = Array.from(
      new Set(
        studentRows.map((r) => classByKey.get(toKey(r.class_name!))?.id).filter(
          Boolean,
        ) as number[],
      ),
    );
    const classIdsWithTeacherPref = Array.from(targetTeacherByClass.keys());
    const classIdsAll = Array.from(
      new Set([...classIdsFromStudents, ...classIdsWithTeacherPref]),
    );
    const teacherUserIdByClass = new Map<number, string>();

    if (classIdsAll.length) {
      const { data: cmTeachers2Data } = await adminClient
        .from("class_members")
        .select(CLASS_MEMBERSHIP_WITH_USER_COLUMNS)
        .in("class_id", classIdsAll)
        .returns<ClassMembershipRow[]>();

      const teacherRows = asArray<ClassMembershipRow>(cmTeachers2Data);

      for (const cid of classIdsAll) {
        const prefMemId = targetTeacherByClass.get(cid);
        const candidates = teacherRows.filter(
          (row) =>
            row.class_id === cid && row.academy_memberships?.role === "teacher",
        );

        if (prefMemId) {
          const pref = candidates.find((row) =>
            row.membership_id === prefMemId
          );
          const prefUserId = pref?.academy_memberships?.user_id;
          if (prefUserId) {
            teacherUserIdByClass.set(cid, prefUserId);
            continue;
          }
        }

        const uniqueWithUserId = candidates.filter((row) =>
          !!row.academy_memberships?.user_id
        );
        if (uniqueWithUserId.length === 1) {
          const uniqueUserId = uniqueWithUserId[0].academy_memberships?.user_id;
          if (uniqueUserId) teacherUserIdByClass.set(cid, uniqueUserId);
        }
      }
    }

    if (!options.dryRun && teacherUserIdByClass.size) {
      // For each student row with class, if membership is claimed and class has teacher user_id -> update/insert student_profiles
      for (const r of studentRows) {
        const cls = classByKey.get(toKey(r.class_name!));
        if (!cls) continue;
        const teacherUid = teacherUserIdByClass.get(cls.id);
        if (!teacherUid) continue;
        const studentMembership = membershipByEmail.get(r.email);
        const membershipId = studentMembership?.id ?? null;
        const studentUid = studentMembership?.user_id as string | null;
        if (!membershipId || !studentUid) continue;
        const { data: exists, error: spSelErr } = await adminClient
          .from("student_profiles")
          .select("membership_id")
          .eq("membership_id", membershipId)
          .maybeSingle();
        if (spSelErr) {
          issues.push({
            row: r.idx,
            email: r.email,
            error: `Failed to load student profile: ${spSelErr.message}`,
          });
          continue;
        }
        if (exists) {
          const { error: upErr } = await adminClient
            .from("student_profiles")
            .update({ assigned_teacher_id: teacherUid })
            .eq("membership_id", membershipId)
            .returns<unknown>();
          if (upErr) {
            issues.push({
              row: r.idx,
              email: r.email,
              error: `Failed to update student profile: ${upErr.message}`,
            });
          }
        } else {
          const { error: insErr } = await adminClient
            .from("student_profiles")
            .insert({
              membership_id: membershipId,
              assigned_teacher_id: teacherUid,
              target_exam_id: null,
              target_level_id: null,
            })
            .returns<unknown>();
          if (insErr) {
            issues.push({
              row: r.idx,
              email: r.email,
              error: `Failed to create student profile: ${insErr.message}`,
            });
          }
        }
      }
    }

    // STEP 7: Email invitations/reminders as per options
    if (!options.dryRun) {
      const processedEmails = new Set<string>();
      const sendReminderForTarget = async (
        targetEmail: string,
        membership: MembershipRecord,
        redirectTo: string,
      ): Promise<void> => {
        if (!options.sendLoginReminders) return;
        const academyTagValue = typeof membership.academy_id === "number" &&
            Number.isFinite(membership.academy_id)
          ? String(membership.academy_id)
          : fallbackAcademyId !== null
          ? String(fallbackAcademyId)
          : "unknown";
        await sendLoginReminderEmail({
          to: targetEmail,
          academyName,
          authUrl: redirectTo,
          requestId,
          idempotencyKey: `${requestId}:bulk-import:${targetEmail}`,
          tags: [
            { name: "academy_id", value: academyTagValue },
            { name: "reminder_source", value: "bulk_import_roster" },
          ],
        });
        summary.loginRemindersSent += 1;
      };
      const sendTokenlessInvite = async (
        targetEmail: string,
        membership: MembershipRecord,
        mode: InviteMode,
      ): Promise<void> => {
        const inviteRole = toInviteRole(membership.role);
        const template = buildInviteMembersTemplate({
          academyName,
          role: inviteRole,
          siteUrl,
          subscriptionStartDate: membership.subscription_start_date ??
            undefined,
          subscriptionEndDate: membership.subscription_end_date ?? undefined,
          isResend: mode === "resend",
        });
        const academyTagValue = typeof membership.academy_id === "number" &&
            Number.isFinite(membership.academy_id)
          ? String(membership.academy_id)
          : fallbackAcademyId !== null
          ? String(fallbackAcademyId)
          : "unknown";

        await sendTransactionalEmail({
          to: targetEmail,
          subject: template.subject,
          html: template.html,
          text: template.text,
          requestId,
          idempotencyKey: `${requestId}:bulk-import:${mode}:${targetEmail}`,
          tags: [
            { name: "academy_id", value: academyTagValue },
            { name: "invite_mode", value: mode },
            { name: "invite_role", value: inviteRole },
          ],
        });
        summary.emailsInvited += 1;
      };
      const processInvitationFor = async (
        targetEmail: string,
        membership: MembershipRecord,
        rowIndex: number,
        isNew: boolean,
      ) => {
        const redirectTo = buildRedirectForMembership(membership);
        try {
          if (isNew && options.sendEmailsToNew) {
            await sendTokenlessInvite(targetEmail, membership, "create");
          } else if (
            !isNew && membership.status === "awaiting_login" &&
            options.resendPendingInvites
          ) {
            await sendTokenlessInvite(targetEmail, membership, "resend");
          } else if (options.sendLoginReminders) {
            await sendReminderForTarget(targetEmail, membership, redirectTo);
          }
        } catch (error) {
          if (options.sendLoginReminders) {
            try {
              await sendReminderForTarget(targetEmail, membership, redirectTo);
            } catch (reminderError) {
              const message = reminderError instanceof Error
                ? reminderError.message
                : String(reminderError);
              issues.push({
                row: rowIndex,
                email: targetEmail,
                error: `Login reminder error: ${message}`,
              });
            }
          } else {
            const message = error instanceof Error
              ? error.message
              : String(error);
            issues.push({
              row: rowIndex,
              email: targetEmail,
              error: `Email send error: ${message}`,
            });
          }
        }
      };
      for (const r of validRows) {
        // For the row's main email
        if (!processedEmails.has(r.email)) {
          const mem = membershipByEmail.get(r.email);
          if (!mem) {
            processedEmails.add(r.email);
            continue;
          }
          const isNew = !existingMemberships?.some((m) =>
            m.email.toLowerCase() === r.email
          );
          await processInvitationFor(r.email, mem, r.idx, isNew);
          processedEmails.add(r.email);
        }

        // For teacher_email if present
        if (r.teacher_email && !processedEmails.has(r.teacher_email)) {
          const mem = membershipByEmail.get(r.teacher_email);
          if (!mem) {
            processedEmails.add(r.teacher_email);
            continue;
          }
          const isNew = !existingMemberships?.some((m) =>
            m.email.toLowerCase() === r.teacher_email
          );
          await processInvitationFor(r.teacher_email, mem, r.idx, isNew);
          processedEmails.add(r.teacher_email);
        }
      }
    }

    // Response
    const resp = { summary, issues, details, request_id: requestId };
    const status = issues.some((i) => i.error) ? 207 : 200;
    return ok(resp, status);
  } catch (_error) {
    console.error("bulk-import-roster error:");
    return fail(500, "Internal Server Error");
  }
}
if (import.meta.main) {
  serve((req) => handleBulkImportRoster(req));
}

export const __testing = {
  syncMetadataAfterMembershipChange,
  normalizeMetadataResult,
};
