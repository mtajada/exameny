import { assertEquals, assertThrows } from "std/testing/asserts.ts";

import { HttpError } from "../_shared/http-errors.ts";
import type { AuthContext } from "../_shared/auth.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.test");
Deno.env.set("EXAMENY_SUPABASE_PUBLISHABLE_KEY", "anon-key");
Deno.env.set("EXAMENY_SUPABASE_SECRET_KEY", "service-role-key");
Deno.env.set("ALLOWED_ORIGINS", "http://localhost:5173");

const {
  processAliasResult,
  handleAliasRpcError,
  createHandler,
} = (await import("../admin-resolve-alias/index.ts")).__testing;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type AliasHandlerDeps = Parameters<typeof createHandler>[0] extends
  Partial<infer T> ? T : never;

const buildAuthContext = (overrides?: Partial<AuthContext>): AuthContext => ({
  user: {
    id: "admin-alias",
    email: "alias-admin@example.com",
    aud: "authenticated",
    created_at: "2024-01-01T00:00:00Z",
    app_metadata: { active_academy_id: 4, active_role: "academy_admin" },
    user_metadata: {},
  } as AuthContext["user"],
  profile: {
    id: "admin-alias",
    email: "alias-admin@example.com",
    role: "academy_admin",
    academy_id: 4,
    membership_id: 1,
    full_name: "Alias Admin",
    platform_role: null,
  },
  supabase: {} as AuthContext["supabase"],
  authorization: "Bearer test-token",
  ...(overrides ?? {}),
});

const stubAuthenticateAdmin = (
  overrides?: Partial<AuthContext>,
): AliasHandlerDeps["authenticateAdminRequest"] =>
  (() => Promise.resolve(buildAuthContext(overrides))) as AliasHandlerDeps[
    "authenticateAdminRequest"
  ];

const stubAliasServiceRoleClient = (
  response: { data: unknown; error: unknown },
): AliasHandlerDeps["getServiceRoleClient"] =>
  (() => ({
    rpc: () => ({
      single: () => Promise.resolve(response),
    }),
  })) as AliasHandlerDeps["getServiceRoleClient"];

const stubProcessAliasResult = (
  result = baseAliasResult,
): AliasHandlerDeps["processAliasResult"] =>
  (() => Promise.resolve(result)) as AliasHandlerDeps["processAliasResult"];

const stubAliasOwnerLookup = (
  userId = "alias-member",
): AliasHandlerDeps["getMembershipOwnerUserId"] =>
  (() => Promise.resolve(userId)) as AliasHandlerDeps[
    "getMembershipOwnerUserId"
  ];

const aliasManualResponse = (
  response: Response | null,
): AliasHandlerDeps["tryBuildManualInterventionResponse"] =>
  (() => response) as AliasHandlerDeps["tryBuildManualInterventionResponse"];

type ProcessAliasArgs = Parameters<AliasHandlerDeps["processAliasResult"]>;

Deno.test("processAliasResult normalizes email and refreshes the target member before emitting event", async () => {
  const raw = {
    membership_id: 77,
    email_normalized: "MixedCase@Example.com ",
    metadata_payload: { app_metadata: { active_academy_id: 5 } },
    should_refresh_session: true,
    request_id: "66666666-6666-4666-8666-666666666666",
  };

  const calls: Array<{ type: string; payload: unknown }> = [];
  const metadataTargets: string[] = [];

  const result = await processAliasResult(
    raw,
    {
      requestId: "66666666-6666-4666-8666-666666666666",
      userId: "admin-user",
      actorAcademyId: 5,
      startedAt: 0,
      targetUserId: "member-456",
    },
    {
      applyMetadata: (userId, payload) => {
        metadataTargets.push(userId);
        calls.push({ type: "metadata", payload });
        return Promise.resolve();
      },
      emitEvent: (payload) => {
        calls.push({ type: "event", payload });
        return Promise.resolve();
      },
      now: () => 20,
    },
  );

  assertEquals(calls.map((entry) => entry.type), ["metadata", "event"]);
  assertEquals(metadataTargets, ["member-456"]);
  const rawPayload = calls[1]?.payload;
  if (!isPlainRecord(rawPayload)) {
    throw new Error("Expected event payload to be an object");
  }
  const eventPayload = rawPayload;
  assertEquals(eventPayload.normalized_email, "mixedcase@example.com");
  assertEquals(result.email_normalized, "mixedcase@example.com");
  assertEquals(result.should_refresh_session, true);
  assertEquals(result.request_id, "66666666-6666-4666-8666-666666666666");
});

