interface E2EFixtureConfiguration {
  supabaseUrl: string | null | undefined;
  appEnv: string | null | undefined;
  fixturesFlag: string | null | undefined;
}

export function isLocalSupabaseUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false;

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    // Supabase CLI injects the internal Kong URL into local Edge containers.
    // Hosted projects expose their public project URL instead.
    return hostname === "127.0.0.1" || hostname === "localhost" ||
      hostname === "::1" || hostname === "[::1]" ||
      (parsedUrl.protocol === "http:" && hostname === "kong" &&
        parsedUrl.port === "8000");
  } catch {
    return false;
  }
}

export function areE2EFixturesEnabled(
  configuration: E2EFixtureConfiguration,
): boolean {
  return isLocalSupabaseUrl(configuration.supabaseUrl) &&
    (configuration.appEnv ?? "").trim().toLowerCase() === "development" &&
    (configuration.fixturesFlag ?? "").trim().toLowerCase() === "true";
}
