const REQUEST_ID_HEADER = "x-request-id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestIdSource = "header" | "generated";

export interface RequestIdResolution {
  requestId: string;
  source: RequestIdSource;
}

function readHeaderRequestId(headers: Headers): string | null {
  const rawValue = headers.get(REQUEST_ID_HEADER) ??
    headers.get(REQUEST_ID_HEADER.toUpperCase());
  if (!rawValue) {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!UUID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function generateRequestId(): string {
  // Avoid PostgREST RPC calls for request ids.
  // PostgREST does not support schema-qualified function names in `/rpc/*` (e.g. `extensions.gen_random_uuid`),
  // and this adds latency + noisy 404s in API logs. A UUIDv4 from the Edge runtime is sufficient for tracing.
  return crypto.randomUUID();
}

export async function resolveRequestId(
  headers: Headers,
): Promise<RequestIdResolution> {
  const fromHeader = readHeaderRequestId(headers);
  if (fromHeader) {
    return { requestId: fromHeader, source: "header" };
  }
  const generated = await Promise.resolve(generateRequestId());
  return { requestId: generated, source: "generated" };
}
