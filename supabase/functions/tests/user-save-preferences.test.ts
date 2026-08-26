import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "std/testing/asserts.ts";

import { HttpError } from "../_shared/http-errors.ts";
import type { SaveUserPreferencesEventPayload } from "../_shared/events.ts";
import type { AuthContext } from "../_shared/auth.ts";
import { __testing } from "../user-save-preferences/index.ts";
import { buildJsonRequest } from "./utils/request.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const baseRow = {
  user_id: "user-123",
  full_name: "Test User",
  target_exam_id: null,
  target_level_id: null,
  active_academy_id: null,
  is_initial_setup_completed: true,
  source: "initial_setup",
  metadata_payload: {
    app_metadata: { active_role: "student" },
    user_metadata: { onboarding: true },
  },
  should_refresh_session: true,
  request_id: "rpc-request-id",
  duration_ms: 60,
};

const endpointUrl = "https://example.com/user-save-preferences";

type HandlerDeps = typeof __testing.defaultDependencies;
type JsonRecord = Record<string, unknown>;
type CallSavePreferencesRpc = HandlerDeps["callSaveUserPreferencesRpc"];
type RpcContext = Parameters<CallSavePreferencesRpc>[0];
type RpcPayload = Parameters<CallSavePreferencesRpc>[1];
type RpcRequestId = Parameters<CallSavePreferencesRpc>[2];

const createAuthContext = (): AuthContext => ({
  user: { id: "user-123" } as AuthContext["user"],
  profile: {
    id: "user-123",
    email: "user@example.com",
    role: "student",
    academy_id: 10,
    membership_id: 99,
    full_name: "Test User",
    platform_role: null,
  },
  supabase: {} as AuthContext["supabase"],
  authorization: "Bearer test",
});

const createHandlerDeps = (
  overrides: Partial<HandlerDeps> = {},
): HandlerDeps => {
  const authContext = createAuthContext();
  const rpcStub: CallSavePreferencesRpc = (_context, _payload, _requestId) =>
    Promise.resolve({ data: [baseRow], error: null });
  return {
    ensureAllowedOrigin: () => undefined,
    requireAuth: () => Promise.resolve(authContext),
    resolveRequestId: () =>
      Promise.resolve({ requestId: "req-default", source: "generated" }),
    ensureJsonBody: __testing.defaultDependencies.ensureJsonBody,
    validateRequestPayload:
      __testing.defaultDependencies.validateRequestPayload,
    callSaveUserPreferencesRpc: rpcStub,
    syncStudentProfilesTargets: () => Promise.resolve(),
    processPreferencesResult: (row, context) =>
      __testing.processPreferencesResult(row, context),
    readCachedResponse: () => Promise.resolve(null),
    writeCachedResponse: () => Promise.resolve(),
    now: () => 0,
    ...overrides,
  };
};

Deno.test("handleSavePreferencesRequest completes initial setup flow, caches response, and echoes request id", async () => {
  const metadataApplied: JsonRecord[] = [];
  const emitted: SaveUserPreferencesEventPayload[] = [];
  let cachedPayload: JsonRecord | null = null;
  const rpcRow = { ...baseRow, request_id: "edge-initial" };
  let rpcRequestId: string | null = null;
  let syncCalls = 0;

  const deps = createHandlerDeps({
    resolveRequestId: () =>
      Promise.resolve({ requestId: "edge-initial", source: "header" }),
    callSaveUserPreferencesRpc: (
      _ctx: RpcContext,
      _payload: RpcPayload,
      requestId: RpcRequestId,
    ) => {
      rpcRequestId = requestId;
      return Promise.resolve({ data: [rpcRow], error: null });
    },
    syncStudentProfilesTargets: () => {
      syncCalls += 1;
      return Promise.resolve();
    },
    processPreferencesResult: (row, context) =>
      __testing.processPreferencesResult(row, context, {
        applyMetadata: (payload) => {
          if (payload) {
            metadataApplied.push(payload);
          }
          return Promise.resolve();
        },
        emitEvent: (payload) => {
          emitted.push(payload);
          return Promise.resolve();
        },
        now: () => context.startedAt + 75,
      }),
    writeCachedResponse: (_fn, _requestId, _userId, payload) => {
      cachedPayload = payload;
      return Promise.resolve();
    },
    readCachedResponse: () => Promise.resolve(null),
    now: () => 25,
  });

  const response = await __testing.handleSavePreferencesRequest(
    buildJsonRequest(endpointUrl, {
      full_name: "Test User",
      full_name_provided: true,
    }),
    deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.request_id, rpcRow.request_id);
  assertEquals(body.source, "initial_setup");
  assertEquals(body.should_refresh_session, true);
  assertEquals(response.headers.get("x-request-id"), "edge-initial");
  assertEquals(rpcRequestId, "edge-initial");
  assertEquals(metadataApplied, [rpcRow.metadata_payload]);
  assertEquals(emitted.length, 1);
  assertEquals(emitted[0], {
    request_id: rpcRow.request_id,
    user_id: rpcRow.user_id,
    target_exam_id: rpcRow.target_exam_id,
    target_level_id: rpcRow.target_level_id,
    source: "initial_setup",
    duration_ms: rpcRow.duration_ms,
  });
  assertEquals(cachedPayload, body);
  assertEquals(syncCalls, 0);
});

