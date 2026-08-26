import { serve } from "std/http/server.ts";
import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { getServiceRoleClient, requireAuth } from "../_shared/auth.ts";
import { assertRateLimit, enforceRateLimit } from "../_shared/rate-limit.ts";
import { HttpError, isHttpError } from "../_shared/http-errors.ts";
import {
  buildInvitationRedirect,
  DEFAULT_SITE_URL,
} from "../_shared/invitation-redirect.ts";
import { sendLoginReminderEmail } from "../_shared/send-login-reminder-email.ts";
import { normalizeEmail } from "./email-utils.ts";
import {
  applyMetadataUpdates,
  extractMetadataUpdates,
} from "../_shared/metadata-sync.ts";
import { buildInviteMembersTemplate } from "../_shared/templates/invite-members.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { resolveRequestId } from "../_shared/request-id.ts";
import { resolveClientIpRateLimitKey } from "../_shared/request-ip.ts";

const encoder = new TextEncoder();
const ADMIN_SIGNATURE_HEADER = "x-admin-signature";
const ADMIN_TIMESTAMP_HEADER = "x-admin-timestamp";
const SIGNATURE_WINDOW_MS = Number(
  Deno.env.get("SUPER_ADMIN_SIGNATURE_WINDOW_MS") ?? (5 * 60 * 1000),
);
const ADMIN_RATE_LIMIT_MAX = Number(
  Deno.env.get("SUPER_ADMIN_INVITE_LIMIT_PER_IP") ?? "5",
);
const ADMIN_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("SUPER_ADMIN_INVITE_LIMIT_WINDOW_MS") ?? (60 * 60 * 1000),
);
const ADMIN_USER_RATE_LIMIT_MAX = Number(
  Deno.env.get("SUPER_ADMIN_INVITE_LIMIT_PER_USER") ??
    String(ADMIN_RATE_LIMIT_MAX),
);
const ADMIN_USER_RATE_LIMIT_WINDOW_MS = Number(
  Deno.env.get("SUPER_ADMIN_INVITE_LIMIT_USER_WINDOW_MS") ??
    String(ADMIN_RATE_LIMIT_WINDOW_MS),
);
const ADMIN_ALLOWED_ROLES = ["platform_owner", "super_admin"];
const METADATA_SYNC_ERROR = "Failed to refresh membership metadata";

type InviteMode = "create" | "resend";

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

const unwrapRpcRecord = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] ?? null : value;

const toMembershipHint = (
  record: unknown,
  fallbackAcademyId: number,
): { id: number; academy_id: number } | null => {
  const unwrapped = unwrapRpcRecord(record);
  if (!unwrapped || typeof unwrapped !== "object") {
    return null;
  }
  const candidate = unwrapped as { id?: unknown; academy_id?: unknown };
  const membershipId = parseSupabaseBigint(candidate.id);
  if (membershipId === null) {
    return null;
  }
  const fallbackNormalized = Number.isSafeInteger(fallbackAcademyId)
    ? fallbackAcademyId
    : null;
  const academyId = parseSupabaseBigint(candidate.academy_id) ??
    fallbackNormalized;
  if (academyId === null) {
    return null;
  }
  return { id: membershipId, academy_id: academyId };
};

const extractMembershipRole = (
  record: unknown,
): { role?: string; status?: string } => {
  const unwrapped = unwrapRpcRecord(record);
  if (!unwrapped || typeof unwrapped !== "object") {
    return {};
  }
  const candidate = unwrapped as { role?: unknown; status?: unknown };
  return {
    role: typeof candidate.role === "string" ? candidate.role : undefined,
    status: typeof candidate.status === "string" ? candidate.status : undefined,
  };
};

const extractAdminManageMetadataUpdates = (
  result: unknown,
  requestId: string,
) => {
  const row = unwrapRpcRecord(result);
  return extractMetadataUpdates(
    (row as { metadata_targets?: unknown } | null)?.metadata_targets,
    {
      userId: typeof (row as { user_id?: unknown } | null)?.user_id === "string"
        ? (row as { user_id?: unknown }).user_id as string
        : null,
      payload: (row as { metadata_payload?: unknown } | null)
        ?.metadata_payload,
      shouldRefreshSession: (row as { should_refresh_session?: unknown } | null)
        ?.should_refresh_session,
      requestId: typeof (row as { request_id?: unknown } | null)?.request_id ===
          "string"
        ? (row as { request_id?: unknown }).request_id as string
        : requestId,
    },
  );
};

