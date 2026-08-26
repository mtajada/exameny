import { serve } from "std/http/server.ts";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { getServiceRoleClient } from "../_shared/auth.ts";
import {
  authenticateAdminRequest,
  resolveAdminActorContext,
} from "../_shared/admin-auth.ts";
import {
  buildInviteMembersTemplate,
  type InviteMembersTemplateInput,
} from "../_shared/templates/invite-members.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import {
  buildAdminForbiddenError,
  HttpError,
  isHttpError,
  isPostgrestError,
  type PostgrestError,
} from "../_shared/http-errors.ts";
import {
  extractPublicErrorCode,
  extractPublicErrorDetails,
} from "../_shared/public-error.ts";
import { DEFAULT_SITE_URL } from "../_shared/invitation-redirect.ts";
import { emitInviteMembersCalled } from "../_shared/events.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import { tryBuildManualInterventionResponse } from "../_shared/manual-intervention.ts";

type InviteRole = "student" | "teacher" | "academy_admin";
type InviteMode = "create" | "resend";

interface InviteMembersPayload {
  emails: string[];
  role: InviteRole;
  mode: InviteMode;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  academyId: number | null;
}

interface MembershipRow {
  id: number;
  academy_id: number;
  email: string;
  role: string | null;
  status: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
}

interface InsertMembershipRecord {
  academy_id: number;
  email: string;
  role: InviteRole;
  status: "awaiting_login";
  subscription_start_date: string | null;
  subscription_end_date: string | null;
}

interface InviteEmailJob {
  email: string;
  academyName: string;
  academyId: number;
  role: InviteRole;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  siteUrl: string;
  requestId: string;
  mode: InviteMode;
}

interface InviteMembersResult {
  request_id: string;
  emails_total: number;
  emails_created: number;
  emails_resend: number;
  emails_failed: number;
  failures?: Array<{ email: string; reason: string }>;
}

const MEMBERSHIP_SELECT_FIELDS =
  "id, academy_id, email, role, status, subscription_start_date, subscription_end_date";

const headersToRecord = (headers: Headers): Record<string, string> =>
  Object.fromEntries(headers.entries());

const normalizeMembershipRows = (
  rows: Array<Record<string, unknown>> | null,
): MembershipRow[] =>
  (rows ?? [])
    .map((row) => normalizeMembershipRow(row))
    .filter((row): row is MembershipRow => Boolean(row));

const buildInviteMetricsSnapshot = (
  requestId: string,
  payload: InviteMembersPayload | null,
  overrides: Partial<Omit<InviteMembersResult, "request_id">> = {},
): Pick<
  InviteMembersResult,
  | "request_id"
  | "emails_total"
  | "emails_created"
  | "emails_resend"
  | "emails_failed"
> => {
  const total = overrides.emails_total ?? (payload ? payload.emails.length : 0);
  return {
    request_id: requestId,
    emails_total: total,
    emails_created: overrides.emails_created ?? 0,
    emails_resend: overrides.emails_resend ?? 0,
    emails_failed: overrides.emails_failed ?? 0,
  };
};

const uniqueValues = <T>(values: T[]): T[] => Array.from(new Set(values));

const isDuplicateMembershipViolation = (
  error: unknown,
): error is PostgrestError => {
  if (!isPostgrestError(error)) {
    return false;
  }
  if (typeof error.code === "string" && error.code.trim() === "23505") {
    return true;
  }
  const message = typeof error.message === "string" ? error.message : "";
  if (message.includes("academy_memberships_academy_email_key")) {
    return true;
  }
  const details = typeof error.details === "string" ? error.details : "";
  return details.includes("(academy_id") && details.includes("email");
};

