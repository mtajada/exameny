import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "std/testing/asserts.ts";

import { HttpError } from "../_shared/http-errors.ts";
import type { AuthContext } from "../_shared/auth.ts";
import { resolveActiveAcademyIdFromMetadata } from "../_shared/membership-context.ts";
import { buildInviteMembersTemplate } from "../_shared/templates/invite-members.ts";

const stubAllowedOrigins = () => "http://localhost:5173";

try {
  Object.defineProperty(Deno.env, "get", {
    configurable: true,
    writable: true,
    value: (
      key: string,
    ) => (key === "ALLOWED_ORIGINS" ? stubAllowedOrigins() : undefined),
  });
} catch {
  // ignore if env.get cannot be patched
}

const { __testing } = await import("../invite-members/index.ts");
type InviteMembersPayload = Parameters<
  typeof __testing.processInviteMembers
>[1];

type ProcessContext = Parameters<typeof __testing.processInviteMembers>[0];
type MembershipRow = Parameters<
  typeof __testing.processInviteMembers
>[2][number];
type ProcessDeps = Parameters<typeof __testing.processInviteMembers>[3];
type InsertRecord = Parameters<ProcessDeps["insertMemberships"]>[0][number];

const baseContext: ProcessContext = {
  academyId: 42,
  academyName: "Academia Demo",
  adminUserId: "admin-1",
  siteUrl: "https://example.com",
  requestId: "req-test",
  startedAt: 0,
};
const defaultAdminAcademyId = 101;

const buildMembership = (
  overrides: Partial<MembershipRow> = {},
): MembershipRow => ({
  id: overrides.id ?? Math.floor(Math.random() * 1000) + 1,
  academy_id: overrides.academy_id ?? baseContext.academyId,
  email: overrides.email ?? "user@example.com",
  role: overrides.role ?? "student",
  status: overrides.status ?? "awaiting_login",
  subscription_start_date: overrides.subscription_start_date ?? "2025-01-01",
  subscription_end_date: overrides.subscription_end_date ?? "2025-12-31",
});

const createPayload = (
  overrides: Partial<InviteMembersPayload> = {},
): InviteMembersPayload => ({
  emails: overrides.emails ?? ["user@example.com"],
  role: overrides.role ?? "student",
  mode: overrides.mode ?? "create",
  subscriptionStartDate: overrides.subscriptionStartDate ?? "2025-01-01",
  subscriptionEndDate: overrides.subscriptionEndDate ?? "2025-12-31",
  academyId: overrides.academyId ?? null,
});

const createDeps = (): ProcessDeps => ({
  insertMemberships: (records: InsertRecord[], _requestId: string) =>
    Promise.resolve(records.map((record, index) => ({
      id: index + 1,
      academy_id: record.academy_id,
      email: record.email,
      role: record.role,
      status: record.status,
      subscription_start_date: record.subscription_start_date,
      subscription_end_date: record.subscription_end_date,
    }))),
  sendEmail: () => Promise.resolve(),
  now: () => 200,
});

type HandlerDeps = NonNullable<
  Parameters<typeof __testing.handleInviteMembers>[1]
>;

const PLATFORM_ROLES = ["platform_owner", "super_admin"] as const;
const isPlatformRole = (role: unknown): role is typeof PLATFORM_ROLES[number] =>
  typeof role === "string" &&
  PLATFORM_ROLES.includes(role as typeof PLATFORM_ROLES[number]);

type PartialAuthContext = Partial<Omit<AuthContext, "profile" | "user">> & {
  profile?: Partial<AuthContext["profile"]>;
  user?: Partial<AuthContext["user"]>;
};

const buildAuthContext = (overrides?: PartialAuthContext): AuthContext => {
  const baseUser: AuthContext["user"] = {
    id: "admin-1",
    aud: "authenticated",
    role: "authenticated",
    email: "admin@example.com",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    last_sign_in_at: "2024-01-01T00:00:00.000Z",
    identities: [],
    app_metadata: {
      provider: "email",
      active_academy_id: defaultAdminAcademyId,
      memberships: [
        {
          membership_id: 11,
          academy_id: defaultAdminAcademyId,
          academy_name: "Admin Academy",
          role: "academy_admin",
          status: "active",
        },
      ],
    },
    user_metadata: {},
  };

  const base: AuthContext = {
    user: baseUser,
    profile: {
      id: "admin-1",
      email: "admin@example.com",
      role: "academy_admin",
      academy_id: defaultAdminAcademyId,
      membership_id: 11,
      full_name: "Admin User",
      platform_role: null,
    },
    supabase: {} as AuthContext["supabase"],
    authorization: "Bearer test",
  };
  if (!overrides) {
    return base;
  }
  return {
    ...base,
    ...overrides,
    user: { ...base.user, ...(overrides.user ?? {}) },
    profile: { ...base.profile, ...(overrides.profile ?? {}) },
  };
};

