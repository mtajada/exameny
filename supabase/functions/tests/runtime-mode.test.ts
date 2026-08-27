import {
  areE2EFixturesEnabled,
  isLocalSupabaseUrl,
} from "../_shared/runtime-mode.ts";

Deno.test("local Supabase runtime URLs are narrowly recognized", () => {
  for (
    const url of [
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "http://[::1]:54321",
      "http://kong:8000",
    ]
  ) {
    if (!isLocalSupabaseUrl(url)) {
      throw new Error(`Expected ${url} to be treated as local.`);
    }
  }

  for (
    const url of [
      "https://example.supabase.co",
      "https://127.0.0.1.example.com",
      "https://kong:8000",
      "http://kong.example.com:8000",
      "not-a-url",
      null,
    ]
  ) {
    if (isLocalSupabaseUrl(url)) {
      throw new Error(`Expected ${url} to be rejected as non-local.`);
    }
  }
});

Deno.test("E2E fixtures require local development and an explicit flag", () => {
  const localConfiguration = {
    supabaseUrl: "http://127.0.0.1:54321",
    appEnv: "development",
    fixturesFlag: "true",
  };

  if (!areE2EFixturesEnabled(localConfiguration)) {
    throw new Error(
      "Expected explicit local development fixtures to be enabled.",
    );
  }

  const rejectedConfigurations = [
    { ...localConfiguration, supabaseUrl: "https://example.supabase.co" },
    { ...localConfiguration, appEnv: "production" },
    { ...localConfiguration, fixturesFlag: "false" },
  ];

  for (const configuration of rejectedConfigurations) {
    if (areE2EFixturesEnabled(configuration)) {
      throw new Error(
        `Expected fixture configuration to be rejected: ${
          JSON.stringify(configuration)
        }`,
      );
    }
  }
});
