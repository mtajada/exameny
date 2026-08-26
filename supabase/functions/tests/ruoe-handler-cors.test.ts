Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("EXAMENY_SUPABASE_SECRET_KEY", "test-service-role-key");
Deno.env.set("EXAMENY_SUPABASE_PUBLISHABLE_KEY", "test-anon-key");

import { assertEquals } from "std/testing/asserts.ts";

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

const { createRuoEHandler } = await import("../_shared/ruoe-handler.ts");

const handler = createRuoEHandler({
  layout: "ruoe-mc-cloze",
  template: {
    frontMatter: { system_prompt: "test" },
    body: "test",
  },
  buildPromptContext: () => ({ tokens: {} }),
});

Deno.test("createRuoEHandler preflight echoes allowed origin when allowlist is set", async () => {
  const restore = withEnv("ALLOWED_ORIGINS", "http://localhost:8080");
  try {
    const request = new Request("https://example.com", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:8080" },
    });
    const response = await handler(request);
    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "http://localhost:8080",
    );
    assertEquals(
      response.headers.get("Access-Control-Allow-Credentials"),
      "true",
    );
    assertEquals(response.headers.get("Vary"), "Origin");
  } finally {
    restore();
  }
});

Deno.test("createRuoEHandler rejects disallowed origin on preflight when allowlist is set", async () => {
  const restore = withEnv("ALLOWED_ORIGINS", "http://localhost:8080");
  try {
    const request = new Request("https://example.com", {
      method: "OPTIONS",
      headers: { Origin: "http://evil.com" },
    });
    const response = await handler(request);
    assertEquals(response.status, 403);
  } finally {
    restore();
  }
});

Deno.test("createRuoEHandler blocks disallowed origin on POST when allowlist is set", async () => {
  const restore = withEnv("ALLOWED_ORIGINS", "http://localhost:8080");
  try {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: {
        Origin: "http://evil.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskTypeId: 1 }),
    });
    const response = await handler(request);
    assertEquals(response.status, 403);
    const json = await response.json();
    assertEquals(json.success, false);
    assertEquals(json.error, "Origin is not allowed");
  } finally {
    restore();
  }
});