const buildHandlerDeps = (
  overrides: Partial<HandlerDeps> = {},
  authOverrides?: PartialAuthContext,
  actorOverrides?: {
    actorAcademyId?: number | null;
    actorIsPlatformAdmin?: boolean;
  },
): HandlerDeps => {
  const authContext = buildAuthContext(authOverrides);
  const defaultActorContext = {
    actorAcademyId: actorOverrides?.actorAcademyId ??
      resolveActiveAcademyIdFromMetadata(authContext.user),
    actorIsPlatformAdmin: actorOverrides?.actorIsPlatformAdmin ??
      isPlatformRole(authContext.profile.platform_role),
  };

  return {
    createCorsHeaders: (() => ({})) as HandlerDeps["createCorsHeaders"],
    ensureAllowedOrigin:
      (() => undefined) as HandlerDeps["ensureAllowedOrigin"],
    authenticateAdminRequest: overrides.authenticateAdminRequest ??
      (() => Promise.resolve(authContext)) as HandlerDeps[
        "authenticateAdminRequest"
      ],
    resolveAdminActorContext: overrides.resolveAdminActorContext ??
      (() => ({ ...defaultActorContext })) as HandlerDeps[
        "resolveAdminActorContext"
      ],
    resolveRequestId: overrides.resolveRequestId ??
      (() =>
        Promise.resolve({
          requestId: "req-metrics",
          source: "generated",
        })) as HandlerDeps["resolveRequestId"],
    processInviteMembers: overrides.processInviteMembers ??
      (() =>
        Promise.reject(
          new HttpError(409, "ROLE_CONFLICT", { code: "ROLE_CONFLICT" }),
        )) as HandlerDeps["processInviteMembers"],
    fetchAcademyName: overrides.fetchAcademyName ??
      (() => Promise.resolve("Academia Demo")) as HandlerDeps[
        "fetchAcademyName"
      ],
    fetchMembershipRows: overrides.fetchMembershipRows ??
      (() => Promise.resolve([])) as HandlerDeps["fetchMembershipRows"],
    insertMembershipRows: overrides.insertMembershipRows ??
      ((_records: InsertRecord[], _requestId: string) =>
        Promise.resolve([])) as HandlerDeps["insertMembershipRows"],
    sendInviteEmail: overrides.sendInviteEmail ??
      (() => Promise.resolve()) as HandlerDeps["sendInviteEmail"],
    emitInviteMembersCalled: overrides.emitInviteMembersCalled ??
      (() => Promise.resolve()) as HandlerDeps["emitInviteMembersCalled"],
    now: overrides.now ?? (() => 0) as HandlerDeps["now"],
    ...overrides,
  };
};

Deno.test("defaultStudentWindow spans a full 12-month period", () => {
  const base = new Date("2024-05-15T12:00:00Z");
  const result = __testing.defaultStudentWindow(base);
  assertEquals(result.start, "2024-05-15");
  assertEquals(result.end, "2025-05-14");

  const leapBase = new Date("2024-02-29T00:00:00Z");
  const leapResult = __testing.defaultStudentWindow(leapBase);
  assertEquals(leapResult.start, "2024-02-29");
  assertEquals(leapResult.end, "2025-02-28");
});

Deno.test("normalizeEmails lowercases and deduplicates entries in order", () => {
  const normalized = __testing.normalizeEmails([
    "  ALPHA@example.com  ",
    "alpha@example.com",
    "Beta@Example.com",
    "beta@example.com",
  ]);

  assertEquals(normalized, ["alpha@example.com", "beta@example.com"]);
});

Deno.test("processInviteMembers creates memberships and sends emails", async () => {
  const payload = createPayload({
    emails: ["alice@example.com", "bob@example.com"],
    role: "student",
    subscriptionStartDate: "2025-01-10",
    subscriptionEndDate: "2026-01-09",
  });

  const sent: string[] = [];
  const deps: ProcessDeps = {
    ...createDeps(),
    sendEmail: (job) => {
      sent.push(job.email);
      return Promise.resolve();
    },
  };

  const { result } = await __testing.processInviteMembers(
    { ...baseContext, startedAt: 50 },
    payload,
    [],
    deps,
  );

  assertEquals(result.emails_created, 2);
  assertEquals(result.emails_resend, 0);
  assertEquals(result.emails_failed, 0);
  assertEquals(result.emails_total, 2);
  assertEquals(sent.sort(), ["alice@example.com", "bob@example.com"]);
});

