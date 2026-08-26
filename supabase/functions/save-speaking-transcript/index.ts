import { serve } from "std/http/server.ts";

import {
  type AuthContext,
  getServiceRoleClient,
  requireAuth,
} from "../_shared/auth.ts";
import { createCorsHeaders, ensureAllowedOrigin } from "../_shared/cors.ts";
import { HttpError } from "../_shared/http-errors.ts";
import { buildPublicErrorPayload } from "../_shared/public-error.ts";
import { resolveRequestId } from "../_shared/request-id.ts";

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 32_000;
const MAX_TURNS = 10;
const MAX_TURN_TEXT_LENGTH = 2_000;
const MAX_TRANSCRIPT_TEXT_LENGTH = 12_000;
const MAX_SESSION_DURATION_MS = 7_200_000;

type Speaker = "agent" | "user";

type NormalizedTurn = {
  speaker: Speaker;
  start_ms: number | null;
  end_ms: number | null;
  text: string;
  filler_count: number | null;
  wpm: number | null;
};

type NormalizedTranscript = {
  version: 1;
  source: "typed-rehearsal";
  full_text: string;
  turns: NormalizedTurn[];
};

type SavePayload = {
  sessionId: string;
  transcript: NormalizedTranscript;
};

type HandlerDependencies = {
  createCorsHeaders: typeof createCorsHeaders;
  ensureAllowedOrigin: typeof ensureAllowedOrigin;
  resolveRequestId: typeof resolveRequestId;
  requireAuth: typeof requireAuth;
  verifySessionAccess: (
    context: AuthContext,
    sessionId: string,
  ) => Promise<void>;
  persistTranscript: (
    sessionId: string,
    transcript: NormalizedTranscript,
  ) => Promise<void>;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseNullableInteger(
  value: unknown,
  label: string,
  maximum: number,
): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 ||
    value > maximum
  ) {
    throw new HttpError(400, `${label} must be a valid non-negative integer.`);
  }
  return value;
}

function parseNullableNumber(
  value: unknown,
  label: string,
  maximum: number,
): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    value > maximum
  ) {
    throw new HttpError(400, `${label} is outside the accepted range.`);
  }
  return Math.round(value * 10) / 10;
}

function parseTurn(value: unknown, index: number): NormalizedTurn {
  if (!isPlainRecord(value)) {
    throw new HttpError(400, `Turn ${index + 1} is invalid.`);
  }
  if (value.speaker !== "agent" && value.speaker !== "user") {
    throw new HttpError(400, `Turn ${index + 1} has an invalid speaker.`);
  }
  if (typeof value.text !== "string") {
    throw new HttpError(400, `Turn ${index + 1} must include text.`);
  }
  const text = value.text.trim();
  if (text.length === 0 || text.length > MAX_TURN_TEXT_LENGTH) {
    throw new HttpError(
      400,
      `Turn ${
        index + 1
      } text must contain 1 to ${MAX_TURN_TEXT_LENGTH} characters.`,
    );
  }

  const startMs = parseNullableInteger(
    value.start_ms,
    `Turn ${index + 1} start_ms`,
    MAX_SESSION_DURATION_MS,
  );
  const endMs = parseNullableInteger(
    value.end_ms,
    `Turn ${index + 1} end_ms`,
    MAX_SESSION_DURATION_MS,
  );
  if (startMs !== null && endMs !== null && endMs < startMs) {
    throw new HttpError(400, `Turn ${index + 1} ends before it starts.`);
  }

  return {
    speaker: value.speaker,
    start_ms: startMs,
    end_ms: endMs,
    text,
    filler_count: parseNullableInteger(
      value.filler_count,
      `Turn ${index + 1} filler_count`,
      100,
    ),
    wpm: parseNullableNumber(value.wpm, `Turn ${index + 1} wpm`, 600),
  };
}

