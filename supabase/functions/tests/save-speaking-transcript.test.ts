import { assert, assertEquals } from "std/testing/asserts.ts";
import type { AuthContext } from "../_shared/auth.ts";
import { HttpError } from "../_shared/http-errors.ts";

const { createHandler, parsePayload } =
  (await import("../save-speaking-transcript/index.ts")).__testing;

const SESSION_ID = "00000000-0000-4000-8000-000000000123";

const transcript = {
  version: 1,
  source: "typed-rehearsal",
  full_text: "This client-supplied value must not be trusted.",
  turns: [
    {
      speaker: "agent",
      start_ms: 0,
      end_ms: 0,
      text: "What would you suggest?",
      filler_count: null,
      wpm: null,
      ignored_private_field: "drop me",
    },
    {
      speaker: "user",
      start_ms: 100,
      end_ms: 5_000,
      text: "We could invite local volunteers.",
      filler_count: 0,
      wpm: 61.2,
    },
  ],
};

const buildContext = (): AuthContext => ({
  user: {
    id: "learner-user",
    aud: "authenticated",
    role: "authenticated",
    email: "learner@example.test",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    identities: [],
    app_metadata: {},
    user_metadata: {},
  },
  profile: {
    id: "learner-user",
    email: "learner@example.test",
    role: "student",
    academy_id: 1,
    membership_id: 10,
    full_name: null,
    platform_role: null,
  },
  authorization: "Bearer test",
  supabase: {} as AuthContext["supabase"],
});

const request = (body: unknown): Request =>
  new Request("https://example.test/save-speaking-transcript", {
    method: "POST",
    headers: {
      authorization: "Bearer test",
      "content-type": "application/json",
      origin: "http://localhost:8080",
    },
    body: JSON.stringify(body),
  });

const baseDependencies = {
  createCorsHeaders: () => ({}),
  ensureAllowedOrigin: () => undefined,
  resolveRequestId: () =>
    Promise.resolve({
      requestId: "00000000-0000-4000-8000-000000000999",
      source: "generated" as const,
    }),
  requireAuth: () => Promise.resolve(buildContext()),
};

Deno.test("save-speaking-transcript verifies ownership before the restricted RPC", async () => {
  const calls: string[] = [];
  let savedTranscript: unknown = null;
  const handler = createHandler({
    ...baseDependencies,
    requireAuth: (_request, options) => {
      assertEquals(options, {
        allowedRoles: ["student"],
        requireAcademy: true,
      });
      calls.push("auth:student");
      return Promise.resolve(buildContext());
    },
    verifySessionAccess: (_context, sessionId) => {
      calls.push(`verify:${sessionId}`);
      return Promise.resolve();
    },
    persistTranscript: (sessionId, normalizedTranscript) => {
      calls.push(`persist:${sessionId}`);
      savedTranscript = normalizedTranscript;
      return Promise.resolve();
    },
  });

  const response = await handler(
    request({ sessionId: SESSION_ID, transcript }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(calls, [
    "auth:student",
    `verify:${SESSION_ID}`,
    `persist:${SESSION_ID}`,
  ]);
  assertEquals(savedTranscript, {
    version: 1,
    source: "typed-rehearsal",
    full_text:
      "Partner: What would you suggest?\nLearner: We could invite local volunteers.",
    turns: [
      {
        speaker: "agent",
        start_ms: 0,
        end_ms: 0,
        text: "What would you suggest?",
        filler_count: null,
        wpm: null,
      },
      {
        speaker: "user",
        start_ms: 100,
        end_ms: 5_000,
        text: "We could invite local volunteers.",
        filler_count: 0,
        wpm: 61.2,
      },
    ],
  });
});

Deno.test("save-speaking-transcript does not persist a session hidden by RLS", async () => {
  let persisted = false;
  const handler = createHandler({
    ...baseDependencies,
    verifySessionAccess: () =>
      Promise.reject(
        new HttpError(
          404,
          "The speaking session was not found or does not belong to your account.",
        ),
      ),
    persistTranscript: () => {
      persisted = true;
      return Promise.resolve();
    },
  });

  const response = await handler(
    request({ sessionId: SESSION_ID, transcript }),
  );

  assertEquals(response.status, 404);
  assertEquals(persisted, false);
});

Deno.test("save-speaking-transcript rejects provider-shaped or non-alternating input", () => {
  let rejectedProvider = false;
  try {
    parsePayload({
      sessionId: SESSION_ID,
      transcript: { ...transcript, source: "external-provider" },
    });
  } catch (error) {
    assert(error instanceof HttpError);
    assertEquals(error.status, 400);
    rejectedProvider = true;
  }
  assert(rejectedProvider);

  let rejectedTurnOrder = false;
  try {
    parsePayload({
      sessionId: SESSION_ID,
      transcript: {
        ...transcript,
        turns: [transcript.turns[0], transcript.turns[0]],
      },
    });
  } catch (error) {
    assert(error instanceof HttpError);
    assertEquals(error.status, 400);
    rejectedTurnOrder = true;
  }
  assert(rejectedTurnOrder);
});

Deno.test("save-speaking-transcript rejects oversized bodies before persistence", async () => {
  let persisted = false;
  const handler = createHandler({
    ...baseDependencies,
    verifySessionAccess: () => Promise.resolve(),
    persistTranscript: () => {
      persisted = true;
      return Promise.resolve();
    },
  });

  const response = await handler(
    request({
      sessionId: SESSION_ID,
      transcript,
      ignored: "x".repeat(33_000),
    }),
  );

  assertEquals(response.status, 413);
  assertEquals(persisted, false);
});
