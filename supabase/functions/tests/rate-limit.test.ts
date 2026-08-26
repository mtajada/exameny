import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "std/testing/asserts.ts";

import {
  __resetRateLimitBackendForTests,
  assertRateLimit,
  enforceRateLimit,
} from "../_shared/rate-limit.ts";
import { HttpError } from "../_shared/http-errors.ts";

function withEnv(key: string, value: string | null): () => void {
  const previous = Deno.env.get(key);
  if (value === null) {
    try {
      Deno.env.delete(key);
    } catch {
      // ignore when the key was absent
    }
  } else {
    Deno.env.set(key, value);
  }
  return () => {
    if (previous === undefined) {
      try {
        Deno.env.delete(key);
      } catch {
        // ignore
      }
    } else {
      Deno.env.set(key, previous);
    }
  };
}

Deno.test("enforceRateLimit honours in-memory fallback when enabled", async () => {
  const restoreEnv = [
    withEnv("RATE_LIMIT_ALLOW_IN_MEMORY_FALLBACK", "true"),
    withEnv("UPSTASH_REDIS_REST_URL", null),
    withEnv("UPSTASH_REDIS_REST_TOKEN", null),
  ];
  __resetRateLimitBackendForTests();

  try {
    const config = { maxRequests: 2, windowMs: 10_000 };
    const keyParts: Array<string | number> = ["test-service", "user", "abc123"];

    const first = await enforceRateLimit(keyParts, config);
    assertEquals(first.allowed, true);
    assertEquals(first.remaining, 1);

    const second = await enforceRateLimit(keyParts, config);
    assertEquals(second.allowed, true);
    assertEquals(second.remaining, 0);

    const third = await enforceRateLimit(keyParts, config);
    assertEquals(third.allowed, false);
    assertEquals(third.remaining, 0);

    assertThrows(() => assertRateLimit(third), HttpError);
  } finally {
    restoreEnv.reverse().forEach((restore) => restore());
    __resetRateLimitBackendForTests();
  }
});

Deno.test("enforceRateLimit auto-enables in-memory fallback for remote dev project", async () => {
  const restoreEnv = [
    withEnv("SUPABASE_URL", "http://127.0.0.1:54321"),
    withEnv("SUPABASE_PROJECT_REF", null),
    withEnv("RATE_LIMIT_ALLOW_IN_MEMORY_FALLBACK", null),
    withEnv("UPSTASH_REDIS_REST_URL", null),
    withEnv("UPSTASH_REDIS_REST_TOKEN", null),
  ];
  __resetRateLimitBackendForTests();

  try {
    const result = await enforceRateLimit(["dev-service", "user", "abc123"], {
      maxRequests: 1,
      windowMs: 10_000,
    });
    assertEquals(result.allowed, true);
    assertEquals(result.remaining, 0);
  } finally {
    restoreEnv.reverse().forEach((restore) => restore());
    __resetRateLimitBackendForTests();
  }
});

