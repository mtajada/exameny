import { assertEquals } from "std/testing/asserts.ts";
import type { MembershipAliasConflictLoggedEventPayload } from "../_shared/events.ts";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

Deno.env.set("SUPABASE_URL", "https://example.supabase.test");
Deno.env.set("EXAMENY_SUPABASE_PUBLISHABLE_KEY", "anon-key");
Deno.env.set("EXAMENY_SUPABASE_SECRET_KEY", "service-role-key");
Deno.env.set("LOG_ALIAS_CONFLICT_TOKEN", "internal-secret");

const {
  buildLogMembershipAliasConflictHandler,
  __testing: { persistAliasConflict },
} = await import("../log-membership-alias-conflict/index.ts");

const noopOrigin = () => undefined;
const DEFAULT_REQUEST_ID = "00000000-0000-4000-8000-000000000000";

function createRequest(
  body: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request("https://edge.test/log-membership-alias-conflict", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": DEFAULT_REQUEST_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

Deno.test("rejects missing internal token", async () => {
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: noopOrigin,
    persist: () => Promise.reject(new Error("should not persist")),
    emitEvent: () => Promise.resolve(),
    now: () => 0,
    internalToken: "secret-token",
  });

  const response = await handler(createRequest({}));
  assertEquals(response.status, 401);
  const payload = await response.json();
  assertEquals(payload.error, "Unauthorized request.");
});

Deno.test("skips origin enforcement for valid internal token", async () => {
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: () => {
      throw new Error("origin should not be enforced for internal calls");
    },
    persist: (input) =>
      Promise.resolve({
        id: 1,
        user_id: input.userId,
        email_login: input.emailLogin,
        email_membership: input.emailMembership,
        request_id: input.requestId,
        detected_at: "2024-01-01T00:00:00.000Z",
        resolved_at: null,
        resolver_id: null,
      }),
    emitEvent: () => Promise.resolve(),
    now: () => 0,
    internalToken: "secret-token",
  });

  const response = await handler(createRequest({
    email_login: "user@example.com",
    email_membership: "user@example.com",
    request_id: "8b88d8e6-27b3-4b52-84e2-ff3a8c3271d1",
  }, { Authorization: "Bearer secret-token" }));

  assertEquals(response.status, 200);
});

Deno.test("enforces origin when token is missing", async () => {
  let originChecks = 0;
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: () => {
      originChecks += 1;
    },
    persist: () => Promise.reject(new Error("should not persist")),
    emitEvent: () => Promise.resolve(),
    now: () => 0,
    internalToken: "secret-token",
  });

  const response = await handler(createRequest({
    email_login: "user@example.com",
    email_membership: "user@example.com",
    request_id: "cd58d65a-80af-4c88-9b1f-2377657cbf4d",
  }));

  assertEquals(originChecks, 1);
  assertEquals(response.status, 401);
  const missingTokenPayload = await response.json();
  assertEquals(missingTokenPayload.error, "Unauthorized request.");
});

Deno.test("enforces origin when token is invalid", async () => {
  let originChecks = 0;
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: () => {
      originChecks += 1;
    },
    persist: () => Promise.reject(new Error("should not persist")),
    emitEvent: () => Promise.resolve(),
    now: () => 0,
    internalToken: "secret-token",
  });

  const response = await handler(createRequest({
    email_login: "user@example.com",
    email_membership: "user@example.com",
    request_id: "ec66ceef-5f35-49ef-b57f-0b00d3ad8b6a",
  }, { Authorization: "Bearer bad-token" }));

  assertEquals(originChecks, 1);
  assertEquals(response.status, 403);
  const invalidTokenPayload = await response.json();
  assertEquals(invalidTokenPayload.error, "Forbidden request.");
});

