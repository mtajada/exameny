import { assertEquals } from "std/testing/asserts.ts";
import { buildUserSetActiveAcademyHandler } from "../user-set-active-academy/index.ts";
import type { AuthContext } from "../_shared/auth.ts";
import type { SetActiveAcademySuccessPayload } from "../_shared/events.ts";
import { buildJsonRequest } from "./utils/request.ts";

type RpcError = { message?: string; code?: string };
type RpcResponse<T> = { data: T | null; error: RpcError | null };

type MembershipRow = {
  id: number;
  academy_id: number;
  user_id: string | null;
  email: string;
  role: string;
  status: string;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  created_at: string;
  updated_at: string;
};

type MetadataPayload = {
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

type SetActiveAcademyRpcRow = {
  membership: MembershipRow;
  metadata_payload: MetadataPayload;
  should_refresh_session: boolean;
  request_id: string;
};

type SupabaseRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<RpcResponse<SetActiveAcademyRpcRow>>;
};

type AuthContextWithRpc = Omit<AuthContext, "supabase"> & {
  supabase: SupabaseRpcClient;
};

type UpdateUserResult = {
  data: { user: unknown } | null;
  error: { message?: string } | null;
};

type ServiceRoleClient = {
  auth: {
    admin: {
      updateUserById: (
        uid: string,
        attributes: Record<string, unknown>,
      ) => PromiseLike<UpdateUserResult>;
    };
  };
};

type MockSupabase = SupabaseRpcClient;
type UpdateUserById = ServiceRoleClient["auth"]["admin"]["updateUserById"];

function createServiceRoleClientMock(
  updater?: UpdateUserById,
): ServiceRoleClient {
  const update = updater ??
    (() => Promise.resolve({ data: null, error: null }));
  return {
    auth: {
      admin: {
        updateUserById: update,
      },
    },
  };
}

type MembershipMetadataInput = {
  membership_id?: number;
  academy_id: number;
  status?: string;
};

const buildUser = (
  overrides: Partial<AuthContextWithRpc["user"]> = {},
): AuthContextWithRpc["user"] => ({
  id: "user-123",
  aud: "authenticated",
  created_at: "2024-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  ...overrides,
});

function createAuthContext(
  supabase: MockSupabase,
  academyId: number | null,
  memberships?: MembershipMetadataInput[],
): AuthContextWithRpc {
  const metadataMemberships = memberships && memberships.length > 0
    ? memberships
    : (
      academyId !== null
        ? [{ membership_id: 1001, academy_id: academyId, status: "active" }]
        : []
    );

  const primaryMembershipId = metadataMemberships[0]?.membership_id ??
    (academyId !== null ? 1001 : null);

  const user = buildUser({
    email: "user@example.test",
    app_metadata: {
      memberships: metadataMemberships,
      active_academy_id: academyId,
    },
  });

  return {
    supabase,
    user,
    profile: {
      id: "user-123",
      email: "user@example.test",
      role: "teacher",
      academy_id: academyId,
      membership_id: primaryMembershipId,
      full_name: "Test User",
      platform_role: null,
    },
    authorization: "Bearer test-token",
  };
}

const noopCors = (): Record<string, string> => ({});
const noopEnsureOrigin = () => undefined;
const constantPerf = () => 100;
const buildResolveRequestId = (value: string) => () =>
  Promise.resolve({ requestId: value, source: "generated" as const });

