import { assert, assertEquals, assertThrows } from "std/testing/asserts.ts";

import { HttpError } from "../_shared/http-errors.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

Deno.env.set("ALLOWED_ORIGINS", "http://localhost:5173");

const { handleStatusRpcError, createHandler } =
  (await import("../admin-membership-status/index.ts")).__testing;

type HandlerDeps = NonNullable<Parameters<typeof createHandler>[0]> extends
  Partial<infer T> ? T : never;
type AuthContextWithRpc = Awaited<
  ReturnType<HandlerDeps["authenticateAdminRequest"]>
>;
type RpcReturn = ReturnType<AuthContextWithRpc["supabase"]["rpc"]>;

type RpcSpy = (name: string, params: Record<string, unknown>) => void;
type RpcPayload = Record<string, unknown> | null;

const buildRpcReturn = (payload: RpcPayload): RpcReturn => ({
  single: <T>() => Promise.resolve({ data: payload as T | null, error: null }),
});

const buildAuthContext = (
  payload: RpcPayload,
  onRpc?: RpcSpy,
): AuthContextWithRpc => ({
  user: {
    id: "admin-user",
    aud: "authenticated",
    role: "authenticated",
    email: "admin@example.com",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    last_sign_in_at: "2024-01-01T00:00:00.000Z",
    identities: [],
    app_metadata: {},
    user_metadata: {},
  },
  profile: {
    id: "admin-user",
    email: "admin@example.com",
    role: "academy_admin",
    academy_id: 1,
    membership_id: 1,
    full_name: "Admin User",
    platform_role: null,
  },
  authorization: "Bearer test",
  supabase: {
    rpc: (name: string, params?: Record<string, unknown>): RpcReturn => {
      const rpcParams = params ?? {};
      onRpc?.(name, rpcParams);
      return buildRpcReturn(payload);
    },
  },
});

const buildStatusRequest = (body: Record<string, unknown>): Request =>
  new Request("https://example.supabase.test/admin-membership-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost:5173",
    },
    body: JSON.stringify(body),
  });

Deno.test("handleStatusRpcError surfaces alias guidance for MEMBERSHIP_OWNERSHIP_CONFLICT", () => {
  const error = assertThrows(
    () =>
      handleStatusRpcError(
        {
          message: "MEMBERSHIP_OWNERSHIP_CONFLICT",
          details:
            "membership_id=42 email_login=alias@example.com email_membership=member@example.com user_id=user-1",
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
    membership_id: 42,
    user_id: "user-1",
    email_login: "alias@example.com",
    email_membership: "member@example.com",
  });
});

Deno.test("handler applies metadata sync when RPC requests a session refresh", async () => {
  const metadataCalls: Array<
    { userId: string; payload: unknown; copy: string }
  > = [];
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];

  const handler = createHandler({
    createCorsHeaders: () => ({}),
    ensureAllowedOrigin: () => undefined,
    resolveRequestId: () =>
      Promise.resolve({ requestId: "req-refresh", source: "generated" }),
    authenticateAdminRequest: () =>
      Promise.resolve(
        buildAuthContext({
          membership_id: 77,
          academy_id: 5,
          user_id: "member-refresh",
          role: "student",
          status: "active",
          metadata_payload: {
            app_metadata: { synced_user_id: "member-refresh" },
          },
          should_refresh_session: true,
          request_id: "req-refresh",
        }, (name, params) => rpcCalls.push({ name, params })),
      ),
    applyMetadataSync: (userId, payload, copy) => {
      metadataCalls.push({ userId, payload, copy });
      return Promise.resolve();
    },
  });

  const response = await handler(
    buildStatusRequest({ membership_id: 77, action: "activate" }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.request_id, "req-refresh");
  assertEquals(body.should_refresh_session, true);
  assertEquals(body.metadata_payload, {
    app_metadata: { synced_user_id: "member-refresh" },
  });
  assertEquals(body.membership_id, 77);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0]?.params.p_request_id, "req-refresh");
  assertEquals(metadataCalls.length, 1);
  const firstCall = metadataCalls[0];
  assertEquals(firstCall.userId, "member-refresh");
  assertEquals(firstCall.payload, {
    app_metadata: { synced_user_id: "member-refresh" },
  });
  assertEquals(
    firstCall.copy,
    "We could not refresh the session after updating the status. Try again.",
  );
});