Deno.test("handleSavePreferencesRequest normalizes profile edit flow and enforces rpc request id", async () => {
  const metadataApplied: JsonRecord[] = [];
  const emitted: SaveUserPreferencesEventPayload[] = [];
  const rpcRow = {
    ...baseRow,
    source: "profile_edit",
    metadata_payload: null,
    should_refresh_session: false,
    request_id: "profile-req",
    target_exam_id: 42,
    target_level_id: 7,
  };
  const syncedTargets: Array<
    { examId: number | null; levelId: number | null }
  > = [];

  const deps = createHandlerDeps({
    resolveRequestId: () =>
      Promise.resolve({ requestId: "profile-req", source: "generated" }),
    callSaveUserPreferencesRpc: (
      _ctx: RpcContext,
      _payload: RpcPayload,
      _requestId: RpcRequestId,
    ) => Promise.resolve({ data: [rpcRow], error: null }),
    syncStudentProfilesTargets: (_ctx, targets) => {
      syncedTargets.push({
        examId: targets.targetExamId,
        levelId: targets.targetLevelId,
      });
      return Promise.resolve();
    },
    processPreferencesResult: (row, context) =>
      __testing.processPreferencesResult(row, context, {
        applyMetadata: (payload) => {
          if (payload) {
            metadataApplied.push(payload);
          }
          return Promise.resolve();
        },
        emitEvent: (payload) => {
          emitted.push(payload);
          return Promise.resolve();
        },
        now: () => context.startedAt + 30,
      }),
  });

  const response = await __testing.handleSavePreferencesRequest(
    buildJsonRequest(endpointUrl, {
      target_exam_id: 42,
      target_level_id: 7,
    }),
    deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.request_id, "profile-req");
  assertEquals(body.source, "profile_edit");
  assertEquals(body.should_refresh_session, false);
  assertEquals(metadataApplied.length, 0);
  assertEquals(emitted.length, 1);
  assertEquals(emitted[0].request_id, "profile-req");
  assertEquals(syncedTargets, [{ examId: 42, levelId: 7 }]);
});

Deno.test("handleSavePreferencesRequest short-circuits repeated request ids to guarantee idempotency", async () => {
  const metadataApplied: JsonRecord[] = [];
  const emitted: SaveUserPreferencesEventPayload[] = [];
  let cache: JsonRecord | null = null;
  let rpcCalls = 0;
  const rpcRow = { ...baseRow, request_id: "retry-token" };

  const deps = createHandlerDeps({
    resolveRequestId: () =>
      Promise.resolve({ requestId: "retry-token", source: "header" }),
    callSaveUserPreferencesRpc: (
      _ctx: RpcContext,
      _payload: RpcPayload,
      _requestId: RpcRequestId,
    ) => {
      rpcCalls += 1;
      return Promise.resolve({ data: [rpcRow], error: null });
    },
    processPreferencesResult: (row, context) =>
      __testing.processPreferencesResult(row, context, {
        applyMetadata: (payload) => {
          if (payload) {
            metadataApplied.push(payload);
          }
          return Promise.resolve();
        },
        emitEvent: (payload) => {
          emitted.push(payload);
          return Promise.resolve();
        },
        now: () => context.startedAt + 40,
      }),
    readCachedResponse: () => Promise.resolve(cache),
    writeCachedResponse: (_fn, _requestId, _userId, payload) => {
      cache = payload;
      return Promise.resolve();
    },
    now: () => 10,
  });

  const firstResponse = await __testing.handleSavePreferencesRequest(
    buildJsonRequest(endpointUrl, {
      full_name: "Retry User",
      full_name_provided: true,
    }),
    deps,
  );
  const secondResponse = await __testing.handleSavePreferencesRequest(
    buildJsonRequest(endpointUrl, {
      full_name: "Retry User",
      full_name_provided: true,
    }),
    deps,
  );

  const firstBody = await firstResponse.json();
  const secondBody = await secondResponse.json();
  assertEquals(rpcCalls, 1);
  assertEquals(emitted.length, 1);
  assertEquals(metadataApplied.length, 1);
  assertEquals(secondBody, firstBody);
  assertEquals(cache, firstBody);
  assertEquals(firstResponse.headers.get("x-request-id"), "retry-token");
  assertEquals(secondResponse.headers.get("x-request-id"), "retry-token");
});