Deno.test("successful switch applies metadata and emits event", async () => {
  const metadataPayload = {
    app_metadata: { active_academy_id: 77 },
    user_metadata: { full_name: "Test User" },
  };

  const supabase: MockSupabase = {
    rpc: (fn, params) => {
      assertEquals(fn, "set_active_academy");
      assertEquals(params, {
        p_academy_id: 77,
        p_request_id: "edge-request-id",
      });
      return Promise.resolve({
        data: {
          membership: {
            id: 501,
            academy_id: 77,
            user_id: "user-123",
            email: "user@example.test",
            role: "teacher",
            status: "active",
            subscription_start_date: null,
            subscription_end_date: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
          metadata_payload: metadataPayload,
          should_refresh_session: true,
          request_id: "edge-request-id",
        },
        error: null,
      });
    },
  };

  const authContext = createAuthContext(supabase, 55, [
    { membership_id: 1001, academy_id: 55, status: "active" },
    { membership_id: 2002, academy_id: 77, status: "active" },
  ]);
  const updateCalls: Array<{ id: string; attrs: Record<string, unknown> }> = [];
  const eventCalls: SetActiveAcademySuccessPayload[] = [];

  const handler = buildUserSetActiveAcademyHandler({
    requireAuth: () => Promise.resolve(authContext),
    getServiceRoleClient: () =>
      createServiceRoleClientMock(
        (id: string, attrs: Record<string, unknown>) => {
          updateCalls.push({ id, attrs });
          return Promise.resolve({ data: null, error: null });
        },
      ),
    emitSetActiveAcademySuccess: (payload) => {
      eventCalls.push(payload);
      return Promise.resolve();
    },
    createCorsHeaders: noopCors,
    ensureAllowedOrigin: noopEnsureOrigin,
    performanceNow: (() => {
      let current = 0;
      return () => {
        current += 5;
        return current;
      };
    })(),
    resolveRequestId: buildResolveRequestId("edge-request-id"),
  });

  const response = await handler(
    buildJsonRequest(
      "https://edge.test/user-set-active-academy",
      { academy_id: 77 },
      { "x-request-id": "edge-request-id" },
    ),
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("x-request-id"), "edge-request-id");

  const body = await response.json();
  assertEquals(body.membership_id, 501);
  assertEquals(body.membership.id, 501);
  assertEquals(body.membership.email, "user@example.test");
  assertEquals(body.metadata_payload, metadataPayload);
  assertEquals(body.should_refresh_session, true);
  assertEquals(body.request_id, "edge-request-id");

  assertEquals(updateCalls.length, 1);
  assertEquals(updateCalls[0].id, "user-123");
  assertEquals(updateCalls[0].attrs, metadataPayload);

  assertEquals(eventCalls.length, 1);
  assertEquals(eventCalls[0].previous_academy_id, 55);
  assertEquals(eventCalls[0].new_academy_id, 77);
  assertEquals(eventCalls[0].request_id, "edge-request-id");
  assertEquals(eventCalls[0].duration_ms, 5);
  assertEquals(eventCalls[0].role, "teacher");
});

Deno.test("mismatched request ids return 502 without applying metadata", async () => {
  const supabase: MockSupabase = {
    rpc: () =>
      Promise.resolve({
        data: {
          membership: {
            id: 1,
            academy_id: 77,
            user_id: "user-123",
            email: "user@example.test",
            role: "teacher",
            status: "active",
            subscription_start_date: null,
            subscription_end_date: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
          metadata_payload: {
            app_metadata: { active_academy_id: 77 },
            user_metadata: { full_name: "Test User" },
          },
          should_refresh_session: true,
          request_id: "rpc-generated-id",
        },
        error: null,
      }),
  };

  const authContext = createAuthContext(supabase, 55, [
    { membership_id: 1001, academy_id: 55, status: "active" },
    { membership_id: 2002, academy_id: 77, status: "active" },
  ]);

  let metadataCalled = false;
  let eventCalled = false;

  const handler = buildUserSetActiveAcademyHandler({
    requireAuth: () => Promise.resolve(authContext),
    getServiceRoleClient: () =>
      createServiceRoleClientMock(() => {
        metadataCalled = true;
        return Promise.resolve({ data: null, error: null });
      }),
    emitSetActiveAcademySuccess: () => {
      eventCalled = true;
      return Promise.resolve();
    },
    createCorsHeaders: noopCors,
    ensureAllowedOrigin: noopEnsureOrigin,
    performanceNow: constantPerf,
    resolveRequestId: buildResolveRequestId("edge-request-id"),
  });

  const response = await handler(
    buildJsonRequest(
      "https://edge.test/user-set-active-academy",
      { academy_id: 77 },
      { "x-request-id": "edge-request-id" },
    ),
  );
  assertEquals(response.status, 502);
  assertEquals(response.headers.get("x-request-id"), "edge-request-id");
  const body = await response.json();
  assertEquals(body.request_id, "edge-request-id");
  assertEquals(body.error, "The operation returned an unexpected identifier");
  assertEquals(metadataCalled, false);
  assertEquals(eventCalled, false);
});

Deno.test("academy not owned returns 403 with copy", async () => {
  let rpcCalls = 0;
  const supabase: MockSupabase = {
    rpc: () => {
      rpcCalls += 1;
      return Promise.resolve({
        data: null,
        error: { message: "SHOULD_NOT_BE_CALLED" },
      });
    },
  };
  const authContext = createAuthContext(supabase, null, []);

  const handler = buildUserSetActiveAcademyHandler({
    requireAuth: () => Promise.resolve(authContext),
    getServiceRoleClient: () => createServiceRoleClientMock(),
    emitSetActiveAcademySuccess: () => Promise.resolve(),
    createCorsHeaders: noopCors,
    ensureAllowedOrigin: noopEnsureOrigin,
    performanceNow: constantPerf,
    resolveRequestId: buildResolveRequestId("edge-request-id"),
  });

  const response = await handler(
    buildJsonRequest(
      "https://edge.test/user-set-active-academy",
      { academy_id: 99 },
      { "x-request-id": "edge-request-id" },
    ),
  );
  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.error, "Unable to change academy, please try again");
  assertEquals(body.request_id, "edge-request-id");
  assertEquals(rpcCalls, 0);
});

Deno.test("RPC ACADEMY_NOT_OWNED is surfaced with localized copy", async () => {
  const supabase: MockSupabase = {
    rpc: () =>
      Promise.resolve({
        data: null,
        error: { message: "ACADEMY_NOT_OWNED" },
      }),
  };
  const authContext = createAuthContext(supabase, 77, [
    { membership_id: 1010, academy_id: 77, status: "active" },
  ]);

  const handler = buildUserSetActiveAcademyHandler({
    requireAuth: () => Promise.resolve(authContext),
    getServiceRoleClient: () => createServiceRoleClientMock(),
    emitSetActiveAcademySuccess: () => Promise.resolve(),
    createCorsHeaders: noopCors,
    ensureAllowedOrigin: noopEnsureOrigin,
    performanceNow: constantPerf,
    resolveRequestId: buildResolveRequestId("edge-request-id"),
  });

  const response = await handler(
    buildJsonRequest(
      "https://edge.test/user-set-active-academy",
      { academy_id: 77 },
      { "x-request-id": "edge-request-id" },
    ),
  );
  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.error, "Unable to change academy, please try again");
  assertEquals(body.request_id, "edge-request-id");
});