Deno.test("processAliasResult resolves the membership owner when context omits it", async () => {
  const raw = {
    membership_id: 91,
    email_normalized: "foo@example.com",
    metadata_payload: { app_metadata: { key: "value" } },
    should_refresh_session: true,
    request_id: "77777777-7777-4777-8777-777777777777",
  };

  const calls: string[] = [];

  const result = await processAliasResult(
    raw,
    {
      requestId: "77777777-7777-4777-8777-777777777777",
      userId: "admin",
      actorAcademyId: 1,
      startedAt: 5,
      targetUserId: null,
    },
    {
      resolveTargetUserId: (membershipId) => {
        calls.push(`lookup-${membershipId}`);
        return Promise.resolve("resolved-member");
      },
      applyMetadata: (userId, _payload) => {
        calls.push(`sync-${userId}`);
        return Promise.resolve();
      },
      emitEvent: (_payload) => Promise.resolve(),
      now: () => 15,
    },
  );

  assertEquals(calls, ["lookup-91", "sync-resolved-member"]);
  assertEquals(result.membership_id, 91);
});

Deno.test("processAliasResult syncs metadata even when should_refresh_session is false", async () => {
  const raw = {
    membership_id: 101,
    email_normalized: "bar@example.com",
    metadata_payload: { app_metadata: { active_academy_id: 9 } },
    should_refresh_session: false,
    request_id: "88888888-8888-4888-8888-888888888888",
  };

  const calls: string[] = [];

  await processAliasResult(
    raw,
    {
      requestId: "88888888-8888-4888-8888-888888888888",
      userId: "admin",
      actorAcademyId: 9,
      startedAt: 0,
      targetUserId: null,
    },
    {
      resolveTargetUserId: (membershipId) => {
        calls.push(`lookup-${membershipId}`);
        return Promise.resolve("member-9");
      },
      applyMetadata: (userId, _payload) => {
        calls.push(`sync-${userId}`);
        return Promise.resolve();
      },
      emitEvent: (_payload) => Promise.resolve(),
      now: () => 5,
    },
  );

  assertEquals(calls, ["lookup-101", "sync-member-9"]);
});

Deno.test("handleAliasRpcError maps EMAIL_MISMATCH to 409", () => {
  const error = assertThrows(
    () =>
      handleAliasRpcError({ message: "EMAIL_MISMATCH" }, {
        requestId: "req-email",
      }),
    HttpError,
  );

  assertEquals(error.status, 409);
});

const buildAliasRequest = (
  body: Record<string, unknown>,
  requestId = crypto.randomUUID(),
): Request =>
  new Request("https://example.supabase.test/admin-resolve-alias", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost:5173",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });

const baseAliasResult = {
  membership_id: 222,
  email_normalized: "alias@example.com",
  metadata_payload: { app_metadata: { active_academy_id: 4 } },
  should_refresh_session: true,
  request_id: "22222222-2222-4222-8222-222222222222",
} as const;

Deno.test("admin-resolve-alias handler returns normalized payload on success", async () => {
  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdmin(),
    getServiceRoleClient: stubAliasServiceRoleClient({
      data: {
        membership_id: baseAliasResult.membership_id,
        email_normalized: baseAliasResult.email_normalized,
        metadata_payload: baseAliasResult.metadata_payload,
        should_refresh_session: baseAliasResult.should_refresh_session,
        request_id: baseAliasResult.request_id,
      },
      error: null,
    }),
    processAliasResult: stubProcessAliasResult(),
    getMembershipOwnerUserId: stubAliasOwnerLookup(),
    tryBuildManualInterventionResponse: aliasManualResponse(null),
  });

  const res = await handler(
    buildAliasRequest({
      membership_id: 222,
      normalized_email: "alias@example.com",
    }),
  );
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.membership_id, baseAliasResult.membership_id);
  assertEquals(json.email_normalized, baseAliasResult.email_normalized);
  assertEquals(json.request_id, baseAliasResult.request_id);
  assertEquals(json.metadata_payload, baseAliasResult.metadata_payload);
  assertEquals(
    json.should_refresh_session,
    baseAliasResult.should_refresh_session,
  );
});

