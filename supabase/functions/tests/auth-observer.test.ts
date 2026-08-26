import { assertEquals } from "std/testing/asserts.ts";

import type { AuthLoginAttemptEventPayload } from "../_shared/events.ts";

const module = await import("../auth-observer/index.ts");
const { buildAuthObserverHandler } = module;

type HandlerDeps = Parameters<typeof buildAuthObserverHandler>[0];

const createRequest = (
  body: unknown,
  headers: Record<string, string> = {},
): Request =>
  new Request("https://edge.test/auth-observer", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

Deno.test("auth-observer emits normalized success payload", async () => {
  const emitted: AuthLoginAttemptEventPayload[] = [];
  const handler = buildAuthObserverHandler(
    {
      emitAuthLoginAttempt: (payload) => {
        emitted.push(payload);
        return Promise.resolve();
      },
      resolveRequestId: () =>
        Promise.resolve({ requestId: "req-login", source: "generated" }),
      getAuthObserverToken: () => "observer-token",
    } satisfies HandlerDeps,
  );

  const request = createRequest({
    event: "user_signed_in",
    user: { id: "user-1", email: "USER@example.com " },
    session: { provider_id: "google", created_at: "2024-05-01T10:00:00Z" },
  }, { "x-auth-observer-token": "observer-token" });

  const response = await handler(request);
  assertEquals(response.status, 202);
  const body = await response.json();
  assertEquals(body.request_id, "req-login");
  assertEquals(emitted.length, 1);
  assertEquals(emitted[0], {
    request_id: "req-login",
    user_id: "user-1",
    email_normalizado: "user@example.com",
    provider: "google",
    outcome: "success",
    timestamp: "2024-05-01T10:00:00.000Z",
  });
});

Deno.test("auth-observer marks failed attempts and falls back to now timestamp", async () => {
  const emitted: AuthLoginAttemptEventPayload[] = [];
  const handler = buildAuthObserverHandler(
    {
      emitAuthLoginAttempt: (payload) => {
        emitted.push(payload);
        return Promise.resolve();
      },
      resolveRequestId: () =>
        Promise.resolve({ requestId: "req-failure", source: "generated" }),
      getAuthObserverToken: () => "observer-token",
      now: () => "2024-06-01T00:00:00.000Z",
    } satisfies HandlerDeps,
  );

  const request = createRequest({
    type: "USER_SIGN_IN_FAILED",
    record: { user_id: "  user-2  " },
  }, { "x-auth-observer-token": "observer-token" });

  const response = await handler(request);
  assertEquals(response.status, 202);
  const payload = emitted[0];
  assertEquals(payload.outcome, "failure");
  assertEquals(payload.provider, "unknown");
  assertEquals(payload.timestamp, "2024-06-01T00:00:00.000Z");
});

Deno.test("auth-observer rejects missing token", async () => {
  const handler = buildAuthObserverHandler(
    {
      resolveRequestId: () =>
        Promise.resolve({ requestId: "req-unauth", source: "generated" }),
      getAuthObserverToken: () => "observer-token",
    } satisfies HandlerDeps,
  );

  const request = createRequest({ event: "user_signed_in" });
  const response = await handler(request);
  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.request_id, "req-unauth");
  assertEquals(body.error, "Unauthorized request.");
});