Deno.test("handler applies metadata sync even when refresh flag is false", async () => {
  const metadataCalls: Array<
    { userId: string; payload: unknown; copy: string }
  > = [];
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const handler = createHandler({
    createCorsHeaders: () => ({}),
    ensureAllowedOrigin: () => undefined,
    resolveRequestId: () =>
      Promise.resolve({ requestId: "req-skip", source: "generated" }),
    authenticateAdminRequest: () =>
      Promise.resolve(
        buildAuthContext({
          membership_id: 88,
          academy_id: 10,
          user_id: "member-skip",
          role: "teacher",
          status: "inactive",
          metadata_payload: {
            app_metadata: { synced_user_id: "member-skip" },
          },
          should_refresh_session: false,
          request_id: "req-skip",
        }, (name, params) => rpcCalls.push({ name, params })),
      ),
    applyMetadataSync: (userId, payload, copy) => {
      metadataCalls.push({ userId, payload, copy });
      return Promise.resolve();
    },
  });

  const response = await handler(
    buildStatusRequest({ membership_id: 88, action: "deactivate" }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.request_id, "req-skip");
  assertEquals(body.should_refresh_session, false);
  assertEquals(body.metadata_payload, {
    app_metadata: { synced_user_id: "member-skip" },
  });
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0]?.params.p_request_id, "req-skip");
  assertEquals(metadataCalls.length, 1);
  const [call] = metadataCalls;
  assertEquals(call.userId, "member-skip");
  assertEquals(call.payload, {
    app_metadata: { synced_user_id: "member-skip" },
  });
  assertEquals(
    call.copy,
    "We could not refresh the session after updating the status. Try again.",
  );
});

Deno.test("handler skips metadata sync when payload is null", async () => {
  const metadataCalls: Array<unknown> = [];
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const handler = createHandler({
    createCorsHeaders: () => ({}),
    ensureAllowedOrigin: () => undefined,
    resolveRequestId: () =>
      Promise.resolve({ requestId: "req-null", source: "generated" }),
    authenticateAdminRequest: () =>
      Promise.resolve(
        buildAuthContext({
          membership_id: 99,
          academy_id: 12,
          user_id: "member-null",
          role: "student",
          status: "active",
          metadata_payload: null,
          should_refresh_session: false,
          request_id: "req-null",
        }, (name, params) => rpcCalls.push({ name, params })),
      ),
    applyMetadataSync: () => {
      metadataCalls.push("called");
      return Promise.resolve();
    },
  });

  const response = await handler(
    buildStatusRequest({ membership_id: 99, action: "activate" }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.request_id, "req-null");
  assertEquals(body.metadata_payload, null);
  assertEquals(body.should_refresh_session, false);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0]?.params.p_request_id, "req-null");
  assertEquals(metadataCalls.length, 0);
});

Deno.test("handler returns 500 when refresh flag lacks user_id context", async () => {
  const handler = createHandler({
    createCorsHeaders: () => ({}),
    ensureAllowedOrigin: () => undefined,
    resolveRequestId: () =>
      Promise.resolve({
        requestId: "req-missing-user",
        source: "generated",
      }),
    authenticateAdminRequest: () =>
      Promise.resolve(
        buildAuthContext({
          membership_id: 55,
          academy_id: 3,
          user_id: null,
          role: "student",
          status: "active",
          metadata_payload: {
            app_metadata: { synced_user_id: "missing" },
          },
          should_refresh_session: true,
          request_id: "req-missing-user",
        }),
      ),
    applyMetadataSync: () => Promise.resolve(),
  });

  const response = await handler(
    buildStatusRequest({ membership_id: 55, action: "activate" }),
  );
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.request_id, "req-missing-user");
  assertEquals(
    body.error,
    "We could not refresh the session after updating the status. Try again.",
  );
});

Deno.test("handler rejects RPC request_id mismatch", async () => {
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const handler = createHandler({
    createCorsHeaders: () => ({}),
    ensureAllowedOrigin: () => undefined,
    resolveRequestId: () =>
      Promise.resolve({
        requestId: "req-edge",
        source: "generated",
      }),
    authenticateAdminRequest: () =>
      Promise.resolve(
        buildAuthContext({
          membership_id: 12,
          academy_id: 3,
          user_id: "user-edge",
          role: "student",
          status: "active",
          metadata_payload: null,
          should_refresh_session: false,
          request_id: "rpc-mismatch",
        }, (name, params) => rpcCalls.push({ name, params })),
      ),
    applyMetadataSync: () => Promise.resolve(),
  });

  const response = await handler(
    buildStatusRequest({ membership_id: 12, action: "activate" }),
  );
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.request_id, "req-edge");
  assertEquals(body.code, "REQUEST_ID_MISMATCH");
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0]?.params.p_request_id, "req-edge");
});