Deno.test("processInviteMembers counts failures without altering create counters", async () => {
  const payload = createPayload({
    emails: ["fail@example.com", "ok@example.com"],
  });

  const inserted: InsertRecord[] = [];

  const deps: ProcessDeps = {
    insertMemberships: (records: InsertRecord[], _requestId: string) => {
      inserted.push(...records);
      return Promise.resolve(records.map((record, index) => ({
        id: index + 1,
        academy_id: record.academy_id,
        email: record.email,
        role: record.role,
        status: record.status,
        subscription_start_date: record.subscription_start_date,
        subscription_end_date: record.subscription_end_date,
      })));
    },
    sendEmail: (job) => {
      if (job.email === "fail@example.com") {
        return Promise.reject(new Error("smtp down"));
      }
      return Promise.resolve();
    },
    now: () => 210,
  };

  const { result } = await __testing.processInviteMembers(
    { ...baseContext, startedAt: 5 },
    payload,
    [],
    deps,
  );

  assertEquals(inserted.map((record) => record.status), [
    "awaiting_login",
    "awaiting_login",
  ]);
  assertEquals(result.emails_total, 2);
  assertEquals(result.emails_created, 2);
  assertEquals(result.emails_resend, 0);
  assertEquals(result.emails_failed, 1);
  assert(result.failures && result.failures.length === 1);
  assertEquals(result.failures![0], {
    email: "fa***@example.com",
    reason: "smtp down",
  });
});

Deno.test("buildInviteMembersTemplate renders Phase 5 English copy", () => {
  const template = buildInviteMembersTemplate({
    academyName: "Academia Demo",
    role: "teacher",
    siteUrl: "https://example.com",
    subscriptionStartDate: "2025-01-01",
    subscriptionEndDate: "2025-02-01",
  });

  assertEquals(
    template.subject,
    "Your academy Academia Demo gave you access to Exameny",
  );
  assertEquals(template.ctaUrl, "https://example.com/auth");
  assertStringIncludes(template.html, "Access Exameny");
  assertStringIncludes(
    template.html,
    "Your academy Academia Demo gave you Exameny access as",
  );
  assertStringIncludes(
    template.html,
    "There is no unique link; the invitation remains available until you sign in.",
  );
  assertStringIncludes(
    template.text,
    "The invitation stays active until you sign in with this address.",
  );
  assertStringIncludes(
    template.text,
    "There is no unique link; just sign in when you are ready.",
  );
  assertStringIncludes(
    template.text,
    "Go to https://example.com/auth and sign in with Google.",
  );
  assertStringIncludes(
    template.text,
    "Need help? Reply to this email or contact your academy administrator.",
  );

  const resend = buildInviteMembersTemplate({
    academyName: "Academia Demo",
    role: "teacher",
    siteUrl: "https://example.com",
    isResend: true,
  });

  assertEquals(
    resend.subject,
    "Reminder: Your academy Academia Demo gave you access to Exameny",
  );
  assertStringIncludes(
    resend.html,
    "This reminder keeps the invitation active until you sign in with this email.",
  );
  assertStringIncludes(
    resend.text,
    "Academia Demo already granted you Exameny access as Teacher.",
  );
  assertStringIncludes(
    resend.text,
    "Go to https://example.com/auth and sign in with Google.",
  );
});

Deno.test("processInviteMembers resends emails without inserts", async () => {
  const payload = createPayload({
    emails: ["mentor@example.com"],
    role: "teacher",
    mode: "resend",
    subscriptionStartDate: null,
    subscriptionEndDate: null,
  });

  const existingMemberships = [
    buildMembership({
      email: "mentor@example.com",
      role: "teacher",
      status: "active",
      subscription_start_date: null,
      subscription_end_date: null,
    }),
  ];

  let insertsCalled = false;
  let sendCount = 0;

  const deps: ProcessDeps = {
    insertMemberships: (_records: InsertRecord[], _requestId: string) => {
      insertsCalled = true;
      return Promise.resolve([]);
    },
    sendEmail: () => {
      sendCount += 1;
      return Promise.resolve();
    },
    now: () => 120,
  };

  const { result } = await __testing.processInviteMembers(
    { ...baseContext, startedAt: 20 },
    payload,
    existingMemberships,
    deps,
  );

  assertEquals(insertsCalled, false);
  assertEquals(sendCount, 1);
  assertEquals(result.emails_created, 0);
  assertEquals(result.emails_resend, 1);
  assertEquals(result.emails_failed, 0);
});