Deno.test("successful insert normalizes emails and emits event", async () => {
  const persistCalls: unknown[] = [];
  const events: MembershipAliasConflictLoggedEventPayload[] = [];

  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: noopOrigin,
    persist: (input) => {
      persistCalls.push(input);
      return Promise.resolve({
        id: 10,
        user_id: input.userId,
        email_login: input.emailLogin,
        email_membership: input.emailMembership,
        request_id: input.requestId,
        detected_at: "2024-05-01T10:00:00.000Z",
        resolved_at: null,
        resolver_id: null,
      });
    },
    emitEvent: (payload) => {
      events.push(payload);
      return Promise.resolve();
    },
    now: (() => {
      let current = 100;
      return () => {
        current += 5;
        return current;
      };
    })(),
    internalToken: "secret-token",
  });

  const response = await handler(createRequest({
    user_id: "B4F1F8B9-AC19-4E18-B56F-9F4A7A38A0B2",
    email_login: " Login+Alias@Example.com ",
    email_membership: "MemberAlias@Example.com ",
    request_id: "3f6be0c3-8a32-4626-bc59-e0c27bfc5d88",
    context: { source: "auth-finalize-signup" },
  }, {
    Authorization: "Bearer secret-token",
  }));

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.email_login, "login+alias@example.com");
  assertEquals(body.email_membership, "memberalias@example.com");
  assertEquals(body.should_refresh_session, false);

  assertEquals(persistCalls.length, 1);
  const call = persistCalls[0];
  if (!isPlainRecord(call)) {
    throw new Error("Expected persist call payload to be an object");
  }
  assertEquals(call.emailLogin, "login+alias@example.com");
  assertEquals(call.emailMembership, "memberalias@example.com");

  assertEquals(events.length, 1);
  assertEquals(events[0].request_id, "3f6be0c3-8a32-4626-bc59-e0c27bfc5d88");
  assertEquals(events[0].duration_ms, 5);
});

Deno.test("rejects emails containing interior whitespace", async () => {
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: noopOrigin,
    persist: () => Promise.reject(new Error("should not persist")),
    emitEvent: () => Promise.resolve(),
    now: () => 0,
    internalToken: "secret-token",
  });

  const response = await handler(createRequest({
    email_login: "login user@example.com",
    email_membership: "member@example.com",
    request_id: "7c3bf7f8-454a-42cb-9c25-3b035c32c4c5",
  }, { Authorization: "Bearer secret-token" }));

  assertEquals(response.status, 422);
  const body = await response.json();
  assertEquals(body.error, "email_login no tiene un formato válido.");
});

Deno.test("duplicate payload returns same row idempotently", async () => {
  let attempts = 0;
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: noopOrigin,
    persist: () => {
      attempts += 1;
      return Promise.resolve({
        id: 77,
        user_id: "00000000-0000-4000-8000-000000000001",
        email_login: "user@example.com",
        email_membership: "user@example.com",
        request_id: "d0e6ad23-16c5-4b8d-a815-1f4a2057a6c4",
        detected_at: "2024-05-02T00:00:00.000Z",
        resolved_at: null,
        resolver_id: null,
      });
    },
    emitEvent: () => Promise.resolve(),
    now: () => 10,
    internalToken: "secret-token",
  });

  const requestPayload = {
    user_id: "00000000-0000-4000-8000-000000000001",
    email_login: "user@example.com",
    email_membership: "user@example.com",
    request_id: "d0e6ad23-16c5-4b8d-a815-1f4a2057a6c4",
  };

  const first = await handler(
    createRequest(requestPayload, { Authorization: "Bearer secret-token" }),
  );
  assertEquals(first.status, 200);
  const firstBody = await first.json();
  assertEquals(firstBody.id, 77);

  const second = await handler(
    createRequest(requestPayload, { Authorization: "Bearer secret-token" }),
  );
  assertEquals(second.status, 200);
  const secondBody = await second.json();
  assertEquals(secondBody.id, 77);
  assertEquals(attempts, 2);
});

Deno.test("allows logging conflicts without a user id", async () => {
  let persistedUserId: string | null | undefined;
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: noopOrigin,
    persist: (input) => {
      persistedUserId = input.userId;
      return Promise.resolve({
        id: 88,
        user_id: input.userId,
        email_login: input.emailLogin,
        email_membership: input.emailMembership,
        request_id: input.requestId,
        detected_at: "2024-06-01T12:00:00.000Z",
        resolved_at: null,
        resolver_id: null,
      });
    },
    emitEvent: () => Promise.resolve(),
    now: () => 50,
    internalToken: "secret-token",
  });

  const response = await handler(createRequest({
    user_id: null,
    email_login: "alias+login@example.com",
    email_membership: "alias+membership@example.com",
    request_id: "69e7cf85-b876-4b74-8d37-76690fee1f51",
  }, { Authorization: "Bearer secret-token" }));

  assertEquals(response.status, 200);
  assertEquals(persistedUserId, null);
  const body = await response.json();
  assertEquals(body.user_id, null);
});