const applyAdminManageMetadata = async (result: unknown, requestId: string) => {
  const updates = extractAdminManageMetadataUpdates(result, requestId);
  if (!updates.length) return;
  await applyMetadataUpdates(updates, METADATA_SYNC_ERROR);
};

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

async function computeHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  const bytes = new Uint8Array(signature);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyAdminSignature(
  rawBody: string,
  headers: Headers,
): Promise<void> {
  const secret = Deno.env.get("SUPER_ADMIN_SECRET");
  if (!secret) {
    throw new Error("SUPER_ADMIN_SECRET environment variable not configured");
  }

  const timestampHeader = headers.get(ADMIN_TIMESTAMP_HEADER);
  const signatureHeader = headers.get(ADMIN_SIGNATURE_HEADER);

  if (!timestampHeader || !signatureHeader) {
    throw new HttpError(401, "Missing admin signature headers");
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    throw new HttpError(401, "Invalid admin signature timestamp");
  }

  if (Math.abs(Date.now() - timestamp) > SIGNATURE_WINDOW_MS) {
    throw new HttpError(401, "Admin signature timestamp expired");
  }

  const expected = await computeHmac(secret, `${timestampHeader}:${rawBody}`);
  const provided = signatureHeader.trim().toLowerCase();

  if (!timingSafeEqual(expected, provided)) {
    throw new HttpError(401, "Invalid admin signature");
  }
}

type MembershipRecord = {
  id?: unknown;
  academy_id?: unknown;
  user_id?: unknown;
  role?: unknown;
  status?: unknown;
};
type AdminRpcError = { message?: string };
type AdminRpcResponse = { data: unknown; error: AdminRpcError | null };
type AdminSupabaseClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<AdminRpcResponse>;
};

type ExecuteInviteFlowInput = {
  adminSupabaseClient: AdminSupabaseClient;
  existingMembership: MembershipRecord | null;
  academyId: number;
  academyName: string;
  email: string;
  forceReset: boolean;
  siteUrl: string;
  requestId: string;
  log: (...args: unknown[]) => void;
  sendEmail?: typeof sendTransactionalEmail;
  sendLoginReminder?: typeof sendLoginReminderEmail;
};

const sendInvitationWithLoginReminderFallback = async ({
  email,
  academyName,
  academyId,
  siteUrl,
  authRedirect,
  requestId,
  mode,
  log,
  sendEmail = sendTransactionalEmail,
  sendLoginReminder = sendLoginReminderEmail,
}: {
  email: string;
  academyName: string;
  academyId: number;
  siteUrl: string;
  authRedirect: string;
  requestId: string;
  mode: InviteMode;
  log: (...args: unknown[]) => void;
  sendEmail?: typeof sendTransactionalEmail;
  sendLoginReminder?: typeof sendLoginReminderEmail;
}): Promise<"invitation" | "login_reminder"> => {
  const maskedEmail = maskEmail(email);
  const template = buildInviteMembersTemplate({
    academyName,
    role: "academy_admin",
    siteUrl,
    isResend: mode === "resend",
  });

  try {
    await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      requestId,
      idempotencyKey: `${requestId}:super-admin-invite:${mode}:${email}`,
      tags: [
        { name: "academy_id", value: String(academyId) },
        { name: "invite_mode", value: mode },
        { name: "invite_role", value: "academy_admin" },
      ],
    });
    log("inviteEmailSent", { email: maskedEmail, mode });
    return "invitation";
  } catch (inviteError) {
    log("inviteEmailError", { email: maskedEmail, mode, error: inviteError });
    try {
      await sendLoginReminder({
        to: email,
        academyName,
        authUrl: authRedirect,
        requestId,
        idempotencyKey:
          `${requestId}:super-admin-invite:login-reminder:${email}`,
        tags: [
          { name: "academy_id", value: String(academyId) },
          { name: "invite_outcome", value: "login_reminder" },
          { name: "invite_role", value: "academy_admin" },
        ],
      });
      log("loginReminderSent", { email: maskedEmail });
      return "login_reminder";
    } catch (reminderError) {
      log("loginReminderError", { email: maskedEmail, error: reminderError });
      throw new HttpError(
        500,
        "Failed to send invitation email",
        reminderError,
      );
    }
  }
};

