import assert from "node:assert/strict";

import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";

function withEnv(key: string, value: string | null): () => void {
  const previous = Deno.env.get(key);
  if (value === null) {
    try {
      Deno.env.delete(key);
    } catch {
      // ignore when absent
    }
  } else {
    Deno.env.set(key, value);
  }

  return () => {
    if (previous === undefined) {
      try {
        Deno.env.delete(key);
      } catch {
        // ignore when absent
      }
    } else {
      Deno.env.set(key, previous);
    }
  };
}

Deno.test("hosted runtime fails closed when ALLOWED_ORIGINS is missing", () => {
  const restoreOrigins = withEnv("ALLOWED_ORIGINS", null);
  const restoreUrl = withEnv("SUPABASE_URL", "https://example.supabase.co");
  try {
    const request = new Request("https://example.com", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:8080" },
    });
    const headers = createCorsHeaders(request);

    assert.strictEqual(headers["Access-Control-Allow-Origin"], undefined);
    assert.strictEqual(
      headers["Access-Control-Allow-Headers"]?.includes("x-request-id"),
      true,
    );
    assert.throws(() => ensureAllowedOrigin(request), /Origin is not allowed/);
  } finally {
    restoreUrl();
    restoreOrigins();
  }
});

Deno.test("explicit allowlist echoes only the matching normalized origin", () => {
  const restoreOrigins = withEnv(
    "ALLOWED_ORIGINS",
    "http://localhost:8080/, https://app.example.org",
  );
  const restoreUrl = withEnv("SUPABASE_URL", "https://example.supabase.co");
  try {
    const request = new Request("https://example.com", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:8080" },
    });
    const headers = createCorsHeaders(request);
    assert.strictEqual(
      headers["Access-Control-Allow-Origin"],
      "http://localhost:8080",
    );
    assert.strictEqual(headers["Access-Control-Allow-Credentials"], "true");
    assert.strictEqual(
      headers["Access-Control-Allow-Headers"]?.includes("x-request-id"),
      true,
    );
    ensureAllowedOrigin(request);
  } finally {
    restoreUrl();
    restoreOrigins();
  }
});

Deno.test("explicit allowlist rejects a different origin", () => {
  const restoreOrigins = withEnv("ALLOWED_ORIGINS", "https://app.example.org");
  const restoreUrl = withEnv("SUPABASE_URL", "https://example.supabase.co");
  try {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { Origin: "https://untrusted.example" },
    });

    assert.strictEqual(
      createCorsHeaders(request)["Access-Control-Allow-Origin"],
      undefined,
    );
    assert.throws(() => ensureAllowedOrigin(request), /Origin is not allowed/);
  } finally {
    restoreUrl();
    restoreOrigins();
  }
});

Deno.test("local runtime has a finite localhost fallback without a wildcard", () => {
  const restoreOrigins = withEnv("ALLOWED_ORIGINS", null);
  const restoreUrl = withEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  try {
    const request = new Request("http://127.0.0.1:54321", {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:8080" },
    });
    const headers = createCorsHeaders(request);

    assert.strictEqual(
      headers["Access-Control-Allow-Origin"],
      "http://127.0.0.1:8080",
    );
    ensureAllowedOrigin(request);
  } finally {
    restoreUrl();
    restoreOrigins();
  }
});