Deno.test("admin-resolve-alias handler applies metadata before emitting events and forwards flags", async () => {
  const callOrder: string[] = [];
  const metadataPayloads: Array<Record<string, unknown> | null> = [];
  const emittedEvents: Array<Record<string, unknown>> = [];

  const ownerLookup = (
    membershipId: number,
    _message: string,
  ): Promise<string> => {
    callOrder.push(`lookup-${membershipId}`);
    return Promise.resolve("member-222");
  };

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdmin(),
    getServiceRoleClient: stubAliasServiceRoleClient({
      data: baseAliasResult,
      error: null,
    }),
    getMembershipOwnerUserId: ownerLookup,
    tryBuildManualInterventionResponse: aliasManualResponse(null),
    applyMetadata: (userId, payload) => {
      callOrder.push(`metadata-${userId}`);
      metadataPayloads.push(payload);
      return Promise.resolve();
    },
    emitMembershipAliasResolvedEvent: (payload) => {
      callOrder.push("event");
      if (!isPlainRecord(payload)) {
        throw new Error("Expected emitted event payload to be an object");
      }
      emittedEvents.push(payload);
      return Promise.resolve();
    },
  });

  const res = await handler(
    buildAliasRequest({
      membership_id: 222,
      normalized_email: "alias@example.com",
    }, baseAliasResult.request_id),
  );
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(callOrder, ["lookup-222", "metadata-member-222", "event"]);
  assertEquals(metadataPayloads, [baseAliasResult.metadata_payload]);
  assertEquals(emittedEvents[0]?.request_id, baseAliasResult.request_id);
  assertEquals(
    json.should_refresh_session,
    baseAliasResult.should_refresh_session,
  );
  assertEquals(json.metadata_payload, baseAliasResult.metadata_payload);
});

Deno.test("admin-resolve-alias handler surfaces manual intervention responses", async () => {
  const manualResponse = new Response(
    JSON.stringify({ code: "MANUAL_INTERVENTION_REQUIRED" }),
    {
      status: 409,
      headers: { "Content-Type": "application/json" },
    },
  );

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdmin(),
    getServiceRoleClient: stubAliasServiceRoleClient({
      data: null,
      error: { message: "MANUAL_INTERVENTION_REQUIRED" },
    }),
    processAliasResult: stubProcessAliasResult(),
    getMembershipOwnerUserId: stubAliasOwnerLookup(),
    tryBuildManualInterventionResponse: aliasManualResponse(manualResponse),
  });

  const res = await handler(
    buildAliasRequest({
      membership_id: 222,
      normalized_email: "alias@example.com",
    }),
  );
  const json = await res.json();
  assertEquals(res.status, 409);
  assertEquals(json.code, "MANUAL_INTERVENTION_REQUIRED");
});