const manageMembershipForInvitation = async ({
  adminSupabaseClient,
  existingMembership,
  academyId,
  email,
  forceReset,
  requestId,
  log,
}: {
  adminSupabaseClient: AdminSupabaseClient;
  existingMembership: MembershipRecord | null;
  academyId: number;
  email: string;
  forceReset: boolean;
  requestId: string;
  log: (...args: unknown[]) => void;
}): Promise<{ id: number; academy_id: number } | null> => {
  let membershipForRedirect = toMembershipHint(existingMembership, academyId);

  if (!existingMembership) {
    const { data: preparedMembership, error: membershipPrepareError } =
      await adminSupabaseClient.rpc("admin_prepare_membership_invite", {
        p_academy_id: academyId,
        p_email: email,
        p_role: "academy_admin",
      });
    if (membershipPrepareError) {
      log("membershipPrepareError", membershipPrepareError);
      throw new HttpError(
        500,
        "Failed to prepare membership invite",
        membershipPrepareError,
      );
    }
    const preparedHint = toMembershipHint(preparedMembership, academyId);
    if (preparedHint) {
      membershipForRedirect = preparedHint;
    } else {
      log("membershipPrepareMissingData", {
        academyId,
        email: maskEmail(email),
      });
    }
    return membershipForRedirect ?? null;
  }

  const existingMembershipId = parseSupabaseBigint(existingMembership.id);
  const existingAcademyId =
    parseSupabaseBigint(existingMembership.academy_id) ??
      (Number.isSafeInteger(academyId) ? academyId : null);
  const existingRole = typeof existingMembership.role === "string"
    ? existingMembership.role.toLowerCase()
    : null;

  if (existingRole && existingRole !== "academy_admin") {
    log("membershipRoleConflict", {
      membershipId: existingMembershipId ?? existingMembership.id ?? null,
      role: existingRole,
      academyId: existingAcademyId ?? existingMembership.academy_id ?? null,
    });
    throw new HttpError(409, "ROLE_CONFLICT", {
      code: "ROLE_CONFLICT",
      membership_id: existingMembershipId ?? existingMembership.id ?? null,
      current_role: existingRole,
    });
  }

  if (existingMembership.user_id) {
    if (existingMembershipId !== null && existingAcademyId !== null) {
      membershipForRedirect = {
        id: existingMembershipId,
        academy_id: existingAcademyId,
      };
    } else {
      log("membershipRedirectHintInvalid", {
        id: existingMembership.id,
        academy_id: existingMembership.academy_id,
      });
    }

    if (forceReset) {
      const manageArgs = {
        p_membership_id: existingMembership.id,
        p_status: "awaiting_login",
        p_role: "academy_admin",
        p_clear_user: true,
        p_allow_active_clear: true,
        p_email: email,
        p_request_id: requestId,
      };
      const { data: managedMembershipAfterReset, error: manageError } =
        await adminSupabaseClient.rpc("admin_manage_membership", manageArgs);
      if (manageError) {
        log("membershipForceResetError", manageError);
        throw new HttpError(500, "Failed to reset membership", manageError);
      }
      await applyAdminManageMetadata(managedMembershipAfterReset, requestId);
      const resetHint = toMembershipHint(
        managedMembershipAfterReset,
        academyId,
      );
      if (resetHint) {
        membershipForRedirect = resetHint;
      }
      log("membershipForceReset", {
        membershipId: existingMembership.id,
        forceReset,
        clearedWithDeletion: false,
        authUserPreserved: true,
      });
    } else {
      const manageArgs: Record<string, unknown> = {
        p_membership_id: existingMembership.id,
        p_role: "academy_admin",
        p_request_id: requestId,
      };
      if (
        typeof existingMembership.status === "string" &&
        existingMembership.status === "inactive"
      ) {
        manageArgs.p_force_status_active = true;
        manageArgs.p_status = "active";
      }

      const { data: managedMembership, error: manageError } =
        await adminSupabaseClient.rpc("admin_manage_membership", manageArgs);
      if (manageError) {
        log("membershipPromotionError", manageError);
        throw new HttpError(500, "Failed to promote membership", manageError);
      }
      await applyAdminManageMetadata(managedMembership, requestId);

      const { role: managedRole, status: managedStatus } =
        extractMembershipRole(managedMembership);
      const resultingRole = managedRole ?? existingMembership.role;
      if (resultingRole !== "academy_admin") {
        const details = {
          membershipId: existingMembership.id,
          previousRole: existingMembership.role ?? null,
          resultingRole,
          status: existingMembership.status ?? null,
        };
        log("membershipPromotionUnexpectedRole", details);
        throw new HttpError(500, "Failed to promote membership", details);
      } else {
        if (managedStatus === "inactive") {
          log("membershipPromotionInactiveStatus", {
            membershipId: existingMembership.id,
            resultingStatus: managedStatus,
          });
        }
        const promotionHint = toMembershipHint(managedMembership, academyId);
        if (promotionHint) {
          membershipForRedirect = promotionHint;
        }
        log("membershipPromoted", {
          membershipId: existingMembership.id,
          previousRole: existingMembership.role,
          resultingRole,
        });
      }
    }
  } else {
    if (existingMembershipId !== null && existingAcademyId !== null) {
      membershipForRedirect = {
        id: existingMembershipId,
        academy_id: existingAcademyId,
      };
    } else {
      log("membershipRedirectHintInvalid", {
        id: existingMembership.id,
        academy_id: existingMembership.academy_id,
      });
    }
    const rpcArgs = {
      p_membership_id: existingMembership.id,
      p_status: "awaiting_login",
      p_role: "academy_admin",
      p_email: email,
      p_request_id: requestId,
    };
    const { data: managedMembership, error: manageError } =
      await adminSupabaseClient.rpc("admin_manage_membership", rpcArgs);
    if (manageError) {
      log("membershipManageError", manageError);
      throw new HttpError(500, "Failed to reset membership", manageError);
    }
    await applyAdminManageMetadata(managedMembership, requestId);
    const resetHint = toMembershipHint(managedMembership, academyId);
    if (resetHint) {
      membershipForRedirect = resetHint;
    }
  }

  return membershipForRedirect ?? null;
};