Deno.test("processInviteMembers forwards requestId to insertMemberships", async () => {
  const payload = createPayload({
    emails: ["forward@example.com"],
    role: "student",
    subscriptionStartDate: "2025-02-01",
    subscriptionEndDate: "2026-02-01",
  });

  const received: Array<{ requestId: string; records: InsertRecord[] }> = [];

  const deps: ProcessDeps = {
    insertMemberships: (records: InsertRecord[], requestId: string) => {
      received.push({ requestId, records });
      return Promise.resolve(records.map((record, index) => ({
        id: index + 1,
        academy_id: record.academy_id,
        email: record.email,
        role: record.role,
        status: record.status,
        subscription_start_date: record.subscription_start_date,
        subscription_end_date: record.subscription_end_date,
      })));
    },
    sendEmail: () => Promise.resolve(),
    now: () => 33,
  };

  const { result } = await __testing.processInviteMembers(
    { ...baseContext, requestId: "req-forward", startedAt: 0 },
    payload,
    [],
    deps,
  );

  assertEquals(result.emails_created, 1);
  assertEquals(received.length, 1);
  assertEquals(received[0].requestId, "req-forward");
  assertEquals(received[0].records[0].subscription_start_date, "2025-02-01");
  assertEquals(received[0].records[0].subscription_end_date, "2026-02-01");
});

Deno.test("processInviteMembers flags resend jobs and preserves stored window", async () => {
  const payload = createPayload({
    emails: ["resend@example.com"],
    role: "student",
    mode: "resend",
    subscriptionStartDate: null,
    subscriptionEndDate: null,
  });

  const existingMemberships = [
    buildMembership({
      email: "resend@example.com",
      role: "student",
      subscription_start_date: "2025-06-01",
      subscription_end_date: "2026-05-31",
    }),
  ];

  const jobs: Array<
    { mode: string; start: string | null; end: string | null }
  > = [];

  const deps: ProcessDeps = {
    insertMemberships: (_records: InsertRecord[], _requestId: string) =>
      Promise.resolve([]),
    sendEmail: (job) => {
      jobs.push({
        mode: job.mode,
        start: job.subscriptionStartDate ?? null,
        end: job.subscriptionEndDate ?? null,
      });
      return Promise.resolve();
    },
    now: () => 111,
  };

  const { result } = await __testing.processInviteMembers(
    { ...baseContext, startedAt: 10 },
    payload,
    existingMemberships,
    deps,
  );

  assertEquals(result.emails_created, 0);
  assertEquals(result.emails_resend, 1);
  assertEquals(jobs.length, 1);
  assertEquals(jobs[0].mode, "resend");
  assertEquals(jobs[0].start, "2025-06-01");
  assertEquals(jobs[0].end, "2026-05-31");
});

Deno.test("processInviteMembers persists subscription window for student invitations", async () => {
  const payload = createPayload({
    emails: ["learner@example.com"],
    subscriptionStartDate: "2025-03-10",
    subscriptionEndDate: "2026-03-09",
  });

  const inserted: InsertRecord[] = [];
  const emailJobs: Array<{ start: string | null; end: string | null }> = [];

  const deps: ProcessDeps = {
    insertMemberships: (records: InsertRecord[], _requestId: string) => {
      inserted.push(...records);
      return Promise.resolve(records.map((record, index) => ({
        id: index + 1,
        academy_id: record.academy_id,
        email: record.email,
        role: record.role,
        status: record.status,
        subscription_start_date: record.subscription_start_date,
        subscription_end_date: record.subscription_end_date,
      })));
    },
    sendEmail: (job) => {
      emailJobs.push({
        start: job.subscriptionStartDate ?? null,
        end: job.subscriptionEndDate ?? null,
      });
      return Promise.resolve();
    },
    now: () => 75,
  };

  await __testing.processInviteMembers(
    { ...baseContext, startedAt: 10 },
    payload,
    [],
    deps,
  );

  assertEquals(inserted.length, 1);
  assertEquals(inserted[0], {
    academy_id: baseContext.academyId,
    email: "learner@example.com",
    role: "student",
    status: "awaiting_login",
    subscription_start_date: "2025-03-10",
    subscription_end_date: "2026-03-09",
  });

  assertEquals(emailJobs.length, 1);
  const firstJob = emailJobs[0];
  assertEquals(firstJob.start, "2025-03-10");
  assertEquals(firstJob.end, "2026-03-09");
});

Deno.test("processInviteMembers propagates stored subscription window on resend", async () => {
  const payload = createPayload({
    emails: ["student@example.com"],
    mode: "resend",
    subscriptionStartDate: null,
    subscriptionEndDate: null,
  });

  const existingMemberships = [
    buildMembership({
      email: "student@example.com",
      role: "student",
      status: "awaiting_login",
      subscription_start_date: "2025-04-01",
      subscription_end_date: "2025-12-31",
    }),
  ];

  let capturedWindow: { start: string | null; end: string | null } | null =
    null;

  const deps: ProcessDeps = {
    insertMemberships: (_records: InsertRecord[], _requestId: string) =>
      Promise.resolve([]),
    sendEmail: (job) => {
      capturedWindow = {
        start: job.subscriptionStartDate ?? null,
        end: job.subscriptionEndDate ?? null,
      };
      return Promise.resolve();
    },
    now: () => 90,
  };

  const { result } = await __testing.processInviteMembers(
    { ...baseContext, startedAt: 40 },
    payload,
    existingMemberships,
    deps,
  );

  assertEquals(result.emails_resend, 1);
  const window = capturedWindow!;
  assertEquals(window.start, "2025-04-01");
  assertEquals(window.end, "2025-12-31");
});