function parsePayload(value: unknown): SavePayload {
  if (!isPlainRecord(value)) {
    throw new HttpError(400, "Send a JSON speaking transcript payload.");
  }
  const sessionId = typeof value.sessionId === "string"
    ? value.sessionId.trim()
    : "";
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new HttpError(400, "The speaking session identifier is invalid.");
  }

  if (!isPlainRecord(value.transcript)) {
    throw new HttpError(400, "The transcript is invalid.");
  }
  const transcript = value.transcript;
  if (transcript.version !== 1 || transcript.source !== "typed-rehearsal") {
    throw new HttpError(400, "The transcript format is not supported.");
  }
  if (
    !Array.isArray(transcript.turns) || transcript.turns.length < 2 ||
    transcript.turns.length > MAX_TURNS
  ) {
    throw new HttpError(
      400,
      `A transcript must contain 2 to ${MAX_TURNS} turns.`,
    );
  }

  const turns = transcript.turns.map(parseTurn);
  if (
    turns[0]?.speaker !== "agent" ||
    !turns.some((turn) => turn.speaker === "user")
  ) {
    throw new HttpError(
      400,
      "The transcript must start with the partner and include a learner answer.",
    );
  }
  for (let index = 1; index < turns.length; index += 1) {
    if (turns[index]?.speaker === turns[index - 1]?.speaker) {
      throw new HttpError(400, "Partner and learner turns must alternate.");
    }
  }

  const fullText = turns
    .map((turn) =>
      `${turn.speaker === "agent" ? "Partner" : "Learner"}: ${turn.text}`
    )
    .join("\n");
  if (fullText.length > MAX_TRANSCRIPT_TEXT_LENGTH) {
    throw new HttpError(400, "The transcript is too long.");
  }

  return {
    sessionId,
    transcript: {
      version: 1,
      source: "typed-rehearsal",
      full_text: fullText,
      turns,
    },
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "The transcript payload is too large.");
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "The transcript payload is too large.");
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "The request body must be valid JSON.");
  }
}

async function verifySessionAccess(
  context: AuthContext,
  sessionId: string,
): Promise<void> {
  const { data, error } = await context.supabase
    .from("speaking_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new HttpError(502, "We could not verify the speaking session.");
  }
  if (!data) {
    throw new HttpError(
      404,
      "The speaking session was not found or does not belong to your account.",
    );
  }
  if (data.status !== "active") {
    throw new HttpError(409, "This speaking session is already closed.");
  }
}

async function persistTranscript(
  sessionId: string,
  transcript: NormalizedTranscript,
): Promise<void> {
  const serviceClient = getServiceRoleClient();
  const { error } = await serviceClient.rpc("save_speaking_transcript", {
    p_session_id: sessionId,
    p_transcript: transcript,
  });
  if (error) {
    throw new HttpError(502, "We could not save the speaking transcript.");
  }
}

const defaultDependencies: HandlerDependencies = {
  createCorsHeaders,
  ensureAllowedOrigin,
  resolveRequestId,
  requireAuth,
  verifySessionAccess,
  persistTranscript,
};

function createHandler(
  overrides: Partial<HandlerDependencies> = {},
): (request: Request) => Promise<Response> {
  const deps = { ...defaultDependencies, ...overrides };

  return async (request: Request): Promise<Response> => {
    const corsHeaders = deps.createCorsHeaders(request);
    const headers = { ...corsHeaders, "Content-Type": "application/json" };
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers });
    }

    const { requestId } = await deps.resolveRequestId(request.headers);
    const responseHeaders = { ...headers, "X-Request-Id": requestId };

    try {
      deps.ensureAllowedOrigin(request);
      if (request.method !== "POST") {
        throw new HttpError(405, "Method not allowed.");
      }

      const context = await deps.requireAuth(request, {
        allowedRoles: ["student"],
        requireAcademy: true,
      });
      const payload = parsePayload(await readJsonBody(request));
      await deps.verifySessionAccess(context, payload.sessionId);
      await deps.persistTranscript(payload.sessionId, payload.transcript);

      return new Response(
        JSON.stringify({ success: true, request_id: requestId }),
        { status: 200, headers: responseHeaders },
      );
    } catch (error) {
      const publicError = buildPublicErrorPayload(requestId, error, {
        fallbackError: "We could not save the speaking transcript.",
      });
      return new Response(JSON.stringify(publicError.body), {
        status: publicError.status,
        headers: responseHeaders,
      });
    }
  };
}

export const handler = createHandler();

if (import.meta.main) {
  serve(handler);
}

export const __testing = {
  createHandler,
  parsePayload,
};