const executeInviteFlow = async ({
  adminSupabaseClient,
  existingMembership,
  academyId,
  academyName,
  email,
  forceReset,
  siteUrl,
  requestId,
  log,
  sendEmail,
  sendLoginReminder,
}: ExecuteInviteFlowInput): Promise<
  {
    inviteOutcome: "invitation" | "login_reminder";
    membershipForRedirect: { id: number; academy_id: number } | null;
  }
> => {
  const inviteMode: InviteMode = existingMembership ? "resend" : "create";
  const membershipForRedirect = await manageMembershipForInvitation({
    adminSupabaseClient,
    existingMembership,
    academyId,
    email,
    forceReset,
    requestId,
    log,
  });

  const membershipHint = membershipForRedirect ??
    toMembershipHint(existingMembership, academyId);
  const redirectTo = buildInvitationRedirect(siteUrl, {
    membershipId: membershipHint?.id ?? null,
    academyId: membershipHint?.academy_id ?? academyId,
  });

  const inviteOutcome = await sendInvitationWithLoginReminderFallback({
    email,
    academyName,
    academyId: membershipHint?.academy_id ?? academyId,
    siteUrl,
    authRedirect: redirectTo,
    requestId,
    mode: inviteMode,
    log,
    sendEmail,
    sendLoginReminder,
  });

  if (!membershipHint) {
    log("missingMembershipHint", { email: maskEmail(email), academyId });
  }

  return { inviteOutcome, membershipForRedirect: membershipHint ?? null };
};