Deno.test("admin-resolve-alias handler maps EMAIL_MISMATCH errors to HTTP 409 responses", async () => {
  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdmin(),
    getServiceRoleClient: stubAliasServiceRoleClient({
      data: null,
      error: { message: "EMAIL_MISMATCH" },
    }),
    processAliasResult: stubProcessAliasResult(),
    getMembershipOwnerUserId: stubAliasOwnerLookup(),
    tryBuildManualInterventionResponse: aliasManualResponse(null),
  });

  const res = await handler(
    buildAliasRequest({
      membership_id: 222,
      normalized_email: "alias@example.com",
    }),
  );
  const json = await res.json();
  assertEquals(res.status, 409);
  assertEquals(
    json.error,
    "The provided email does not match the one stored on the account.",
  );
  assertEquals(json.code, "EMAIL_MISMATCH");
});

Deno.test("admin-resolve-alias handler maps ROLE_SCOPE_CONFLICT errors to HTTP 403 responses", async () => {
  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdmin(),
    getServiceRoleClient: stubAliasServiceRoleClient({
      data: null,
      error: { message: "ROLE_SCOPE_CONFLICT" },
    }),
    getMembershipOwnerUserId: stubAliasOwnerLookup(),
    tryBuildManualInterventionResponse: aliasManualResponse(null),
  });

  const res = await handler(
    buildAliasRequest({
      membership_id: 333,
      normalized_email: "scope@example.com",
    }),
  );
  const json = await res.json();

  assertEquals(res.status, 403);
  assertEquals(
    json.error,
    "You can only correct alias conflicts in your academy. Contact the platform team for other cases.",
  );
  assertEquals(json.code, "ROLE_SCOPE_CONFLICT");
});

Deno.test("admin-resolve-alias handler maps ACTOR_CONTEXT_REQUIRED errors to HTTP 403 responses", async () => {
  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdmin(),
    getServiceRoleClient: stubAliasServiceRoleClient({
      data: null,
      error: { message: "ACTOR_CONTEXT_REQUIRED" },
    }),
    getMembershipOwnerUserId: stubAliasOwnerLookup(),
    tryBuildManualInterventionResponse: aliasManualResponse(null),
  });

  const res = await handler(
    buildAliasRequest({
      membership_id: 444,
      normalized_email: "context@example.com",
    }),
  );
  const json = await res.json();

  assertEquals(res.status, 403);
  assertEquals(
    json.error,
    "We could not validate your admin session. Check your active academy and try again.",
  );
  assertEquals(json.code, "ACTOR_CONTEXT_REQUIRED");
});

Deno.test("admin-resolve-alias handler rejects mismatched request ids from the RPC", async () => {
  let metadataCalled = false;

  const handler = createHandler({
    authenticateAdminRequest: stubAuthenticateAdmin(),
    getServiceRoleClient: stubAliasServiceRoleClient({
      data: {
        membership_id: 555,
        email_normalized: "rpc@example.com",
        metadata_payload: { app_metadata: { active_academy_id: 9 } },
        should_refresh_session: true,
        request_id: "bbbbbbbb-0000-4000-8000-000000000002",
      },
      error: null,
    }),
    processAliasResult: ((
      payload: ProcessAliasArgs[0],
      context: ProcessAliasArgs[1],
      _deps?: ProcessAliasArgs[2],
    ) =>
      processAliasResult(
        payload,
        context,
        {
          resolveTargetUserId: () => Promise.resolve("member-555"),
          applyMetadata: () => {
            metadataCalled = true;
            return Promise.resolve();
          },
          emitEvent: () => Promise.resolve(),
          now: () => 5,
        },
      )) as AliasHandlerDeps["processAliasResult"],
    getMembershipOwnerUserId: stubAliasOwnerLookup(),
    tryBuildManualInterventionResponse: aliasManualResponse(null),
  });

  const reqId = "bbbbbbbb-0000-4000-8000-000000000001";
  const res = await handler(
    buildAliasRequest({
      membership_id: 555,
      normalized_email: "rpc@example.com",
    }, reqId),
  );
  const json = await res.json();

  assertEquals(res.status, 502);
  assertEquals(json.request_id, reqId);
  assertEquals(json.error, "The operation returned an unexpected identifier.");
  assertEquals(metadataCalled, false);
});