Deno.test("processInviteMembers throws ROLE_CONFLICT when roles mismatch", async () => {
  const payload = createPayload({
    role: "student",
  });
  const memberships = [
    buildMembership({
      role: "teacher",
      email: "user@example.com",
      academy_id: 99,
    }),
  ];

  try {
    await __testing.processInviteMembers(
      baseContext,
      payload,
      memberships,
      createDeps(),
    );
    assert(false, "Expected ROLE_CONFLICT to be thrown");
  } catch (error) {
    if (!(error instanceof HttpError)) {
      throw error;
    }
    const expectedMessage =
      "This email is already linked to teacher. Use a different account to invite them as student.";
    assertEquals(error.message, expectedMessage);
    const details = error.details as {
      current_role?: string;
      requested_role?: string;
    } | undefined;
    assertEquals(details?.current_role, "teacher");
    assertEquals(details?.requested_role, "student");
  }
});

Deno.test("processInviteMembers blocks downgrading academy admins to other roles", async () => {
  const payload = createPayload({
    role: "teacher",
  });
  const memberships = [
    buildMembership({ role: "academy_admin", status: "active" }),
  ];

  await assertRejects(
    () =>
      __testing.processInviteMembers(
        baseContext,
        payload,
        memberships,
        createDeps(),
      ),
    HttpError,
    "This email is already linked to academy_admin. Use a different account to invite them as teacher.",
  );
});

Deno.test("processInviteMembers blocks duplicate invitations in same academy", async () => {
  const payload = createPayload({ role: "teacher" });
  const memberships = [
    buildMembership({ role: "teacher", status: "inactive" }),
  ];

  await assertRejects(
    () =>
      __testing.processInviteMembers(
        baseContext,
        payload,
        memberships,
        createDeps(),
      ),
    HttpError,
    __testing.INVITATION_ALREADY_EXISTS_COPY,
  );
});

Deno.test("processInviteMembers does not insert when invitation already exists", async () => {
  const payload = createPayload({ role: "teacher" });
  const memberships = [
    buildMembership({ role: "teacher", status: "inactive" }),
  ];

  let insertsCalled = false;
  const deps: ProcessDeps = {
    insertMemberships: (_records: InsertRecord[], _requestId: string) => {
      insertsCalled = true;
      return Promise.resolve([]);
    },
    sendEmail: () => Promise.resolve(),
    now: () => 0,
  };

  await assertRejects(
    () =>
      __testing.processInviteMembers(baseContext, payload, memberships, deps),
    HttpError,
    __testing.INVITATION_ALREADY_EXISTS_COPY,
  );

  assertEquals(insertsCalled, false);
});

Deno.test("processInviteMembers requires membership when resending", async () => {
  const payload = createPayload({
    mode: "resend",
    role: "teacher",
    subscriptionStartDate: null,
    subscriptionEndDate: null,
  });

  await assertRejects(
    () =>
      __testing.processInviteMembers(baseContext, payload, [], createDeps()),
    HttpError,
    __testing.MEMBERSHIP_NOT_FOUND_COPY,
  );
});

Deno.test("processInviteMembers records English fallback message when email send fails unexpectedly", async () => {
  const payload = createPayload({
    emails: ["alias+fail@example.com"],
  });

  const deps: ProcessDeps = {
    ...createDeps(),
    sendEmail: () => Promise.reject("smtp unreachable"),
  };

  const { result } = await __testing.processInviteMembers(
    baseContext,
    payload,
    [],
    deps,
  );

  assertEquals(result.emails_failed, 1);
  assert(result.failures && result.failures.length === 1);
  assertEquals(result.failures![0], {
    email: "al***@example.com",
    reason: "Failed to send the email.",
  });
});

Deno.test("validateSubscriptionWindow enforces student-only fields", () => {
  assertThrows(
    () =>
      __testing.validateSubscriptionWindow(
        "teacher",
        "create",
        "2025-01-01",
        null,
      ),
    HttpError,
    "Subscription dates are only available when inviting students.",
  );

  assertThrows(
    () =>
      __testing.validateSubscriptionWindow(
        "student",
        "create",
        "2025-02-01",
        "2025-01-01",
      ),
    HttpError,
    "Subscription start date must be earlier than or equal to the end date.",
  );

  assertThrows(
    () =>
      __testing.validateSubscriptionWindow(
        "student",
        "resend",
        "2025-01-01",
        null,
      ),
    HttpError,
    "Cannot edit subscription dates while resending invites.",
  );
});