Deno.test("invalid payload surfaces 422", async () => {
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: noopOrigin,
    persist: () => Promise.reject(new Error("should not persist")),
    emitEvent: () => Promise.resolve(),
    now: () => 0,
    internalToken: "secret-token",
  });

  const response = await handler(createRequest({
    email_login: "bad-email",
    request_id: null,
  }, { Authorization: "Bearer secret-token" }));

  assertEquals(response.status, 422);
  const body = await response.json();
  assertEquals(body.request_id, DEFAULT_REQUEST_ID);
});

Deno.test("persistAliasConflict calls the service-only public RPC and preserves identifiers", async () => {
  const aliasRow = {
    id: 123,
    user_id: "00000000-0000-4000-8000-000000000111",
    email_login: "login@example.com",
    email_membership: "membership@example.com",
    request_id: "fe9b9655-3ae4-4ebf-8c77-4c7668fbad21",
    detected_at: "2024-07-01T00:00:00.000Z",
    resolved_at: null,
    resolver_id: null,
  };

  const rpcCalls: Array<{
    functionName: string;
    args: Record<string, unknown>;
  }> = [];

  const mockClient = {
    rpc: (functionName: string, args: Record<string, unknown>) => {
      rpcCalls.push({ functionName, args });
      return {
        single: () =>
          Promise.resolve({
            data: {
              ...aliasRow,
              membership_id: args.p_membership_id,
              payload: args.p_payload,
            },
            error: null,
          }),
      };
    },
  };

  const result = await persistAliasConflict({
    userId: aliasRow.user_id,
    membershipId: 55,
    emailLogin: aliasRow.email_login,
    emailMembership: aliasRow.email_membership,
    requestId: aliasRow.request_id,
    context: { trigger: "test" },
  }, mockClient);

  assertEquals(result, aliasRow);
  assertEquals(rpcCalls, [{
    functionName: "upsert_membership_alias_conflict",
    args: {
      p_user_id: aliasRow.user_id,
      p_membership_id: 55,
      p_email_login: aliasRow.email_login,
      p_email_membership: aliasRow.email_membership,
      p_request_id: aliasRow.request_id,
      p_payload: {
        source: "log-membership-alias-conflict",
        trigger: "test",
      },
    },
  }]);
});

Deno.test("re-logging a conflict surfaces reopened state", async () => {
  let attempt = 0;
  const handler = buildLogMembershipAliasConflictHandler({
    ensureOrigin: noopOrigin,
    persist: () => {
      attempt += 1;
      return Promise.resolve({
        id: 500,
        user_id: "00000000-0000-4000-8000-000000000abc",
        email_login: "alias@login.example.test",
        email_membership: "alias@membership.example.test",
        request_id: "fe1ae8e1-0f5b-4eb7-a58d-5a5d2b32d70f",
        detected_at: "2024-07-02T00:00:00.000Z",
        resolved_at: attempt === 1 ? "2024-07-02T01:00:00.000Z" : null,
        resolver_id: attempt === 1
          ? "00000000-0000-4000-8000-00000000ffff"
          : null,
      });
    },
    emitEvent: () => Promise.resolve(),
    now: () => 0,
    internalToken: "secret-token",
  });

  const payload = {
    email_login: "alias@login.example.test",
    email_membership: "alias@membership.example.test",
    request_id: "fe1ae8e1-0f5b-4eb7-a58d-5a5d2b32d70f",
  };

  const first = await handler(
    createRequest(payload, { Authorization: "Bearer secret-token" }),
  );
  const firstBody = await first.json();
  assertEquals(firstBody.resolved_at, "2024-07-02T01:00:00.000Z");
  assertEquals(firstBody.resolver_id, "00000000-0000-4000-8000-00000000ffff");

  const second = await handler(
    createRequest(payload, { Authorization: "Bearer secret-token" }),
  );
  const secondBody = await second.json();
  assertEquals(secondBody.resolved_at, null);
  assertEquals(secondBody.resolver_id, null);
});