Deno.test("handleSavePreferencesRequest returns 502 when the RPC changes the request id", async () => {
  const deps = createHandlerDeps({
    resolveRequestId: () =>
      Promise.resolve({ requestId: "edge-mismatch", source: "generated" }),
    callSaveUserPreferencesRpc: (
      _ctx: RpcContext,
      _payload: RpcPayload,
      _requestId: RpcRequestId,
    ) =>
      Promise.resolve({
        data: [{ ...baseRow, request_id: "rpc-other" }],
        error: null,
      }),
  });

  const response = await __testing.handleSavePreferencesRequest(
    buildJsonRequest(endpointUrl, {
      full_name: "Mismatch User",
      full_name_provided: true,
    }),
    deps,
  );

  assertEquals(response.status, 502);
  assertEquals(response.headers.get("x-request-id"), "edge-mismatch");
  const body = await response.json();
  assertEquals(body.request_id, "edge-mismatch");
  assertEquals(body.error, "The operation returned an unexpected identifier.");
});

Deno.test("handleSavePreferencesRequest maps RPC domain errors to HTTP responses", async () => {
  let processCalled = false;
  const deps = createHandlerDeps({
    callSaveUserPreferencesRpc: (
      _ctx: RpcContext,
      _payload: RpcPayload,
      _requestId: RpcRequestId,
    ) =>
      Promise.resolve({
        data: null,
        error: {
          message: "STUDENT_MEMBERSHIP_REQUIRED",
          details: "",
          hint:
            "Target exam and level updates require an active student membership.",
          code: "P0001",
        },
      }),
    processPreferencesResult: () => {
      processCalled = true;
      return Promise.reject(
        new Error(
          "processPreferencesResult should not be called when the RPC returns an error",
        ),
      );
    },
  });

  const response = await __testing.handleSavePreferencesRequest(
    buildJsonRequest(endpointUrl, {
      target_exam_id: 1,
      target_level_id: 2,
    }),
    deps,
  );

  assertEquals(response.status, 422);
  const body = await response.json();
  assertEquals(
    body.error,
    "You need an active student membership before setting a learning goal.",
  );
  assertEquals(body.code, "STUDENT_MEMBERSHIP_REQUIRED");
  assertEquals(processCalled, false);
});

Deno.test("handleSavePreferencesRequest propagates auth failures", async () => {
  const deps = createHandlerDeps({
    requireAuth: () =>
      Promise.reject(new HttpError(401, "Invalid or expired access token")),
  });

  const response = await __testing.handleSavePreferencesRequest(
    buildJsonRequest(endpointUrl, {
      full_name: "Blocked User",
      full_name_provided: true,
    }),
    deps,
  );

  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error, "Invalid or expired access token");
});

Deno.test("handleSavePreferencesRequest relays should_refresh_session=true even without metadata payload", async () => {
  const emitted: SaveUserPreferencesEventPayload[] = [];
  const deps = createHandlerDeps({
    resolveRequestId: () =>
      Promise.resolve({ requestId: "req-refresh", source: "generated" }),
    callSaveUserPreferencesRpc: (
      _ctx: RpcContext,
      _payload: RpcPayload,
      _requestId: RpcRequestId,
    ) =>
      Promise.resolve({
        data: [
          {
            ...baseRow,
            metadata_payload: null,
            should_refresh_session: true,
            source: "profile_edit",
            request_id: "req-refresh",
          },
        ],
        error: null,
      }),
    processPreferencesResult: (row, context) =>
      __testing.processPreferencesResult(row, context, {
        applyMetadata: () => Promise.resolve(),
        emitEvent: (payload) => {
          emitted.push(payload);
          return Promise.resolve();
        },
        now: () => context.startedAt + 20,
      }),
  });

  const response = await __testing.handleSavePreferencesRequest(
    buildJsonRequest(endpointUrl, { target_exam_id: 9, target_level_id: 3 }),
    deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.request_id, "req-refresh");
  assertEquals(body.should_refresh_session, true);
  assertEquals(emitted.length, 1);
});