Deno.test("handleInviteMembers emits invite_members_called telemetry", async () => {
  const events: Array<Parameters<HandlerDeps["emitInviteMembersCalled"]>[0]> =
    [];
  const deps = buildHandlerDeps({
    processInviteMembers: (() =>
      Promise.resolve({
        result: {
          request_id: "req-metrics",
          emails_total: 2,
          emails_created: 2,
          emails_resend: 0,
          emails_failed: 1,
        },
        durationMs: 37,
      })) as HandlerDeps["processInviteMembers"],
    emitInviteMembersCalled:
      ((payload: Parameters<HandlerDeps["emitInviteMembersCalled"]>[0]) => {
        events.push(payload);
        return Promise.resolve();
      }) as HandlerDeps["emitInviteMembersCalled"],
    fetchMembershipRows: (() =>
      Promise.resolve([])) as HandlerDeps["fetchMembershipRows"],
    insertMembershipRows: ((records: InsertRecord[], _requestId: string) =>
      Promise.resolve(records.map((record, index) => ({
        id: index + 1,
        academy_id: record.academy_id,
        email: record.email,
        role: record.role,
        status: record.status,
        subscription_start_date: record.subscription_start_date,
        subscription_end_date: record.subscription_end_date,
      })))) as HandlerDeps["insertMembershipRows"],
  });

  const request = new Request("https://edge.test/invite-members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      emails: ["alpha@example.com", "beta@example.com"],
      role: "student",
      mode: "create",
      subscriptionStartDate: "2025-01-01",
      subscriptionEndDate: "2025-06-01",
    }),
  });

  const response = await __testing.handleInviteMembers(request, deps);
  assertEquals(response.status, 200);
  assertEquals(events.length, 1);
  assertEquals(events[0], {
    request_id: "req-metrics",
    admin_user_id: "admin-1",
    academy_id: 101,
    emails_total: 2,
    emails_created: 2,
    emails_resend: 0,
    emails_failed: 1,
    duration_ms: 37,
  });
});

Deno.test("handleInviteMembers surfaces English fallback on unexpected errors", async () => {
  const deps = buildHandlerDeps({
    processInviteMembers: (() =>
      Promise.reject(new Error("smtp down"))) as HandlerDeps[
        "processInviteMembers"
      ],
    fetchMembershipRows: (() =>
      Promise.resolve([])) as HandlerDeps["fetchMembershipRows"],
  });

  const request = new Request("https://edge.test/invite-members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emails: ["fail@example.com"],
      role: "student",
      mode: "create",
      subscriptionStartDate: "2025-01-01",
      subscriptionEndDate: "2025-12-31",
    }),
  });

  const response = await __testing.handleInviteMembers(request, deps);
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(
    body.error,
    "We encountered an internal error while processing the invitations.",
  );
});

Deno.test("buildInviteMetricsSnapshot handles null payload", () => {
  const snapshot = __testing.buildInviteMetricsSnapshot("req-null", null);
  assertEquals(snapshot, {
    request_id: "req-null",
    emails_total: 0,
    emails_created: 0,
    emails_resend: 0,
    emails_failed: 0,
  });
});

Deno.test("buildInviteMetricsSnapshot derives counters from payload", () => {
  const createSnapshot = __testing.buildInviteMetricsSnapshot(
    "req-create",
    createPayload({
      emails: ["a@example.com", "b@example.com"],
      mode: "create",
    }),
  );

  assertEquals(createSnapshot, {
    request_id: "req-create",
    emails_total: 2,
    emails_created: 0,
    emails_resend: 0,
    emails_failed: 0,
  });

  const resendSnapshot = __testing.buildInviteMetricsSnapshot(
    "req-resend",
    createPayload({
      emails: ["a@example.com"],
      mode: "resend",
    }),
  );

  assertEquals(resendSnapshot, {
    request_id: "req-resend",
    emails_total: 1,
    emails_created: 0,
    emails_resend: 0,
    emails_failed: 0,
  });

  const overrideSnapshot = __testing.buildInviteMetricsSnapshot(
    "req-override",
    createPayload({
      emails: ["c@example.com"],
      mode: "create",
    }),
    { emails_created: 1, emails_failed: 1 },
  );

  assertEquals(overrideSnapshot, {
    request_id: "req-override",
    emails_total: 1,
    emails_created: 1,
    emails_resend: 0,
    emails_failed: 1,
  });
});

Deno.test("handleInviteMembers includes metrics when payload parsing fails", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });

  const response = await __testing.handleInviteMembers(
    request,
    buildHandlerDeps({
      processInviteMembers: () =>
        Promise.reject(new Error("should not be called")),
    }),
  );

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.request_id, "req-metrics");
  assertEquals(body.emails_total, 0);
  assertEquals(body.emails_created, 0);
  assertEquals(body.emails_resend, 0);
  assertEquals(body.emails_failed, 0);
});

