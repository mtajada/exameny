import {
  assert,
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "std/testing/asserts.ts";

import { HttpError } from "../_shared/http-errors.ts";
import type { AuthContext } from "../_shared/auth.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJsonRecord = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  const payload = await response.json();
  if (!isPlainRecord(payload)) {
    throw new Error("Expected JSON payload to be an object");
  }
  return payload;
};

type RpcError = { message?: string; code?: string; details?: string };

const buildSingle = (data: unknown, error: RpcError | null = null) => ({
  single: <R>() => Promise.resolve({ data: data as R, error }),
});

Deno.env.set("SUPABASE_URL", "https://example.supabase.test");
Deno.env.set("EXAMENY_SUPABASE_PUBLISHABLE_KEY", "anon-key");
Deno.env.set("EXAMENY_SUPABASE_SECRET_KEY", "service-role-key");
Deno.env.set("ALLOWED_ORIGINS", "http://localhost:5173");

const { resolveAdminActorContext } = await import("../_shared/admin-auth.ts");
const {
  processRoleMigrationResult,
  handleMembershipRoleRpcError,
  createHandler,
  parseInput,
} = (await import("../admin-membership-role/index.ts")).__testing;

type MinimalAuthContext = Parameters<typeof resolveAdminActorContext>[0];
type MembershipHandlerDeps =
  NonNullable<Parameters<typeof createHandler>[0]> extends Partial<infer T> ? T
    : never;
type ProcessFn = typeof processRoleMigrationResult;
type ProcessArgs = Parameters<ProcessFn>;
type ServiceRoleClient = ReturnType<
  MembershipHandlerDeps["getServiceRoleClient"]
>;

const buildServiceRoleClient = (
  rpcHandler: (fn: string, args?: Record<string, unknown>) => {
    single: <T>() => Promise<{ data: T | null; error: RpcError | null }>;
  },
): ServiceRoleClient => ({
  rpc: rpcHandler,
} as ServiceRoleClient);

const buildUser = (
  overrides?: Partial<AuthContext["user"]>,
): AuthContext["user"] => ({
  id: "admin-user",
  aud: "authenticated",
  created_at: new Date().toISOString(),
  app_metadata: { active_academy_id: 10 },
  user_metadata: {},
  ...overrides,
});

const buildAuthContext = (overrides?: Partial<AuthContext>): AuthContext => ({
  user: {
    ...buildUser(),
  },
  profile: {
    id: "admin-user",
    email: "admin@example.com",
    role: "academy_admin",
    academy_id: 10,
    membership_id: 1,
    full_name: "Admin User",
    platform_role: null,
  },
  supabase: {} as AuthContext["supabase"],
  authorization: "Bearer test-token",
  ...(overrides ?? {}),
});

const stubAuthenticateAdminRequest = (
  overrides?: Partial<AuthContext>,
): MembershipHandlerDeps["authenticateAdminRequest"] =>
  (() => Promise.resolve(buildAuthContext(overrides))) as MembershipHandlerDeps[
    "authenticateAdminRequest"
  ];

const buildMembershipRoleRequest = (
  body: Record<string, unknown>,
  requestId = crypto.randomUUID(),
): Request =>
  new Request("https://example.supabase.test/admin-membership-role", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost:5173",
      "x-request-id": requestId,
      authorization: "Bearer stub",
    },
    body: JSON.stringify(body),
  });

const baseNormalizedResult = {
  membership_id: 99,
  academy_id: 10,
  old_role: "student",
  new_role: "teacher",
  cleaned_records: { reassigned: true },
  metadata_payload: { app_metadata: { active_role: "teacher" } },
  should_refresh_session: false,
  request_id: "11111111-1111-4111-8111-111111111111",
};

Deno.test("parseInput rejects academy_admin as the target role", () => {
  const err = assertThrows(
    () =>
      parseInput({ membership_id: 1, new_role: "academy_admin", reason: null }),
    HttpError,
    'new_role must be "student" or "teacher".',
  );
  assertEquals(err.status, 400);
});