Deno.test("enforceRateLimit fails closed when Redis backend is unavailable", async () => {
  const restoreEnv = [
    withEnv("RATE_LIMIT_ALLOW_IN_MEMORY_FALLBACK", null),
    withEnv("UPSTASH_REDIS_REST_URL", null),
    withEnv("UPSTASH_REDIS_REST_TOKEN", null),
  ];
  __resetRateLimitBackendForTests();

  const captured: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args
      .map((value) => {
        if (typeof value === "string") {
          return value;
        }
        if (value instanceof Error) {
          return value.message;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
    if (message) {
      captured.push(message);
    }
  };

  try {
    const error = await assertRejects(
      () =>
        enforceRateLimit(["test-service", "user", "secret-value"], {
          maxRequests: 1,
          windowMs: 10_000,
        }),
      HttpError,
    );

    assertEquals((error as HttpError).status, 503);
  } finally {
    console.error = originalConsoleError;
    restoreEnv.reverse().forEach((restore) => restore());
    __resetRateLimitBackendForTests();
  }

  const combined = captured.join(" ");
  assert(combined.includes("[rate-limit] Backend unavailable"));
  assert(!combined.includes("test-service"));
  assert(!combined.includes("secret-value"));
});

Deno.test("enforceRateLimit posts Upstash pipeline commands as an array payload", async () => {
  const restoreEnv = [
    withEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io"),
    withEnv("UPSTASH_REDIS_REST_TOKEN", "test-token"),
    withEnv("RATE_LIMIT_ALLOW_IN_MEMORY_FALLBACK", null),
  ];
  __resetRateLimitBackendForTests();

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      assert(init);
      assertEquals(init.method, "POST");
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : String(input);
      assert(url.endsWith("/pipeline"));

      assert(init.body);
      const commands = JSON.parse(init.body as string);
      assert(Array.isArray(commands));
      assertEquals(commands.length, 2);
      assert(Array.isArray(commands[0]));
      assert(Array.isArray(commands[1]));
      assertEquals(commands[0][0], "INCR");
      assertEquals(commands[1][0], "PEXPIRE");
      const ttl = Number(commands[1][2]);
      assert(Number.isFinite(ttl));

      const headers = new Headers(init.headers);
      assertEquals(headers.get("Content-Type"), "application/json");
      assertEquals(headers.get("Authorization"), "Bearer test-token");

      const responseBody = JSON.stringify([{ result: "1" }, { result: "OK" }]);
      return Promise.resolve(
        new Response(responseBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;

    const result = await enforceRateLimit(["api", "user", "id123"], {
      maxRequests: 3,
      windowMs: 60_000,
    });

    assertEquals(result.allowed, true);
    assertEquals(result.remaining, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv.reverse().forEach((restore) => restore());
    __resetRateLimitBackendForTests();
  }
});

Deno.test("enforceRateLimit accepts legacy Upstash pipeline result arrays", async () => {
  const restoreEnv = [
    withEnv("UPSTASH_REDIS_REST_URL", "https://legacy.upstash.io"),
    withEnv("UPSTASH_REDIS_REST_TOKEN", "legacy-token"),
    withEnv("RATE_LIMIT_ALLOW_IN_MEMORY_FALLBACK", null),
  ];
  __resetRateLimitBackendForTests();

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (() => {
      const responseBody = JSON.stringify({ result: ["2", "OK"] });
      return Promise.resolve(
        new Response(responseBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;

    const result = await enforceRateLimit(["service", "user", "abc"], {
      maxRequests: 1,
      windowMs: 30_000,
    });

    assertEquals(result.allowed, false);
    assertEquals(result.remaining, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv.reverse().forEach((restore) => restore());
    __resetRateLimitBackendForTests();
  }
});

Deno.test("enforceRateLimit fails closed when Upstash reports a command error", async () => {
  const restoreEnv = [
    withEnv("UPSTASH_REDIS_REST_URL", "https://error.upstash.io"),
    withEnv("UPSTASH_REDIS_REST_TOKEN", "error-token"),
    withEnv("RATE_LIMIT_ALLOW_IN_MEMORY_FALLBACK", null),
  ];
  __resetRateLimitBackendForTests();

  const originalFetch = globalThis.fetch;
  const captured: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(
      args
        .map((
          value,
        ) => (value instanceof Error
          ? value.message
          : typeof value === "string"
          ? value
          : "")
        )
        .filter(Boolean)
        .join(" "),
    );
  };

  try {
    globalThis.fetch = (() => {
      const responseBody = JSON.stringify([{
        error: "rate limit script failure",
      }]);
      return Promise.resolve(
        new Response(responseBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;

    const error = await assertRejects(
      () =>
        enforceRateLimit(["service", "user", "abc"], {
          maxRequests: 1,
          windowMs: 45_000,
        }),
      HttpError,
    );
    assertEquals((error as HttpError).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    restoreEnv.reverse().forEach((restore) => restore());
    __resetRateLimitBackendForTests();
  }

  const combined = captured.join(" ");
  assert(combined.includes("[rate-limit] Storage failure"));
  assert(!combined.includes("service"));
  assert(!combined.includes("abc"));
  assert(!combined.includes("script failure"));
});