const extractDuplicateEmail = (detail: unknown): string | null => {
  if (typeof detail !== "string" || detail.length === 0) {
    return null;
  }
  const match = detail.match(/\(([^)]+)\)=\(([^)]+)\)/);
  if (!match) {
    return null;
  }
  const columns = match[1]
    .split(",")
    .map((column) => column.replace(/["']/g, "").trim());
  const values = match[2]
    .split(",")
    .map((value) => value.replace(/['"]/g, "").trim());
  const emailIndex = columns.findIndex((column) => column === "email");
  if (emailIndex === -1 || emailIndex >= values.length) {
    return null;
  }
  const value = values[emailIndex];
  return value.length > 0 ? value.toLowerCase() : null;
};

interface DuplicateInviteErrorDeps {
  fetchMemberships: (
    academyId: number,
    emails: string[],
  ) => Promise<MembershipRow[]>;
}

const translateDuplicateInviteError = async (
  error: unknown,
  records: InsertMembershipRecord[],
  deps: DuplicateInviteErrorDeps,
): Promise<HttpError | null> => {
  if (!isDuplicateMembershipViolation(error)) {
    return null;
  }

  if (records.length === 0) {
    return new HttpError(409, INVITATION_ALREADY_EXISTS_COPY, {
      code: "INVITATION_ALREADY_EXISTS",
    });
  }

  const academyIds = uniqueValues(records.map((record) => record.academy_id));
  if (academyIds.length !== 1) {
    return new HttpError(409, INVITATION_ALREADY_EXISTS_COPY, {
      code: "INVITATION_ALREADY_EXISTS",
    });
  }

  const academyId = academyIds[0];
  const emails = uniqueValues(records.map((record) => record.email));
  if (emails.length === 0) {
    return new HttpError(409, INVITATION_ALREADY_EXISTS_COPY, {
      code: "INVITATION_ALREADY_EXISTS",
    });
  }

  let memberships: MembershipRow[] = [];
  try {
    memberships = await deps.fetchMemberships(academyId, emails);
  } catch (_fetchError) {
    console.error("[invite-members][duplicate-check][fetch-failed]");
    return new HttpError(409, INVITATION_ALREADY_EXISTS_COPY, {
      code: "INVITATION_ALREADY_EXISTS",
    });
  }

  const conflictEmail = extractDuplicateEmail(
    (error as PostgrestError).details,
  );
  const conflict = conflictEmail
    ? memberships.find((row) => row.email === conflictEmail)
    : memberships[0];

  if (conflict) {
    return new HttpError(409, INVITATION_ALREADY_EXISTS_COPY, {
      code: "INVITATION_ALREADY_EXISTS",
      membership_id: conflict.id,
      status: conflict.status,
      email: conflict.email,
      role: conflict.role,
      subscription_start_date: conflict.subscription_start_date,
      subscription_end_date: conflict.subscription_end_date,
    });
  }

  return new HttpError(409, INVITATION_ALREADY_EXISTS_COPY, {
    code: "INVITATION_ALREADY_EXISTS",
  });
};

interface ProcessContext {
  academyId: number;
  academyName: string;
  adminUserId: string;
  siteUrl: string;
  requestId: string;
  startedAt: number;
}

interface ProcessDependencies {
  insertMemberships: (
    records: InsertMembershipRecord[],
    requestId: string,
  ) => Promise<MembershipRow[]>;
  sendEmail: (job: InviteEmailJob) => Promise<void>;
  now: () => number;
}

const ROLE_CONFLICT_COPY =
  "This email is already linked to {{current_role}}. Use a different account to invite them as {{requested_role}}.";
const INVITATION_ALREADY_EXISTS_COPY =
  "An invitation already exists for that email in this academy. Review its status before resending.";
const MEMBERSHIP_NOT_FOUND_COPY =
  "We could not find an invitation for that email in this academy.";
const INVALID_JSON_COPY = "The request body must be valid JSON.";
const INVALID_EMAIL_COPY = "Each entry in emails must be a valid address.";
const SUBSCRIPTION_ROLE_COPY =
  "Subscription dates are only available when inviting students.";
const SUBSCRIPTION_RANGE_COPY =
  "Subscription start date must be earlier than or equal to the end date.";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const allowedRoles: InviteRole[] = ["student", "teacher", "academy_admin"];
const allowedModes: InviteMode[] = ["create", "resend"];

const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!domain) {
    return email;
  }
  if (local.length <= 2) {
    return `${local[0] ?? "*"}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
};

const toYmd = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaultStudentWindow = (
  baseDate: Date = new Date(),
): { start: string; end: string } => {
  const start = toYmd(baseDate);
  // Anchor a year ahead, then step back one day so the window spans exactly 12 months.
  const anchor = new Date(
    Date.UTC(
      baseDate.getUTCFullYear() + 1,
      baseDate.getUTCMonth(),
      baseDate.getUTCDate(),
    ),
  );
  anchor.setUTCDate(anchor.getUTCDate() - 1);
  const end = toYmd(anchor);
  return { start, end };
};

const normalizeSiteUrl = (value: string | null | undefined): string => {
  if (!value) {
    return DEFAULT_SITE_URL;
  }
  return value.replace(/\/+$/, "");
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseDateField = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must use the YYYY-MM-DD format.`, {
      code: "INVALID_DATE",
      field,
    });
  }
  const trimmed = value.trim();
  if (!DATE_PATTERN.test(trimmed)) {
    throw new HttpError(400, `${field} must use the YYYY-MM-DD format.`, {
      code: "INVALID_DATE",
      field,
    });
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${field} is not a valid date.`, {
      code: "INVALID_DATE",
      field,
    });
  }
  return trimmed;
};

const formatRoleConflictCopy = (
  currentRole: string | null,
  requestedRole: string | null,
): string =>
  ROLE_CONFLICT_COPY.replace("{{current_role}}", currentRole ?? "another role")
    .replace(
      "{{requested_role}}",
      requestedRole ?? "the requested role",
    );

const parseAcademyId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new HttpError(400, "academy_id must be a positive integer.", {
        code: "INVALID_ACADEMY_ID",
      });
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new HttpError(400, "academy_id must be a positive integer.", {
        code: "INVALID_ACADEMY_ID",
      });
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new HttpError(400, "academy_id must be a positive integer.", {
        code: "INVALID_ACADEMY_ID",
      });
    }
    return parsed;
  }

  throw new HttpError(400, "academy_id must be a positive integer.", {
    code: "INVALID_ACADEMY_ID",
  });
};

const normalizeEmails = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "Send at least one email.", {
      code: "MISSING_EMAILS",
    });
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      throw new HttpError(400, INVALID_EMAIL_COPY, {
        code: "INVALID_EMAIL",
        index,
      });
    }
    const email = entry.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new HttpError(400, INVALID_EMAIL_COPY, {
        code: "INVALID_EMAIL",
        value: entry,
      });
    }
    if (!seen.has(email)) {
      normalized.push(email);
      seen.add(email);
    }
  });
  return normalized;
};

const normalizeRole = (value: unknown): InviteRole => {
  if (typeof value !== "string") {
    throw new HttpError(400, "role is required.", { code: "INVALID_ROLE" });
  }
  const normalized = value.trim().toLowerCase() as InviteRole;
  if (!allowedRoles.includes(normalized)) {
    throw new HttpError(400, "role is not valid.", {
      code: "INVALID_ROLE",
      value,
    });
  }
  return normalized;
};

const normalizeMode = (value: unknown): InviteMode => {
  if (value === null || value === undefined || value === "") {
    return "create";
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "mode is not valid.", { code: "INVALID_MODE" });
  }
  const normalized = value.trim().toLowerCase() as InviteMode;
  if (!allowedModes.includes(normalized)) {
    throw new HttpError(400, "mode is not valid.", {
      code: "INVALID_MODE",
      value,
    });
  }
  return normalized;
};

const validateSubscriptionWindow = (
  role: InviteRole,
  mode: InviteMode,
  startRaw: unknown,
  endRaw: unknown,
): {
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
} => {
  if (role !== "student") {
    if (startRaw || endRaw) {
      throw new HttpError(400, SUBSCRIPTION_ROLE_COPY, {
        code: "INVALID_SUBSCRIPTION_ROLE",
      });
    }
    return { subscriptionStartDate: null, subscriptionEndDate: null };
  }

  if (mode === "resend" && (startRaw || endRaw)) {
    throw new HttpError(
      400,
      "Cannot edit subscription dates while resending invites.",
      {
        code: "INVALID_RESEND_SUBSCRIPTION",
      },
    );
  }

  if (mode === "resend") {
    return { subscriptionStartDate: null, subscriptionEndDate: null };
  }

  const defaults = defaultStudentWindow();
  const subscriptionStartDate =
    parseDateField(startRaw, "subscription_start_date") ?? defaults.start;
  const subscriptionEndDate = parseDateField(endRaw, "subscription_end_date") ??
    defaults.end;

  const startDate = new Date(`${subscriptionStartDate}T00:00:00Z`);
  const endDate = new Date(`${subscriptionEndDate}T00:00:00Z`);
  if (startDate.getTime() > endDate.getTime()) {
    throw new HttpError(400, SUBSCRIPTION_RANGE_COPY, {
      code: "INVALID_SUBSCRIPTION_RANGE",
    });
  }

  return { subscriptionStartDate, subscriptionEndDate };
};

const parsePayload = async (req: Request): Promise<InviteMembersPayload> => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, INVALID_JSON_COPY, { code: "INVALID_JSON" });
  }

  if (!isPlainRecord(raw)) {
    throw new HttpError(400, INVALID_JSON_COPY, { code: "INVALID_BODY" });
  }

  const emails = normalizeEmails(raw.emails);
  const role = normalizeRole(raw.role);
  const mode = normalizeMode(raw.mode ?? raw.mode_type);
  const window = validateSubscriptionWindow(
    role,
    mode,
    raw.subscription_start_date ?? raw.subscriptionStartDate,
    raw.subscription_end_date ?? raw.subscriptionEndDate,
  );
  const academyId = parseAcademyId(raw.academy_id ?? raw.academyId ?? null);

  return {
    emails,
    role,
    mode,
    subscriptionStartDate: window.subscriptionStartDate,
    subscriptionEndDate: window.subscriptionEndDate,
    academyId,
  };
};

const normalizeMembershipRow = (
  row: Record<string, unknown>,
): MembershipRow | null => {
  const idValue = row.id;
  const academyValue = row.academy_id;
  const emailValue = row.email;

  if (typeof idValue !== "number" || typeof academyValue !== "number") {
    return null;
  }
  if (typeof emailValue !== "string") {
    return null;
  }

  return {
    id: idValue,
    academy_id: academyValue,
    email: emailValue.trim().toLowerCase(),
    role: typeof row.role === "string" ? row.role : null,
    status: typeof row.status === "string" ? row.status : null,
    subscription_start_date: typeof row.subscription_start_date === "string"
      ? row.subscription_start_date
      : null,
    subscription_end_date: typeof row.subscription_end_date === "string"
      ? row.subscription_end_date
      : null,
  };
};

const groupMembershipsByEmail = (
  rows: MembershipRow[],
): Map<string, MembershipRow[]> => {
  const map = new Map<string, MembershipRow[]>();
  rows.forEach((row) => {
    const list = map.get(row.email) ?? [];
    list.push(row);
    map.set(row.email, list);
  });
  return map;
};

const assertRoleConsistency = (
  rows: MembershipRow[],
  role: InviteRole,
): void => {
  const conflicting = rows.find((row) => {
    if (!row.role) {
      return false;
    }
    return row.role !== role;
  });

  if (conflicting) {
    throw new HttpError(409, formatRoleConflictCopy(conflicting.role, role), {
      code: "ROLE_CONFLICT",
      current_role: conflicting.role,
      requested_role: role,
    });
  }
};

const assertNoExistingMemberships = (
  rows: MembershipRow[],
  academyId: number,
): void => {
  const existing = rows.find((row) => row.academy_id === academyId);
  if (existing) {
    throw new HttpError(409, INVITATION_ALREADY_EXISTS_COPY, {
      code: "INVITATION_ALREADY_EXISTS",
      membership_id: existing.id,
      status: existing.status,
    });
  }
};

const assertMembershipsPresent = (
  rows: MembershipRow[],
  academyId: number,
): MembershipRow => {
  const membership = rows.find((row) => row.academy_id === academyId);
  if (!membership) {
    throw new HttpError(404, MEMBERSHIP_NOT_FOUND_COPY, {
      code: "INVITATION_NOT_FOUND",
    });
  }
  return membership;
};

const buildInsertRecords = (
  emails: string[],
  academyId: number,
  role: InviteRole,
  window: {
    subscriptionStartDate: string | null;
    subscriptionEndDate: string | null;
  },
): InsertMembershipRecord[] =>
  emails.map((email) => ({
    academy_id: academyId,
    email,
    role,
    status: "awaiting_login",
    subscription_start_date: role === "student"
      ? window.subscriptionStartDate
      : null,
    subscription_end_date: role === "student"
      ? window.subscriptionEndDate
      : null,
  }));

const createEmailJobs = (
  membershipRows: MembershipRow[],
  context: ProcessContext,
  payload: InviteMembersPayload,
): InviteEmailJob[] =>
  payload.emails.map((email) => {
    const membership = membershipRows.find((row) =>
      row.email === email && row.academy_id === context.academyId
    );
    const startDate = membership?.subscription_start_date ??
      payload.subscriptionStartDate ?? null;
    const endDate = membership?.subscription_end_date ??
      payload.subscriptionEndDate ?? null;
    return {
      email,
      academyName: context.academyName,
      academyId: context.academyId,
      role: payload.role,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      siteUrl: context.siteUrl,
      requestId: context.requestId,
      mode: payload.mode,
    };
  });

const processInviteMembers = async (
  context: ProcessContext,
  payload: InviteMembersPayload,
  membershipRows: MembershipRow[],
  deps: ProcessDependencies,
): Promise<{ result: InviteMembersResult; durationMs: number }> => {
  const groupedRows = groupMembershipsByEmail(membershipRows);
  payload.emails.forEach((email) => {
    const rows = groupedRows.get(email) ?? [];
    assertRoleConsistency(rows, payload.role);
    if (payload.mode === "create") {
      assertNoExistingMemberships(rows, context.academyId);
    } else {
      assertMembershipsPresent(rows, context.academyId);
    }
  });

  let insertedRows: MembershipRow[] = [];
  if (payload.mode === "create") {
    const insertRecords = buildInsertRecords(
      payload.emails,
      context.academyId,
      payload.role,
      payload,
    );
    insertedRows = await deps.insertMemberships(
      insertRecords,
      context.requestId,
    );
  }

  const rowsForEmails = payload.mode === "create"
    ? insertedRows
    : payload.emails.map((email) => {
      const rows = groupedRows.get(email) ?? [];
      return assertMembershipsPresent(rows, context.academyId);
    });

  const jobs = createEmailJobs(rowsForEmails, context, payload);
  let emailsFailed = 0;
  const failures: Array<{ email: string; reason: string }> = [];

  for (const job of jobs) {
    try {
      await deps.sendEmail(job);
      console.info("[invite-members][send-success]", {
        request_id: context.requestId,
        mode: payload.mode,
      });
    } catch (error) {
      emailsFailed += 1;
      const message = error instanceof Error
        ? error.message
        : "Failed to send the email.";
      failures.push({ email: maskEmail(job.email), reason: message });
      console.error("[invite-members][send-failure]", {
        request_id: context.requestId,
        mode: payload.mode,
      });
    }
  }

  const durationMs = Math.round(deps.now() - context.startedAt);
  const result: InviteMembersResult = {
    request_id: context.requestId,
    emails_total: payload.emails.length,
    emails_created: payload.mode === "create" ? payload.emails.length : 0,
    emails_resend: payload.mode === "resend" ? payload.emails.length : 0,
    emails_failed: emailsFailed,
  };
  if (failures.length > 0) {
    result.failures = failures;
  }

  return { result, durationMs };
};

const buildJsonResponse = (headers: Headers, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers,
  });

const fetchAcademyName = async (academyId: number) => {
  const client = getServiceRoleClient();
  const { data, error } = await client.from("academies").select("id, name").eq(
    "id",
    academyId,
  ).maybeSingle();
  if (error) {
    throw new HttpError(500, "We could not load the academy information.", {
      code: "ACADEMY_LOOKUP_FAILED",
      cause: error,
    });
  }
  if (!data) {
    throw new HttpError(404, "Academy not found.", {
      code: "ACADEMY_NOT_FOUND",
    });
  }
  const name = typeof data.name === "string" && data.name.trim().length > 0
    ? data.name.trim()
    : "Exameny";
  return name;
};

const fetchMembershipRows = async (emails: string[]) => {
  if (emails.length === 0) {
    return [];
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("academy_memberships")
    .select(MEMBERSHIP_SELECT_FIELDS)
    .in("email", emails);
  if (error) {
    throw new HttpError(500, "We could not review the existing invitations.", {
      code: "INVITE_LOOKUP_FAILED",
      cause: error,
    });
  }
  if (!data) {
    return [];
  }
  const rows = Array.isArray(data) ? data.filter(isPlainRecord) : null;
  return normalizeMembershipRows(rows);
};

const insertMembershipRows = async (
  records: InsertMembershipRecord[],
  requestId: string,
): Promise<MembershipRow[]> => {
  if (records.length === 0) {
    return [];
  }

  const client = getServiceRoleClient();
  const created: MembershipRow[] = [];

  for (const record of records) {
    const { data: prepared, error: prepareError } = await client
      .rpc("admin_prepare_membership_invite", {
        p_academy_id: record.academy_id,
        p_email: record.email,
        p_role: record.role,
      })
      .single();

    if (prepareError) {
      throw new HttpError(500, "We could not create the invitations.", {
        code: "INVITE_PREPARE_FAILED",
        cause: prepareError,
      });
    }

    const preparedMembership = isPlainRecord(prepared) ? prepared : null;
    if (!preparedMembership) {
      throw new HttpError(500, "We could not create the invitations.", {
        message: "Missing membership payload",
      });
    }

    let normalized = normalizeMembershipRow(preparedMembership);
    if (!normalized) {
      throw new HttpError(500, "We could not create the invitations.", {
        message: "Invalid membership payload",
      });
    }

    if (
      record.role === "student" &&
      (record.subscription_start_date || record.subscription_end_date)
    ) {
      const { data: datedMembership, error: dateError } = await client
        .rpc("update_membership_subscription_dates", {
          p_membership_id: normalized.id,
          p_subscription_start_date: record.subscription_start_date,
          p_subscription_end_date: record.subscription_end_date,
          p_request_id: requestId,
        })
        .single();

      if (dateError) {
        throw new HttpError(500, "We could not create the invitations.", {
          code: "INVITE_SUBSCRIPTION_UPDATE_FAILED",
          cause: dateError,
        });
      }

      const datedRecord = isPlainRecord(datedMembership)
        ? datedMembership
        : preparedMembership;
      const normalizedDated = normalizeMembershipRow(datedRecord);
      if (normalizedDated) {
        normalized = normalizedDated;
      }
    }

    created.push(normalized);
  }

  return created;
};

const sendInviteEmail = async (job: InviteEmailJob) => {
  const templateInput: InviteMembersTemplateInput = {
    academyName: job.academyName,
    role: job.role,
    siteUrl: job.siteUrl,
    subscriptionStartDate: job.subscriptionStartDate ?? undefined,
    subscriptionEndDate: job.subscriptionEndDate ?? undefined,
  };

  if (job.mode === "resend") {
    templateInput.isResend = true;
  }

  const template = buildInviteMembersTemplate(templateInput);

  await sendTransactionalEmail({
    to: job.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    requestId: job.requestId,
    idempotencyKey: `${job.requestId}:${job.mode}:${job.email}`,
    tags: [
      { name: "academy_id", value: String(job.academyId) },
      { name: "invite_mode", value: job.mode },
      { name: "invite_role", value: job.role },
    ],
  });
};

const defaultDependencies = {
  createCorsHeaders,
  ensureAllowedOrigin,
  authenticateAdminRequest,
  resolveAdminActorContext,
  resolveRequestId,
  processInviteMembers,
  fetchAcademyName,
  fetchMembershipRows,
  insertMembershipRows,
  sendInviteEmail,
  emitInviteMembersCalled,
  now: () => performance.now(),
};

type Dependencies = typeof defaultDependencies;

const handleInviteMembers = async (
  req: Request,
  deps: Dependencies = defaultDependencies,
): Promise<Response> => {
  const corsHeaders = deps.createCorsHeaders(req);
  const jsonHeaders = new Headers({
    ...corsHeaders,
    "Content-Type": "application/json",
  });

  if (req.method === "OPTIONS") {
    try {
      deps.ensureAllowedOrigin(req);
      return new Response("ok", { headers: corsHeaders });
    } catch (error) {
      if (isHttpError(error)) {
        return new Response(error.message, {
          status: error.status,
          headers: corsHeaders,
        });
      }
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
  }

  const { requestId } = await deps.resolveRequestId(req.headers);
  let parsedPayload: InviteMembersPayload | null = null;
  let operationMetrics: InviteMembersResult | null = null;

  if (req.method !== "POST") {
    const metricsSnapshot = buildInviteMetricsSnapshot(requestId, null);
    return buildJsonResponse(jsonHeaders, 405, {
      ...metricsSnapshot,
      error: "Method not allowed",
    });
  }

  try {
    deps.ensureAllowedOrigin(req);

    let authContext;
    try {
      authContext = await deps.authenticateAdminRequest(req);
    } catch (error) {
      if (isHttpError(error) && error.status === 403) {
        throw buildAdminForbiddenError();
      }
      throw error;
    }

    const payload = await parsePayload(req);
    parsedPayload = payload;
    const { actorAcademyId, actorIsPlatformAdmin } = deps
      .resolveAdminActorContext(authContext);
    const requestedAcademyId = payload.academyId;

    if (
      !actorIsPlatformAdmin && actorAcademyId && requestedAcademyId &&
      actorAcademyId !== requestedAcademyId
    ) {
      throw new HttpError(
        400,
        "You cannot invite members outside the currently selected academy.",
        {
          code: "ACADEMY_SCOPE_MISMATCH",
        },
      );
    }

    let academyId: number | null = null;
    if (actorIsPlatformAdmin) {
      academyId = requestedAcademyId ?? null;
      if (!academyId) {
        throw new HttpError(
          400,
          "Provide academy_id when inviting from the platform.",
          {
            code: "ACADEMY_ID_REQUIRED",
          },
        );
      }
    } else {
      academyId = actorAcademyId ?? null;
      if (!academyId) {
        throw new HttpError(
          403,
          "Select an active academy before sending invites.",
          {
            code: "ACADEMY_SELECTION_REQUIRED",
          },
        );
      }
    }

    const academyName = await deps.fetchAcademyName(academyId);
    const membershipRows = await deps.fetchMembershipRows(payload.emails);

    const context: ProcessContext = {
      academyId,
      academyName,
      adminUserId: authContext.user.id,
      siteUrl: normalizeSiteUrl(Deno.env.get("SITE_URL")),
      requestId,
      startedAt: deps.now(),
    };

    const { result, durationMs } = await deps.processInviteMembers(
      context,
      payload,
      membershipRows,
      {
        insertMemberships: (records) =>
          deps.insertMembershipRows(records, context.requestId),
        sendEmail: deps.sendInviteEmail,
        now: deps.now,
      },
    );

    operationMetrics = result;

    await deps.emitInviteMembersCalled({
      request_id: requestId,
      admin_user_id: context.adminUserId,
      academy_id: academyId,
      emails_total: result.emails_total,
      emails_created: result.emails_created,
      emails_resend: result.emails_resend,
      emails_failed: result.emails_failed,
      duration_ms: durationMs,
    });

    return buildJsonResponse(jsonHeaders, 200, result);
  } catch (error) {
    const metricsSnapshot = buildInviteMetricsSnapshot(
      requestId,
      parsedPayload,
      operationMetrics ?? undefined,
    );
    const manualResponse = tryBuildManualInterventionResponse(
      error,
      requestId,
      headersToRecord(jsonHeaders),
      metricsSnapshot,
    );
    if (manualResponse) {
      return manualResponse;
    }

    if (isHttpError(error)) {
      console.error("[invite-members][error]", {
        request_id: requestId,
        status: error.status,
      });
      const code = extractPublicErrorCode(error.details);
      const details = extractPublicErrorDetails(error.details, [
        "membership_id",
        "status",
        "email",
        "role",
        "subscription_start_date",
        "subscription_end_date",
        "current_role",
        "requested_role",
        "field",
        "index",
        "value",
      ]);

      return buildJsonResponse(jsonHeaders, error.status, {
        ...metricsSnapshot,
        error: error.message,
        ...(code ? { code } : {}),
        ...(details ? { details } : {}),
      });
    }

    console.error("[invite-members][unexpected]", { request_id: requestId });
    return buildJsonResponse(jsonHeaders, 500, {
      ...metricsSnapshot,
      error:
        "We encountered an internal error while processing the invitations.",
    });
  }
};

if (import.meta.main) {
  serve((req) => handleInviteMembers(req));
}

interface InviteMembersTestingExports {
  normalizeEmails: typeof normalizeEmails;
  normalizeRole: typeof normalizeRole;
  normalizeMode: typeof normalizeMode;
  validateSubscriptionWindow: typeof validateSubscriptionWindow;
  defaultStudentWindow: typeof defaultStudentWindow;
  processInviteMembers: typeof processInviteMembers;
  ROLE_CONFLICT_COPY: typeof ROLE_CONFLICT_COPY;
  INVITATION_ALREADY_EXISTS_COPY: typeof INVITATION_ALREADY_EXISTS_COPY;
  MEMBERSHIP_NOT_FOUND_COPY: typeof MEMBERSHIP_NOT_FOUND_COPY;
  buildInviteMetricsSnapshot: typeof buildInviteMetricsSnapshot;
  handleInviteMembers: typeof handleInviteMembers;
  translateDuplicateInviteError: typeof translateDuplicateInviteError;
}

export const __testing: InviteMembersTestingExports = {
  normalizeEmails,
  normalizeRole,
  normalizeMode,
  validateSubscriptionWindow,
  defaultStudentWindow,
  processInviteMembers,
  ROLE_CONFLICT_COPY,
  INVITATION_ALREADY_EXISTS_COPY,
  MEMBERSHIP_NOT_FOUND_COPY,
  buildInviteMetricsSnapshot,
  handleInviteMembers,
  translateDuplicateInviteError,
};

export type { InviteMembersPayload, InviteMode, InviteRole };