Deno.test("processRoleMigrationResult applies metadata for the target member before emitting the event", async () => {
  const raw = {
    membership_id: 42,
    academy_id: 10,
    old_role: "teacher",
    new_role: "student",
    cleaned_records: { teacher_assignments_cleared: 1 },
    metadata_payload: { app_metadata: { key: "value" } },
    should_refresh_session: true,
    request_id: "33333333-3333-4333-8333-333333333333",
  };

  const targetUserId = "member-123";
  const callOrder: string[] = [];
  const metadataPayloads: unknown[] = [];
  const eventPayloads: unknown[] = [];
  const metadataTargets: string[] = [];

  const result = await processRoleMigrationResult(
    raw,
    {
      requestId: "33333333-3333-4333-8333-333333333333",
      userId: "admin-user",
      actorAcademyId: 10,
      startedAt: 100,
      targetUserId,
    },
    {
      applyMetadata: (userId, payload) => {
        metadataTargets.push(userId);
        callOrder.push("metadata");
        metadataPayloads.push(payload);
        return Promise.resolve();
      },
      emitEvent: (payload) => {
        callOrder.push("event");
        eventPayloads.push(payload);
        return Promise.resolve();
      },
      now: () => 150,
    },
  );

  assertEquals(callOrder, ["metadata", "event"]);
  assertEquals(metadataTargets, [targetUserId]);
  assertEquals(metadataPayloads.length, 1);
  assertStrictEquals(metadataPayloads[0], raw.metadata_payload);
  assertEquals(eventPayloads.length, 1);
  if (!isPlainRecord(eventPayloads[0])) {
    throw new Error("Expected event payload to be an object");
  }
  const eventPayload = eventPayloads[0];
  assertEquals(eventPayload.request_id, "33333333-3333-4333-8333-333333333333");
  assertEquals(result.request_id, "33333333-3333-4333-8333-333333333333");
  assertEquals(result.should_refresh_session, true);
});

Deno.test("processRoleMigrationResult uses resolveTargetUserId when context omits the target", async () => {
  const raw = {
    membership_id: 55,
    academy_id: 9,
    old_role: "student",
    new_role: "teacher",
    cleaned_records: {},
    metadata_payload: { app_metadata: { role: "teacher" } },
    should_refresh_session: true,
    request_id: "44444444-4444-4444-8444-444444444444",
  };

  const resolvedTargets: string[] = [];

  const result = await processRoleMigrationResult(
    raw,
    {
      requestId: "44444444-4444-4444-8444-444444444444",
      userId: "admin",
      actorAcademyId: 9,
      startedAt: 10,
      targetUserId: null,
    },
    {
      resolveTargetUserId: (membershipId) => {
        resolvedTargets.push(`membership-${membershipId}`);
        return Promise.resolve("resolved-user");
      },
      applyMetadata: (userId, _payload) => {
        resolvedTargets.push(userId);
        return Promise.resolve();
      },
      emitEvent: (_payload) => Promise.resolve(),
      now: () => 20,
    },
  );

  assertEquals(resolvedTargets, ["membership-55", "resolved-user"]);
  assertEquals(result.membership_id, 55);
});

Deno.test("processRoleMigrationResult resolves and syncs metadata even when should_refresh_session is false", async () => {
  const raw = {
    membership_id: 77,
    academy_id: 3,
    old_role: "student",
    new_role: "teacher",
    cleaned_records: {},
    metadata_payload: { app_metadata: { active_role: "teacher" } },
    should_refresh_session: false,
    request_id: "55555555-5555-4555-8555-555555555555",
  };

  const calls: string[] = [];

  await processRoleMigrationResult(
    raw,
    {
      requestId: "55555555-5555-4555-8555-555555555555",
      userId: "admin",
      actorAcademyId: 3,
      startedAt: 0,
      targetUserId: null,
    },
    {
      resolveTargetUserId: (membershipId) => {
        calls.push(`lookup-${membershipId}`);
        return Promise.resolve("resolved-user");
      },
      applyMetadata: (userId, _payload) => {
        calls.push(`sync-${userId}`);
        return Promise.resolve();
      },
      emitEvent: (_payload) => Promise.resolve(),
      now: () => 10,
    },
  );

  assertEquals(calls, ["lookup-77", "sync-resolved-user"]);
});

Deno.test("handleMembershipRoleRpcError returns 403 for ACTOR_CONTEXT_REQUIRED", () => {
  const error = assertThrows(
    () =>
      handleMembershipRoleRpcError(
        { message: "ACTOR_CONTEXT_REQUIRED" },
        { requestId: "req-ctx" },
      ),
    HttpError,
  );

  assertEquals(error.status, 403);
});

Deno.test("handleMembershipRoleRpcError surfaces alias guidance for MEMBERSHIP_OWNERSHIP_CONFLICT", () => {
  const error = assertThrows(
    () =>
      handleMembershipRoleRpcError(
        {
          message: "MEMBERSHIP_OWNERSHIP_CONFLICT",
          details:
            "membership_id=88 email_login=alias@example.com email_membership=member@example.com",
        },
        { requestId: "req-alias" },
      ),
    HttpError,
  );

  assertEquals(error.status, 409);
  assertEquals(
    error.message,
    "We detected an email mismatch for this membership. Resolve the alias conflict before trying again.",
  );
  const details = isPlainRecord(error.details) ? error.details : null;
  assert(details);
  assertEquals(details.code, "MEMBERSHIP_OWNERSHIP_CONFLICT");
  assertEquals(details.request_id, "req-alias");
  assertEquals(details.alias_conflict, {
    membership_id: 88,
    user_id: null,
    email_login: "alias@example.com",
    email_membership: "member@example.com",
  });
});