Deno.test("RPC validation failure surfaces as 422", async () => {
  const supabase: MockSupabase = {
    rpc: () =>
      Promise.resolve({
        data: null,
        error: { message: "INVALID_STATUS", code: "P0001" },
      }),
  };
  const authContext = createAuthContext(supabase, null, [
    { membership_id: 2001, academy_id: 10, status: "active" },
  ]);

  const handler = buildUserSetActiveAcademyHandler({
    requireAuth: () => Promise.resolve(authContext),
    getServiceRoleClient: () => createServiceRoleClientMock(),
    emitSetActiveAcademySuccess: () => Promise.resolve(),
    createCorsHeaders: noopCors,
    ensureAllowedOrigin: noopEnsureOrigin,
    performanceNow: constantPerf,
    resolveRequestId: buildResolveRequestId("edge-request-id"),
  });

  const response = await handler(
    buildJsonRequest(
      "https://edge.test/user-set-active-academy",
      { academy_id: 10 },
      { "x-request-id": "edge-request-id" },
    ),
  );
  assertEquals(response.status, 422);
  const body = await response.json();
  assertEquals(body.error, "INVALID_STATUS");
});

Deno.test("idempotent switch returns should_refresh_session from RPC", async () => {
  const metadataPayload = {
    app_metadata: { active_academy_id: 10 },
    user_metadata: { target_exam_id: 1 },
  };
  const supabase: MockSupabase = {
    rpc: (_fn, _params) =>
      Promise.resolve({
        data: {
          membership: {
            id: 42,
            academy_id: 10,
            user_id: "user-123",
            email: "user@example.test",
            role: "student",
            status: "active",
            subscription_start_date: null,
            subscription_end_date: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
          metadata_payload: metadataPayload,
          should_refresh_session: false,
          request_id: "edge-request-id",
        },
        error: null,
      }),
  };

  const authContext = createAuthContext(supabase, 10, [
    { membership_id: 3001, academy_id: 10, status: "active" },
  ]);
  let updateCalled = false;

  const handler = buildUserSetActiveAcademyHandler({
    requireAuth: () => Promise.resolve(authContext),
    getServiceRoleClient: () =>
      createServiceRoleClientMock(() => {
        updateCalled = true;
        return Promise.resolve({ data: null, error: null });
      }),
    emitSetActiveAcademySuccess: () => Promise.resolve(),
    createCorsHeaders: noopCors,
    ensureAllowedOrigin: noopEnsureOrigin,
    performanceNow: constantPerf,
    resolveRequestId: buildResolveRequestId("edge-request-id"),
  });

  const response = await handler(
    buildJsonRequest(
      "https://edge.test/user-set-active-academy",
      { academy_id: 10 },
      { "x-request-id": "edge-request-id" },
    ),
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("x-request-id"), "edge-request-id");
  const body = await response.json();
  assertEquals(body.should_refresh_session, false);
  assertEquals(body.request_id, "edge-request-id");
  assertEquals(updateCalled, false);
});

Deno.test("metadata sync failures propagate the RPC request id to the error response", async () => {
  const metadataPayload = {
    app_metadata: { active_academy_id: 10 },
    user_metadata: { full_name: "Test User" },
  };
  const supabase: MockSupabase = {
    rpc: () =>
      Promise.resolve({
        data: {
          membership: {
            id: 42,
            academy_id: 10,
            user_id: "user-123",
            email: "user@example.test",
            role: "student",
            status: "active",
            subscription_start_date: null,
            subscription_end_date: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
          metadata_payload: metadataPayload,
          should_refresh_session: true,
          request_id: "edge-request-id",
        },
        error: null,
      }),
  };

  const authContext = createAuthContext(supabase, 10, [
    { membership_id: 3001, academy_id: 10, status: "active" },
  ]);

  const handler = buildUserSetActiveAcademyHandler({
    requireAuth: () => Promise.resolve(authContext),
    getServiceRoleClient: () =>
      createServiceRoleClientMock(() =>
        Promise.resolve({ data: null, error: { message: "metadata failure" } })
      ),
    emitSetActiveAcademySuccess: () => Promise.resolve(),
    createCorsHeaders: noopCors,
    ensureAllowedOrigin: noopEnsureOrigin,
    performanceNow: constantPerf,
    resolveRequestId: buildResolveRequestId("edge-request-id"),
  });

  const response = await handler(
    buildJsonRequest(
      "https://edge.test/user-set-active-academy",
      { academy_id: 10 },
      { "x-request-id": "edge-request-id" },
    ),
  );
  assertEquals(response.status, 500);
  assertEquals(response.headers.get("x-request-id"), "edge-request-id");
  const body = await response.json();
  assertEquals(body.request_id, "edge-request-id");
  assertEquals(body.error, "Failed to apply user metadata");
});

Deno.test("handler validates membership ownership before calling RPC", async () => {
  let rpcCalled = false;
  const supabase: MockSupabase = {
    rpc: () => {
      rpcCalled = true;
      return Promise.resolve({ data: null, error: null });
    },
  };
  const authContext = createAuthContext(supabase, 55, [
    { membership_id: 1001, academy_id: 55, status: "active" },
  ]);

  const handler = buildUserSetActiveAcademyHandler({
    requireAuth: () => Promise.resolve(authContext),
    getServiceRoleClient: () => createServiceRoleClientMock(),
    emitSetActiveAcademySuccess: () => Promise.resolve(),
    createCorsHeaders: noopCors,
    ensureAllowedOrigin: noopEnsureOrigin,
    performanceNow: constantPerf,
    resolveRequestId: buildResolveRequestId("edge-request-id"),
  });

  const response = await handler(
    buildJsonRequest(
      "https://edge.test/user-set-active-academy",
      { academy_id: 999 },
      { "x-request-id": "edge-request-id" },
    ),
  );
  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.error, "Unable to change academy, please try again");
  assertEquals(rpcCalled, false);
});