Deno.test("processPreferencesResult handles initial setup flow and fires event", async () => {
  const applied: Array<Record<string, unknown> | null> = [];
  const emitted: SaveUserPreferencesEventPayload[] = [];

  const result = await __testing.processPreferencesResult(baseRow, {
    requestId: "rpc-request-id",
    userId: "user-123",
    startedAt: 100,
  }, {
    applyMetadata: (payload) => {
      applied.push(payload);
      return Promise.resolve();
    },
    emitEvent: (payload) => {
      emitted.push(payload);
      return Promise.resolve();
    },
    now: () => 175,
  });

  assertEquals(result.source, "initial_setup");
  assertEquals(result.should_refresh_session, true);
  assertEquals(result.metadata_payload, baseRow.metadata_payload);
  assertEquals(result.request_id, "rpc-request-id");
  assertEquals(result.duration_ms, 60);

  assertEquals(applied.length, 1);
  assertEquals(applied[0], baseRow.metadata_payload);

  assertEquals(emitted.length, 1);
  assertEquals(emitted[0], {
    request_id: "rpc-request-id",
    user_id: "user-123",
    target_exam_id: null,
    target_level_id: null,
    source: "initial_setup",
    duration_ms: 60,
  });
});

Deno.test("processPreferencesResult rejects when the RPC omits request_id", async () => {
  await assertRejects(
    () =>
      __testing.processPreferencesResult({ ...baseRow, request_id: null }, {
        requestId: "edge-req",
        userId: "user-123",
        startedAt: 0,
      }, {
        applyMetadata: () => Promise.resolve(),
        emitEvent: () => Promise.resolve(),
        now: () => 0,
      }),
    HttpError,
    "The operation did not return a valid request_id.",
  );
});

Deno.test("processPreferencesResult rejects when the RPC request_id differs from the Edge Function id", async () => {
  await assertRejects(
    () =>
      __testing.processPreferencesResult({
        ...baseRow,
        request_id: "rpc-other",
      }, {
        requestId: "edge-req",
        userId: "user-123",
        startedAt: 0,
      }, {
        applyMetadata: () => Promise.resolve(),
        emitEvent: () => Promise.resolve(),
        now: () => 0,
      }),
    HttpError,
    "The operation returned an unexpected identifier.",
  );
});

Deno.test("processPreferencesResult normalizes profile edit response and preserves should_refresh_session flag", async () => {
  const profileEditRow = {
    ...baseRow,
    source: "profile_edit",
    target_exam_id: "42",
    target_level_id: 5,
    should_refresh_session: false,
    metadata_payload: null,
    request_id: "profile-edit-req",
    duration_ms: null,
  };

  const result = await __testing.processPreferencesResult(profileEditRow, {
    requestId: "profile-edit-req",
    userId: "user-123",
    startedAt: 10,
  }, {
    applyMetadata: () => Promise.resolve(),
    emitEvent: () => Promise.resolve(),
    now: () => 40,
  });

  assertEquals(result.source, "profile_edit");
  assertEquals(result.target_exam_id, 42);
  assertEquals(result.target_level_id, 5);
  assertEquals(result.should_refresh_session, false);
  assertEquals(result.request_id, "profile-edit-req");
  assertEquals(result.duration_ms, 30);
});

Deno.test("handleSavePreferencesError maps membership constraint violations to HTTP 422", () => {
  const error = {
    message: "STUDENT_MEMBERSHIP_REQUIRED",
    hint: "Target exam and level updates require an active student membership.",
  };

  const thrown = assertThrows(() =>
    __testing.handleSavePreferencesError(
      error,
      { requestId: "err-req" },
    )
  ) as HttpError;

  assertEquals(thrown.status, 422);
  const details = isPlainRecord(thrown.details) ? thrown.details : {};
  const code = typeof details.code === "string" ? details.code : null;
  const requestId = typeof details.request_id === "string"
    ? details.request_id
    : null;
  assertEquals(code, "STUDENT_MEMBERSHIP_REQUIRED");
  assertEquals(requestId, "err-req");
});

Deno.test("applyMetadataWithRetry retries once before surfacing sync errors", async () => {
  const payload = { app_metadata: { active_role: "student" } };
  let attempts = 0;

  await __testing.applyMetadataWithRetry(payload, {
    userId: "user-123",
    requestId: "req-1",
  }, {
    applyOnce: () => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error("transient"));
      }
      return Promise.resolve();
    },
  });

  assertEquals(attempts, 2);
});

Deno.test("applyMetadataWithRetry surfaces 502 when both attempts fail", async () => {
  const payload = { app_metadata: { active_role: "student" } };

  await assertRejects(
    () =>
      __testing.applyMetadataWithRetry(payload, {
        userId: "user-123",
        requestId: "req-2",
      }, {
        applyOnce: () => Promise.reject(new Error("permanent")),
        maxAttempts: 2,
      }),
    HttpError,
    "We couldn't sync your session. Try again.",
  );
});