Deno.test("resolveAdminActorContext allows platform admins without academy", () => {
  const fakeContext = {
    user: { id: "user-platform" },
    profile: {
      id: "user-platform",
      email: "owner@example.com",
      role: "platform_owner",
      academy_id: null,
      membership_id: null,
      full_name: null,
      platform_role: "platform_owner",
    },
    supabase: {} as MinimalAuthContext["supabase"],
    authorization: "Bearer test",
  } as MinimalAuthContext;

  const actor = resolveAdminActorContext(fakeContext);
  assertEquals(actor.actorAcademyId, null);
  assertEquals(actor.actorIsPlatformAdmin, true);
});

Deno.test("handler returns normalized payload and propagates request id on success", async () => {
  const membershipLookups: number[] = [];
  const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdminRequest(),
    getServiceRoleClient: () =>
      buildServiceRoleClient((fn, args) => {
        rpcCalls.push({ fn, args });
        return buildSingle({
          membership_id: baseNormalizedResult.membership_id,
          academy_id: baseNormalizedResult.academy_id,
          old_role: baseNormalizedResult.old_role,
          new_role: baseNormalizedResult.new_role,
          cleaned_records: baseNormalizedResult.cleaned_records,
          metadata_payload: baseNormalizedResult.metadata_payload,
          should_refresh_session: baseNormalizedResult.should_refresh_session,
          request_id: baseNormalizedResult.request_id,
        });
      }),
    processRoleMigrationResult: ((
      payload: ProcessArgs[0],
      context: ProcessArgs[1],
      deps?: ProcessArgs[2],
    ) => {
      assertEquals(payload.membership_id, baseNormalizedResult.membership_id);
      assertEquals(context.requestId, "11111111-1111-4111-8111-111111111111");
      if (deps?.resolveTargetUserId) {
        deps.resolveTargetUserId(payload.membership_id as number);
      }
      return Promise.resolve(baseNormalizedResult);
    }) as ProcessFn,
    getMembershipOwnerUserId: ((membershipId: number) => {
      membershipLookups.push(membershipId);
      return Promise.resolve("member-target");
    }) as MembershipHandlerDeps["getMembershipOwnerUserId"],
  });

  const req = buildMembershipRoleRequest({
    membership_id: 99,
    new_role: "teacher",
  }, "11111111-1111-4111-8111-111111111111");
  const res = await handler(req);
  const body = await readJsonRecord(res);

  assertEquals(res.status, 200);
  assertEquals(body.request_id, baseNormalizedResult.request_id);
  assertEquals(body.membership_id, baseNormalizedResult.membership_id);
  assertEquals(body.metadata_payload, baseNormalizedResult.metadata_payload);
  assertEquals(body.should_refresh_session, false);
  assertEquals(membershipLookups, [baseNormalizedResult.membership_id]);
  assertEquals(rpcCalls[0]?.fn, "migrate_membership_role");
  assertEquals(
    rpcCalls[0]?.args?.p_request_id,
    "11111111-1111-4111-8111-111111111111",
  );
});

Deno.test("handler returns manual intervention response when RPC reports MANUAL_INTERVENTION_REQUIRED", async () => {
  let processorCalled = false;

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdminRequest(),
    getServiceRoleClient: () =>
      buildServiceRoleClient(() =>
        buildSingle(null, {
          message: "MANUAL_INTERVENTION_REQUIRED",
          details:
            '{"code":"MANUAL_INTERVENTION_REQUIRED","instructions":["review membership"]}',
        })
      ),
    processRoleMigrationResult: ((..._args: ProcessArgs) => {
      processorCalled = true;
      throw new Error("processRoleMigrationResult should not run");
    }) as ProcessFn,
    getMembershipOwnerUserId: ((_: number) =>
      Promise.resolve("member-target")) as MembershipHandlerDeps[
        "getMembershipOwnerUserId"
      ],
  });

  const reqId = "22222222-2222-4222-8222-222222222222";
  const res = await handler(
    buildMembershipRoleRequest(
      { membership_id: 10, new_role: "student" },
      reqId,
    ),
  );
  const body = await readJsonRecord(res);

  assertEquals(res.status, 409);
  assertEquals(body.request_id, reqId);
  assertEquals(body.code, "MANUAL_INTERVENTION_REQUIRED");
  assertEquals(body.instructions, ["review membership"]);
  assert(processorCalled === false);
});

