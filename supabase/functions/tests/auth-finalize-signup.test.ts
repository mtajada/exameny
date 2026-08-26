import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "std/testing/asserts.ts";

import { HttpError } from "../_shared/http-errors.ts";
import type { AuthContext } from "../_shared/auth.ts";
import type { MembershipAliasConflictLogInput } from "../_shared/events.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const { __testing } = await import("../auth-finalize-signup/index.ts");
const {
  processFinalizeResult,
  handleFinalizeRpcError,
  callFinalizeInvitedSignup,
  ensureFinalizeRpcPayload,
  ensureRpcRequestIdMatches,
  createAuthFinalizeHandler,
} = __testing;

Deno.test("processFinalizeResult applies metadata before emitting event and preserves flags", async () => {
  const rawResult = {
    memberships: [
      { membership_id: 1, academy_id: 10, role: "student", status: "active" },
      { membership_id: 2, academy_id: 11, role: "teacher", status: "active" },
    ],
    memberships_inactive: [{
      membership_id: 3,
      academy_id: 12,
      role: "student",
      status: "inactive",
    }],
    memberships_claimed: [{
      membership_id: 4,
      academy_id: 10,
      role: "student",
      status: "active",
    }],
    auto_selected_academy_id: 10,
    metadata_payload: { app_metadata: { active_academy_id: 10 } },
    should_refresh_session: true,
    is_platform_admin: false,
    request_id: "00000000-0000-0000-0000-000000000000",
  };

  const callOrder: string[] = [];
  const metadataPayloads: unknown[] = [];
  const emittedEvents: unknown[] = [];
  const startedAt = 100;

  const response = await processFinalizeResult(
    rawResult,
    {
      requestId: "req-123",
      userId: "user-1",
      userEmail: "student@example.com",
      startedAt,
    },
    {
      applyMetadata: (payload) => {
        callOrder.push("metadata");
        metadataPayloads.push(payload);
        return Promise.resolve();
      },
      emitEvent: (payload) => {
        callOrder.push("event");
        emittedEvents.push(payload);
        return Promise.resolve();
      },
      now: () => startedAt + 25,
    },
  );

  assertEquals(callOrder, ["metadata", "event"]);
  assertEquals(metadataPayloads, [rawResult.metadata_payload]);

  assertEquals(emittedEvents.length, 1);
  assertEquals(emittedEvents[0], {
    request_id: rawResult.request_id,
    duration_ms: 25,
    user_id: "user-1",
    email: "student@example.com",
    memberships_claimed: [{
      membership_id: 4,
      academy_id: 10,
      role: "student",
    }],
    memberships_inactive: [{
      membership_id: 3,
      academy_id: 12,
      role: "student",
    }],
    auto_selected_academy_id: 10,
  });

  assertEquals(response.should_refresh_session, true);
  assertEquals(response.memberships.length, 2);
  assertEquals(response.memberships_claimed.length, 1);
  assertEquals(response.metadata_payload, rawResult.metadata_payload);
  assertEquals(response.is_platform_admin, rawResult.is_platform_admin);
  assertEquals(response.request_id, rawResult.request_id);
});

Deno.test("processFinalizeResult retains is_platform_admin flag when true", async () => {
  const rawResult = {
    memberships: [],
    memberships_inactive: [],
    memberships_claimed: [],
    auto_selected_academy_id: null,
    metadata_payload: null,
    should_refresh_session: false,
    is_platform_admin: true,
    request_id: "req-platform",
  };

  let emitted = false;

  const response = await processFinalizeResult(
    rawResult,
    {
      requestId: "req-platform",
      userId: "user-platform",
      userEmail: "platform@example.com",
      startedAt: 0,
    },
    {
      applyMetadata: () => Promise.resolve(),
      emitEvent: (payload) => {
        emitted = true;
        assertEquals(payload.request_id, "req-platform");
        return Promise.resolve();
      },
      now: () => 5,
    },
  );

  assert(emitted);
  assertEquals(response.is_platform_admin, true);
});