Deno.test("handleInviteMembers includes metrics for HttpError thrown after parsing", async () => {
  const requestBody = JSON.stringify({
    emails: ["user@example.com"],
    role: "teacher",
    mode: "create",
  });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  const deps = buildHandlerDeps({
    processInviteMembers: () =>
      Promise.reject(
        new HttpError(409, "ROLE_CONFLICT", { code: "ROLE_CONFLICT" }),
      ),
  });

  const response = await __testing.handleInviteMembers(request, deps);
  assertEquals(response.status, 409);
  const body = await response.json();
  assertEquals(body.request_id, "req-metrics");
  assertEquals(body.emails_total, 1);
  assertEquals(body.emails_created, 0);
  assertEquals(body.emails_resend, 0);
  assertEquals(body.emails_failed, 0);
  assertEquals(body.code, "ROLE_CONFLICT");
});

Deno.test("handleInviteMembers returns metrics snapshot for non-POST requests", async () => {
  const request = new Request("https://example.com", { method: "GET" });

  const response = await __testing.handleInviteMembers(
    request,
    buildHandlerDeps(),
  );
  assertEquals(response.status, 405);
  const body = await response.json();
  assertEquals(body.request_id, "req-metrics");
  assertEquals(body.emails_total, 0);
  assertEquals(body.emails_created, 0);
  assertEquals(body.emails_resend, 0);
  assertEquals(body.emails_failed, 0);
  assertEquals(body.error, "Method not allowed");
});

Deno.test("handleInviteMembers returns manual intervention payload when RPC raises MANUAL_INTERVENTION_REQUIRED", async () => {
  const requestBody = JSON.stringify({
    emails: ["manual@example.com"],
    role: "teacher",
    mode: "create",
  });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  const response = await __testing.handleInviteMembers(
    request,
    buildHandlerDeps({
      processInviteMembers: () =>
        Promise.reject({
          message: "MANUAL_INTERVENTION_REQUIRED",
          details:
            '{"code":"MANUAL_INTERVENTION_REQUIRED","instructions":["review membership"]}',
        }),
    }),
  );

  assertEquals(response.status, 409);
  const body = await response.json();
  assertEquals(body.request_id, "req-metrics");
  assertEquals(body.code, "MANUAL_INTERVENTION_REQUIRED");
  assertEquals(body.instructions, ["review membership"]);
  assertEquals(body.emails_total, 1);
  assertEquals(body.emails_created, 0);
  assertEquals(body.emails_resend, 0);
  assertEquals(body.emails_failed, 0);
});

Deno.test("handleInviteMembers requires academy_id when platform admin lacks active academy", async () => {
  const requestBody = JSON.stringify({
    emails: ["platform@example.com"],
    role: "teacher",
    mode: "create",
  });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  const response = await __testing.handleInviteMembers(
    request,
    buildHandlerDeps(
      {
        processInviteMembers:
          (() => Promise.reject(new Error("should not run"))) as HandlerDeps[
            "processInviteMembers"
          ],
      },
      {
        profile: {
          academy_id: null,
          role: "platform_owner",
          platform_role: "platform_owner",
        },
      },
      { actorAcademyId: null, actorIsPlatformAdmin: true },
    ),
  );

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.code, "ACADEMY_ID_REQUIRED");
});

Deno.test("handleInviteMembers allows platform admins without active academies to target arbitrary academies", async () => {
  const requestBody = JSON.stringify({
    emails: ["platform@example.com"],
    role: "teacher",
    mode: "create",
    academy_id: 909,
  });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  let fetchedAcademyId: number | null = null;
  const response = await __testing.handleInviteMembers(
    request,
    buildHandlerDeps(
      {
        fetchAcademyName: ((academyId: number) => {
          fetchedAcademyId = academyId;
          return Promise.resolve("Academia Plataforma");
        }) as HandlerDeps["fetchAcademyName"],
        processInviteMembers: ((
          context: ProcessContext,
          _payload: InviteMembersPayload,
          _rows: MembershipRow[],
          _deps: ProcessDeps,
        ) => {
          assertEquals(context.academyId, 909);
          return Promise.resolve({
            result: {
              request_id: "req-metrics",
              emails_total: 1,
              emails_created: 1,
              emails_resend: 0,
              emails_failed: 0,
            },
            durationMs: 12,
          });
        }) as HandlerDeps["processInviteMembers"],
      },
      {
        profile: {
          academy_id: null,
          role: "super_admin",
          platform_role: "super_admin",
        },
      },
      { actorAcademyId: null, actorIsPlatformAdmin: true },
    ),
  );

  assertEquals(fetchedAcademyId, 909);
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.request_id, "req-metrics");
  assertEquals(body.emails_created, 1);
});