Deno.test("handler maps ROLE_SCOPE_CONFLICT errors to HTTP 403 responses", async () => {
  let processorCalled = false;

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdminRequest(),
    getServiceRoleClient: () =>
      buildServiceRoleClient(() =>
        buildSingle(null, { message: "ROLE_SCOPE_CONFLICT" })
      ),
    processRoleMigrationResult: ((..._args: ProcessArgs) => {
      processorCalled = true;
      throw new Error("processRoleMigrationResult should not run");
    }) as ProcessFn,
    getMembershipOwnerUserId: ((_: number) =>
      Promise.resolve("member-target")) as MembershipHandlerDeps[
        "getMembershipOwnerUserId"
      ],
  });

  const res = await handler(
    buildMembershipRoleRequest({ membership_id: 15, new_role: "student" }),
  );
  const body = await readJsonRecord(res);

  assertEquals(res.status, 403);
  assertEquals(body.code, "ROLE_SCOPE_CONFLICT");
  assert(processorCalled === false);
});

Deno.test("handler prevents academy_admin downgrades reported via ROLE_IMMUTABLE", async () => {
  let processorCalled = false;

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdminRequest(),
    getServiceRoleClient: () =>
      buildServiceRoleClient(() =>
        buildSingle(null, { message: "ROLE_IMMUTABLE" })
      ),
    processRoleMigrationResult: ((..._args: ProcessArgs) => {
      processorCalled = true;
      throw new Error("processRoleMigrationResult should not run");
    }) as ProcessFn,
    getMembershipOwnerUserId: ((_: number) =>
      Promise.resolve("member-target")) as MembershipHandlerDeps[
        "getMembershipOwnerUserId"
      ],
  });

  const res = await handler(
    buildMembershipRoleRequest({ membership_id: 25, new_role: "student" }),
  );
  const body = await readJsonRecord(res);

  assertEquals(res.status, 409);
  assertEquals(body.error, "Administrator roles require a dedicated account.");
  assertEquals(body.code, "ROLE_IMMUTABLE");
  assert(processorCalled === false);
});

Deno.test("handler prevents cross-academy admin migrations reported via ROLE_IMMUTABLE_CROSS_ACADEMY", async () => {
  let processorCalled = false;

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdminRequest(),
    getServiceRoleClient: () =>
      buildServiceRoleClient(() =>
        buildSingle(null, { message: "ROLE_IMMUTABLE_CROSS_ACADEMY" })
      ),
    processRoleMigrationResult: ((..._args: ProcessArgs) => {
      processorCalled = true;
      throw new Error("processRoleMigrationResult should not run");
    }) as ProcessFn,
    getMembershipOwnerUserId: ((_: number) =>
      Promise.resolve("member-target")) as MembershipHandlerDeps[
        "getMembershipOwnerUserId"
      ],
  });

  const res = await handler(
    buildMembershipRoleRequest({ membership_id: 35, new_role: "teacher" }),
  );
  const body = await readJsonRecord(res);

  assertEquals(res.status, 409);
  assertEquals(body.error, "Administrator roles require a dedicated account.");
  assertEquals(body.code, "ROLE_IMMUTABLE_CROSS_ACADEMY");
  assert(processorCalled === false);
});

Deno.test("handler rejects mismatched request ids from the RPC", async () => {
  let metadataCalled = false;

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdminRequest(),
    getServiceRoleClient: () =>
      buildServiceRoleClient(() =>
        buildSingle({
          membership_id: 55,
          academy_id: 7,
          old_role: "student",
          new_role: "teacher",
          cleaned_records: {},
          metadata_payload: { app_metadata: { active_role: "teacher" } },
          should_refresh_session: true,
          request_id: "aaaaaaaa-1234-4aaa-8aaa-aaaaaaaa0002",
        })
      ),
    processRoleMigrationResult:
      ((payload: ProcessArgs[0], context: ProcessArgs[1]) =>
        processRoleMigrationResult(
          payload,
          context,
          {
            resolveTargetUserId: () => Promise.resolve("member-55"),
            applyMetadata: () => {
              metadataCalled = true;
              return Promise.resolve();
            },
            emitEvent: () => Promise.resolve(),
            now: () => 10,
          },
        )) as ProcessFn,
    getMembershipOwnerUserId: ((membershipId: number) =>
      Promise.resolve(`member-${membershipId}`)) as MembershipHandlerDeps[
        "getMembershipOwnerUserId"
      ],
  });

  const reqId = "aaaaaaaa-1234-4aaa-8aaa-aaaaaaaa0001";
  const res = await handler(
    buildMembershipRoleRequest(
      { membership_id: 55, new_role: "teacher" },
      reqId,
    ),
  );
  const body = await readJsonRecord(res);

  assertEquals(res.status, 502);
  assertEquals(body.request_id, reqId);
  assertEquals(body.error, "The operation returned an unexpected identifier.");
  assertEquals(metadataCalled, false);
});