Deno.test("handleFinalizeRpcError logs alias incident once and returns 409 copy", async () => {
  const error = {
    message: "MEMBERSHIP_OWNERSHIP_CONFLICT",
    details:
      "user_id=123 email_login=login@example.com email_membership=alias@example.com membership_id=42",
  };

  const aliasCalls: Array<Record<string, unknown>> = [];

  const thrown = await assertRejects(
    () =>
      handleFinalizeRpcError(
        error,
        { requestId: "req-alias", userId: "user-123" },
        {
          logAliasConflict: (input) => {
            aliasCalls.push(input);
            return Promise.resolve();
          },
        },
      ),
    HttpError,
  );

  assertEquals(aliasCalls.length, 1);
  assertEquals(aliasCalls[0].emailLogin, "login@example.com");
  assertEquals(aliasCalls[0].emailMembership, "alias@example.com");
  assertEquals(aliasCalls[0].membershipId, 42);
  assertEquals((thrown as HttpError).status, 409);
  assertEquals(
    thrown.message,
    "We detected an email mismatch between your account and the invitation. Ask your academy to confirm before trying again.",
  );
});

Deno.test("handleFinalizeRpcError surfaces INVITATION_ALREADY_CLAIMED copy with 409 status", async () => {
  const thrown = await assertRejects(
    () =>
      handleFinalizeRpcError(
        { message: "INVITATION_ALREADY_CLAIMED" },
        { requestId: "req-claimed", userId: "user-claim" },
      ),
    HttpError,
  );

  assertEquals((thrown as HttpError).status, 409);
  assertEquals(
    thrown.message,
    "This invitation has already been claimed. Ask your academy to confirm access or issue a new invite.",
  );
  assertEquals((thrown as HttpError).details, {
    code: "INVITATION_ALREADY_CLAIMED",
    request_id: "req-claimed",
  });
});

Deno.test("handleFinalizeRpcError surfaces ROLE_CONFLICT details payload", async () => {
  const error = {
    message: "ROLE_CONFLICT",
    details: "existing_role=teacher new_role=student membership_id=5",
  };

  const thrown = await assertRejects(
    () =>
      handleFinalizeRpcError(error, {
        requestId: "req-role",
        userId: "user-321",
      }),
    HttpError,
  );

  assertEquals((thrown as HttpError).status, 409);
  assert((thrown as HttpError).details);
  const rawDetails = (thrown as HttpError).details;
  if (!isPlainRecord(rawDetails)) {
    throw new Error("Expected role conflict details to be an object");
  }
  const currentRole = rawDetails.current_role;
  const requestedRole = rawDetails.requested_role;
  const code = rawDetails.code;
  if (
    typeof currentRole !== "string" || typeof requestedRole !== "string" ||
    typeof code !== "string"
  ) {
    throw new Error("Expected role conflict details to include string fields");
  }
  assertEquals(currentRole, "teacher");
  assertEquals(requestedRole, "student");
  assertEquals(code, "ROLE_CONFLICT");
});

Deno.test("processFinalizeResult surfaces metadata sync failures and skips event emission", async () => {
  const rawResult = {
    memberships: [],
    memberships_inactive: [],
    memberships_claimed: [],
    auto_selected_academy_id: null,
    metadata_payload: { app_metadata: { key: "value" } },
    should_refresh_session: true,
    is_platform_admin: false,
    request_id: "req-meta",
  };

  let eventEmitted = false;

  const error = await assertRejects(
    () =>
      processFinalizeResult(
        rawResult,
        {
          requestId: "req-meta",
          userId: "user-x",
          userEmail: null,
          startedAt: 0,
        },
        {
          applyMetadata: () =>
            Promise.reject(new HttpError(500, "sync failed")),
          emitEvent: () => {
            eventEmitted = true;
            return Promise.resolve();
          },
        },
      ),
    HttpError,
  );

  assertEquals((error as HttpError).message, "sync failed");
  assertEquals(eventEmitted, false);
});

Deno.test("processFinalizeResult skips metadata when refresh flag is false and still emits event", async () => {
  const rawResult = {
    memberships: [{
      membership_id: 1,
      academy_id: 10,
      role: "student",
      status: "active",
    }],
    memberships_inactive: [],
    memberships_claimed: [],
    auto_selected_academy_id: null,
    metadata_payload: { app_metadata: { key: "value" } },
    should_refresh_session: false,
    is_platform_admin: false,
    request_id: "req-meta-skip",
  };

  const callOrder: string[] = [];
  const metadataPayloads: unknown[] = [];

  const response = await processFinalizeResult(
    rawResult,
    {
      requestId: "req-meta-skip",
      userId: "user-y",
      userEmail: "user@example.com",
      startedAt: 0,
    },
    {
      applyMetadata: (payload) => {
        callOrder.push("metadata");
        metadataPayloads.push(payload);
        return Promise.resolve();
      },
      emitEvent: (payload) => {
        callOrder.push("event");
        assertEquals(payload.request_id, "req-meta-skip");
        return Promise.resolve();
      },
      now: () => 10,
    },
  );

  assertEquals(callOrder, ["event"]);
  assertEquals(metadataPayloads, []);
  assertEquals(response.should_refresh_session, false);
  assertEquals(response.metadata_payload, rawResult.metadata_payload);
});