export const superAdminInviteHandler = async (
  req: Request,
): Promise<Response> => {
  const baseCorsHeaders = createCorsHeaders(req);
  const jsonHeaders = {
    ...baseCorsHeaders,
    "Content-Type": "application/json",
  };
  let requestId: string = crypto.randomUUID();
  try {
    const resolved = await resolveRequestId(req.headers);
    requestId = resolved.requestId;
  } catch (_error) {
    console.warn("[super-admin-invite][request-id-fallback]");
  }
  const log = (...args: unknown[]) => {
    const event = typeof args[0] === "string" ? args[0] : "diagnostic_event";
    console.log(`[super-admin-invite][${requestId}]`, { event });
  };
  const respond = (status: number, body: Record<string, unknown>) => {
    const payload = { requestId, ...body };
    return new Response(JSON.stringify(payload), {
      status,
      headers: jsonHeaders,
    });
  };

  if (req.method === "OPTIONS") {
    try {
      ensureAllowedOrigin(req);
      return new Response("ok", { headers: baseCorsHeaders });
    } catch (error) {
      if (isHttpError(error)) {
        return new Response(error.message, {
          status: error.status,
          headers: baseCorsHeaders,
        });
      }
      log("preflightError", error);
      return new Response("forbidden", {
        status: 403,
        headers: baseCorsHeaders,
      });
    }
  }

  try {
    ensureAllowedOrigin(req);

    if (req.method !== "POST") {
      return respond(405, { error: "Method not allowed" });
    }

    const rawBody = await req.text();
    await verifyAdminSignature(rawBody, req.headers);

    let body: { academy_id?: number; email?: string; force_reset?: boolean };
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      log("invalidJson", error);
      return respond(400, { error: "Invalid JSON payload" });
    }

    const authContext = await requireAuth(req, {
      allowedRoles: ADMIN_ALLOWED_ROLES,
      requireAcademy: false,
    });
    log("authorizedActor", {
      userId: authContext.user.id,
      role: authContext.profile.role,
    });

    const ipRateKey = resolveClientIpRateLimitKey(req.headers);

    const [userRate, ipRate] = await Promise.all([
      enforceRateLimit(["super-admin-invite", "user", authContext.user.id], {
        maxRequests: ADMIN_USER_RATE_LIMIT_MAX,
        windowMs: ADMIN_USER_RATE_LIMIT_WINDOW_MS,
      }),
      enforceRateLimit(["super-admin-invite", "ip", ipRateKey], {
        maxRequests: ADMIN_RATE_LIMIT_MAX,
        windowMs: ADMIN_RATE_LIMIT_WINDOW_MS,
      }),
    ]);

    assertRateLimit(userRate);
    assertRateLimit(ipRate);

    const academyId = body.academy_id;
    const email = normalizeEmail(body.email);
    const forceReset = body.force_reset === true;

    if (!academyId || !email) {
      return respond(400, { error: "Missing academy_id or email" });
    }

    const adminSupabaseClient = getServiceRoleClient();
    const siteUrl = Deno.env.get("SITE_URL") || DEFAULT_SITE_URL;

    const { data: academyRecord, error: academyLookupError } =
      await adminSupabaseClient
        .from("academies")
        .select("name")
        .eq("id", academyId)
        .maybeSingle();

    if (academyLookupError) {
      log("academyLookupError", academyLookupError);
      throw new HttpError(
        500,
        "Failed to load academy data",
        academyLookupError,
      );
    }

    const academyName = typeof academyRecord?.name === "string" &&
        academyRecord.name.trim().length > 0
      ? academyRecord.name.trim()
      : "Exameny";

    const { data: existingMembership, error: membershipLookupError } =
      await adminSupabaseClient
        .from("academy_memberships")
        .select("id, academy_id, user_id, role, status")
        .eq("academy_id", academyId)
        .eq("email", email)
        .maybeSingle();

    if (membershipLookupError) {
      log("membershipLookupError", membershipLookupError);
      throw new HttpError(
        500,
        "Failed to verify membership state",
        membershipLookupError,
      );
    }

    const { inviteOutcome } = await executeInviteFlow({
      adminSupabaseClient,
      existingMembership: existingMembership ?? null,
      academyId,
      academyName,
      email,
      forceReset,
      siteUrl,
      requestId,
      log,
    });

    return respond(200, {
      message:
        `Invitation sent successfully to ${email} for academy ${academyId}`,
      inviteOutcome,
    });
  } catch (error) {
    if (isHttpError(error)) {
      return respond(error.status, { error: error.message });
    }
    log("unexpectedError", error);
    return respond(500, { error: "Internal Server Error" });
  }
};

if (import.meta.main) {
  serve(superAdminInviteHandler);
}

export const __testing = {
  sendInvitationWithLoginReminderFallback,
  manageMembershipForInvitation,
  executeInviteFlow,
  extractAdminManageMetadataUpdates,
};