Deno.test("handleInviteMembers normalizes and deduplicates emails before processing", async () => {
  const captured: string[][] = [];

  const deps = buildHandlerDeps({
    processInviteMembers: ((
      _context: ProcessContext,
      payload: InviteMembersPayload,
      _rows: MembershipRow[],
      _deps: ProcessDeps,
    ) => {
      captured.push(payload.emails);
      assertEquals(payload.emails, ["alpha@example.com", "beta@example.com"]);
      assertEquals(payload.mode, "create");
      assertEquals(payload.role, "student");
      return Promise.resolve({
        result: {
          request_id: "req-metrics",
          emails_total: payload.emails.length,
          emails_created: payload.emails.length,
          emails_resend: 0,
          emails_failed: 0,
        },
        durationMs: 8,
      });
    }) as HandlerDeps["processInviteMembers"],
  });

  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emails: [" ALPHA@example.com ", "alpha@example.com", "beta@Example.com"],
      role: "student",
      mode: "create",
      subscriptionStartDate: "2025-01-01",
      subscriptionEndDate: "2025-02-01",
    }),
  });

  const response = await __testing.handleInviteMembers(request, deps);
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.emails_total, 2);
  assertEquals(body.emails_created, 2);
  assertEquals(body.emails_resend, 0);
  assertEquals(body.emails_failed, 0);
  assertEquals(captured[0], ["alpha@example.com", "beta@example.com"]);
});

Deno.test("handleInviteMembers lets platform admins with active membership invite other academies", async () => {
  const requestBody = JSON.stringify({
    emails: ["platform-mixed@example.com"],
    role: "teacher",
    mode: "create",
    academy_id: 303,
  });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  const response = await __testing.handleInviteMembers(
    request,
    buildHandlerDeps(
      {
        processInviteMembers: ((
          context: ProcessContext,
          _payload: InviteMembersPayload,
          _rows: MembershipRow[],
          _deps: ProcessDeps,
        ) => {
          assertEquals(context.academyId, 303);
          return Promise.resolve({
            result: {
              request_id: "req-metrics",
              emails_total: 1,
              emails_created: 1,
              emails_resend: 0,
              emails_failed: 0,
            },
            durationMs: 20,
          });
        }) as HandlerDeps["processInviteMembers"],
      },
      {
        profile: {
          academy_id: 101,
          role: "academy_admin",
          platform_role: "platform_owner",
        },
      },
      { actorAcademyId: 101, actorIsPlatformAdmin: true },
    ),
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.emails_created, 1);
});

Deno.test("handleInviteMembers rejects academy_id mismatches for scoped admins", async () => {
  const requestBody = JSON.stringify({
    emails: ["scope@example.com"],
    role: "teacher",
    mode: "create",
    academy_id: 202,
  });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  const response = await __testing.handleInviteMembers(
    request,
    buildHandlerDeps({
      processInviteMembers: (() =>
        Promise.reject(new Error("should not run"))) as HandlerDeps[
          "processInviteMembers"
        ],
    }),
  );

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.code, "ACADEMY_SCOPE_MISMATCH");
});

Deno.test("translateDuplicateInviteError maps constraint violations to INVITATION_ALREADY_EXISTS", async () => {
  const error = {
    code: "23505",
    message:
      'duplicate key value violates unique constraint "academy_memberships_academy_email_key"',
    details:
      "Key (academy_id, email)=(42, teacher@example.com) already exists.",
  };
  const records: InsertRecord[] = [{
    academy_id: 42,
    email: "teacher@example.com",
    role: "teacher",
    status: "awaiting_login",
    subscription_start_date: null,
    subscription_end_date: null,
  }];
  const result = await __testing.translateDuplicateInviteError(error, records, {
    fetchMemberships: () =>
      Promise.resolve([{
        id: 77,
        academy_id: 42,
        email: "teacher@example.com",
        role: "teacher",
        status: "inactive",
        subscription_start_date: null,
        subscription_end_date: null,
      }]),
  });

  assert(result instanceof HttpError);
  assertEquals(result.status, 409);
  assertEquals(result.message, __testing.INVITATION_ALREADY_EXISTS_COPY);
  assertEquals(result.details, {
    code: "INVITATION_ALREADY_EXISTS",
    membership_id: 77,
    status: "inactive",
    email: "teacher@example.com",
    role: "teacher",
    subscription_start_date: null,
    subscription_end_date: null,
  });
});

Deno.test("translateDuplicateInviteError returns null for non-duplicate errors", async () => {
  const records: InsertRecord[] = [{
    academy_id: 10,
    email: "new@example.com",
    role: "student",
    status: "awaiting_login",
    subscription_start_date: null,
    subscription_end_date: null,
  }];

  const result = await __testing.translateDuplicateInviteError(
    { message: "OTHER_ERROR" },
    records,
    { fetchMemberships: () => Promise.resolve([]) },
  );

  assertEquals(result, null);
});