Deno.test("callFinalizeInvitedSignup hits rest RPC with request id, service role key, Authorization header, and unwraps array payloads", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  const mockFetch: typeof fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    requests.push({ url: String(input), init });
    return Promise.resolve(
      new Response(JSON.stringify([{ request_id: "req-123" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  const response = await callFinalizeInvitedSignup(
    "Bearer user-token",
    "req-123",
    {
      fetchImpl: mockFetch,
      supabaseUrl: "https://example.supabase.test",
      serviceRoleKey: "service-role-key",
    },
  );

  assertEquals(requests.length, 1);
  assertEquals(
    requests[0].url,
    "https://example.supabase.test/rest/v1/rpc/finalize_invited_signup",
  );
  const headersInit = requests[0].init?.headers;
  const headers = headersInit instanceof Headers
    ? Object.fromEntries(headersInit.entries())
    : isPlainRecord(headersInit)
    ? headersInit
    : {};
  assertEquals(headers.Authorization, "Bearer user-token");
  assertEquals(headers.apikey, "service-role-key");
  assertEquals(headers.Accept, "application/vnd.pgrst.object+json");
  const payload = requests[0].init?.body
    ? JSON.parse(requests[0].init?.body as string)
    : {};
  assertEquals(payload.p_request_id, "req-123");
  assertEquals(response.error, null);
  assertEquals(response.data, { request_id: "req-123" });
});

Deno.test("callFinalizeInvitedSignup returns null data when PostgREST responds with an empty array", async () => {
  const mockFetch: typeof fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

  const response = await callFinalizeInvitedSignup(
    "Bearer token",
    "req-empty",
    {
      fetchImpl: mockFetch,
      supabaseUrl: "https://example.supabase.test",
      serviceRoleKey: "service-role-key",
    },
  );

  assertEquals(response.error, null);
  assertEquals(response.data, null);
});

Deno.test("ensureRpcRequestIdMatches rejects mismatched identifiers", () => {
  const payload = {
    memberships: [],
    memberships_inactive: [],
    memberships_claimed: [],
    auto_selected_academy_id: null,
    metadata_payload: null,
    should_refresh_session: false,
    is_platform_admin: false,
    request_id: "rpc-id-different",
  } satisfies Parameters<typeof ensureRpcRequestIdMatches>[0];

  assertThrows(
    () => ensureRpcRequestIdMatches(payload, "edge-request-id"),
    HttpError,
  );
});

Deno.test("ensureFinalizeRpcPayload rejects non-object payloads and preserves request context", () => {
  const error = assertThrows(
    () => ensureFinalizeRpcPayload(null, "req-invalid"),
    HttpError,
  );
  assertEquals(error.status, 500);
  if (!isPlainRecord(error.details)) {
    throw new Error("Expected error details to be an object");
  }
  assertEquals(error.details.response_type, "null");
});

Deno.test("ensureFinalizeRpcPayload passes through plain objects unchanged", () => {
  const payload = { memberships: [], request_id: "req-ok" };
  const result = ensureFinalizeRpcPayload(payload, "req-ok");
  assertStrictEquals(result, payload);
});

Deno.test("processFinalizeResult handles multiple claimed memberships and emits them in the analytics event", async () => {
  const rawResult = {
    memberships: [
      { membership_id: 15, academy_id: 101, role: "student", status: "active" },
      { membership_id: 16, academy_id: 102, role: "student", status: "active" },
      {
        membership_id: 17,
        academy_id: 103,
        role: "student",
        status: "inactive",
      },
    ],
    memberships_inactive: [{
      membership_id: 18,
      academy_id: 104,
      role: "student",
      status: "inactive",
    }],
    memberships_claimed: [
      { membership_id: 15, academy_id: 101, role: "student" },
      { membership_id: 16, academy_id: 102, role: "student" },
    ],
    auto_selected_academy_id: null,
    metadata_payload: null,
    should_refresh_session: false,
    is_platform_admin: false,
    request_id: "req-multi",
  };

  const emittedEvents: Array<Record<string, unknown>> = [];

  const response = await processFinalizeResult(
    rawResult,
    {
      requestId: "req-multi",
      userId: "user-999",
      userEmail: "multi@example.com",
      startedAt: 0,
    },
    {
      applyMetadata: () => Promise.resolve(),
      emitEvent: (payload) => {
        emittedEvents.push(payload);
        return Promise.resolve();
      },
      now: () => 10,
    },
  );

  assertEquals(emittedEvents.length, 1);
  assertEquals(emittedEvents[0]?.memberships_claimed, [
    { membership_id: 15, academy_id: 101, role: "student" },
    { membership_id: 16, academy_id: 102, role: "student" },
  ]);
  assertEquals(response.memberships.length, 3);
  assertEquals(response.memberships_inactive.length, 1);
});

const DEFAULT_REQUEST_ID = "00000000-0000-4000-8000-000000000001";

const buildFinalizeRequest = (headers?: Record<string, string>) =>
  new Request("https://example.supabase.test/auth-finalize-signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost:5173",
      "x-request-id": DEFAULT_REQUEST_ID,
      ...(headers ?? {}),
    },
  });

Deno.test("authFinalizeHandler applies metadata before emitting events and returns the RPC payload", async () => {
  const authContext: AuthContext = {
    user: {
      id: "handler-user",
      email: "user@example.com",
      app_metadata: {},
      user_metadata: {},
    } as AuthContext["user"],
    profile: {
      id: "handler-user",
      email: "profile@example.com",
      role: null,
      academy_id: null,
      membership_id: null,
      full_name: null,
      platform_role: null,
    },
    supabase: {} as AuthContext["supabase"],
    authorization: "Bearer handler-token",
  };

  const rpcPayload = {
    memberships: [{
      membership_id: 1,
      academy_id: 9,
      role: "student",
      status: "active",
    }],
    memberships_inactive: [],
    memberships_claimed: [{ membership_id: 1, academy_id: 9, role: "student" }],
    auto_selected_academy_id: 9,
    metadata_payload: { app_metadata: { active_academy_id: 9 } },
    should_refresh_session: true,
    is_platform_admin: false,
    request_id: DEFAULT_REQUEST_ID,
  };

  const callOrder: string[] = [];
  const metadataPayloads: Array<Record<string, unknown> | null> = [];
  const emittedEvents: Array<Record<string, unknown>> = [];
  let capturedAuthorization = "";
  let capturedRequestId = "";

  const handler = createAuthFinalizeHandler({
    requireAuth: () => Promise.resolve(authContext),
    callFinalizeInvitedSignup: (authorization, requestId) => {
      capturedAuthorization = authorization;
      capturedRequestId = requestId;
      return Promise.resolve({ data: rpcPayload, error: null });
    },
    applyMetadataPayloadForUser: (_userId, payload) => {
      callOrder.push("metadata");
      metadataPayloads.push(payload);
      return Promise.resolve();
    },
    emitFinalizeInvitedSignupEvent: (payload) => {
      callOrder.push("event");
      if (!isPlainRecord(payload)) {
        throw new Error("Expected emitted event payload to be an object");
      }
      emittedEvents.push(payload);
      return Promise.resolve();
    },
  });

  const response = await handler(buildFinalizeRequest());
  const json = await response.json();

  assertEquals(response.status, 200);
  assertEquals(capturedAuthorization, "Bearer handler-token");
  assertEquals(capturedRequestId, DEFAULT_REQUEST_ID);
  assertEquals(callOrder, ["metadata", "event"]);
  assertEquals(metadataPayloads, [rpcPayload.metadata_payload]);
  assertEquals(emittedEvents[0]?.request_id, DEFAULT_REQUEST_ID);
  assertEquals(json.request_id, DEFAULT_REQUEST_ID);
  assertEquals(json.auto_selected_academy_id, 9);
  assertEquals(json.memberships.length, 1);
  assertEquals(json.should_refresh_session, true);
});

Deno.test("authFinalizeHandler suppresses should_refresh_session when metadata already matches the JWT", async () => {
  const authContext: AuthContext = {
    user: {
      id: "handler-user",
      email: "user@example.com",
      app_metadata: { active_academy_id: 9 },
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as AuthContext["user"],
    profile: {
      id: "handler-user",
      email: "profile@example.com",
      role: null,
      academy_id: null,
      membership_id: null,
      full_name: null,
      platform_role: null,
    },
    supabase: {} as AuthContext["supabase"],
    authorization: "Bearer handler-token",
  };

  const rpcPayload = {
    memberships: [{
      membership_id: 1,
      academy_id: 9,
      role: "student",
      status: "active",
    }],
    memberships_inactive: [],
    memberships_claimed: [{ membership_id: 1, academy_id: 9, role: "student" }],
    auto_selected_academy_id: 9,
    metadata_payload: { app_metadata: { active_academy_id: 9 } },
    should_refresh_session: true,
    is_platform_admin: false,
    request_id: DEFAULT_REQUEST_ID,
  };

  const callOrder: string[] = [];

  const handler = createAuthFinalizeHandler({
    requireAuth: () => Promise.resolve(authContext),
    callFinalizeInvitedSignup: () =>
      Promise.resolve({ data: rpcPayload, error: null }),
    applyMetadataPayloadForUser: () => {
      callOrder.push("metadata");
      return Promise.resolve();
    },
    emitFinalizeInvitedSignupEvent: () => {
      callOrder.push("event");
      return Promise.resolve();
    },
  });

  const response = await handler(buildFinalizeRequest());
  const json = await response.json();

  assertEquals(response.status, 200);
  assertEquals(callOrder, ["event"]);
  assertEquals(json.should_refresh_session, false);
});

Deno.test("authFinalizeHandler returns platform admin flag from RPC response", async () => {
  const authContext: AuthContext = {
    user: {
      id: "platform-user",
      email: "owner@example.com",
      app_metadata: {},
      user_metadata: {},
    } as AuthContext["user"],
    profile: {
      id: "platform-user",
      email: "owner@example.com",
      role: "super_admin",
      academy_id: null,
      membership_id: null,
      full_name: null,
      platform_role: "super_admin",
    },
    supabase: {} as AuthContext["supabase"],
    authorization: "Bearer platform-token",
  };

  const rpcPayload = {
    memberships: [],
    memberships_inactive: [],
    memberships_claimed: [],
    auto_selected_academy_id: null,
    metadata_payload: null,
    should_refresh_session: false,
    is_platform_admin: true,
    request_id: DEFAULT_REQUEST_ID,
  };

  const handler = createAuthFinalizeHandler({
    requireAuth: () => Promise.resolve(authContext),
    callFinalizeInvitedSignup: (_authorization, requestId) => {
      assertEquals(requestId, DEFAULT_REQUEST_ID);
      return Promise.resolve({ data: rpcPayload, error: null });
    },
    applyMetadataPayloadForUser: () => Promise.resolve(),
    emitFinalizeInvitedSignupEvent: () => Promise.resolve(),
  });

  const response = await handler(buildFinalizeRequest());
  const json = await response.json();

  assertEquals(response.status, 200);
  assertEquals(json.request_id, DEFAULT_REQUEST_ID);
  assertEquals(json.is_platform_admin, true);
});

const ALIAS_CONFLICT_MESSAGE =
  "We detected an email mismatch between your account and the invitation. Ask your academy to confirm before trying again.";

Deno.test("authFinalizeHandler logs alias conflicts and surfaces 409 responses with request context", async () => {
  const authContext: AuthContext = {
    user: {
      id: "alias-user",
      email: "alias@example.com",
      app_metadata: {},
      user_metadata: {},
    } as AuthContext["user"],
    profile: {
      id: "alias-user",
      email: "alias@example.com",
      role: null,
      academy_id: null,
      membership_id: null,
      full_name: null,
      platform_role: null,
    },
    supabase: {} as AuthContext["supabase"],
    authorization: "Bearer alias-token",
  };

  const aliasCalls: MembershipAliasConflictLogInput[] = [];

  const handler = createAuthFinalizeHandler({
    requireAuth: () => Promise.resolve(authContext),
    callFinalizeInvitedSignup: () =>
      Promise.resolve({
        data: null,
        error: {
          message: "MEMBERSHIP_OWNERSHIP_CONFLICT",
          details:
            "membership_id=55 email_login=alias@example.com email_membership=other@example.com",
        },
      }),
    logMembershipAliasConflict: (input) => {
      aliasCalls.push(input);
      return Promise.resolve();
    },
  });

  const aliasRequestId = "00000000-0000-4000-8000-000000000002";
  const response = await handler(
    buildFinalizeRequest({ "x-request-id": aliasRequestId }),
  );
  const json = await response.json();

  assertEquals(response.status, 409);
  assertEquals(json.error, ALIAS_CONFLICT_MESSAGE);
  assertEquals(json.request_id, aliasRequestId);
  assertEquals(aliasCalls.length, 1);
  assertEquals(aliasCalls[0].emailLogin, "alias@example.com");
  assertEquals(aliasCalls[0].emailMembership, "other@example.com");
  assertEquals(aliasCalls[0].membershipId, 55);
});
