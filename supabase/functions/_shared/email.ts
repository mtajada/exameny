import { HttpError } from "./http-errors.ts";

interface EmailTag {
  name: string;
  value: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  requestId: string;
  idempotencyKey?: string;
  tags?: EmailTag[];
  replyTo?: string;
}

interface EmailDependencies {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

function getEnvOptional(key: string): string | undefined {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

interface EmailProviderConfig {
  apiUrl: string;
  apiKey: string;
  fromEmail: string;
  maxAttempts: number;
  backoffMs: number;
}

function resolveEmailProviderConfig(): EmailProviderConfig {
  const apiUrl = getEnvOptional("RESEND_API_URL") ??
    "https://api.resend.com/emails";
  const apiKey = getEnvOptional("RESEND_API_KEY") ?? "";
  const fromEmail = getEnvOptional("RESEND_FROM_EMAIL") ?? "";
  const maxAttempts = Number(
    getEnvOptional("EMAIL_PROVIDER_MAX_ATTEMPTS") ?? "3",
  );
  const backoffMs = Number(
    getEnvOptional("EMAIL_PROVIDER_BACKOFF_MS") ?? "250",
  );
  return {
    apiUrl,
    apiKey,
    fromEmail,
    maxAttempts,
    backoffMs,
  };
}

const defaultDependencies: EmailDependencies = {
  fetchImpl: fetch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => performance.now(),
};

const sanitizeTags = (tags?: EmailTag[]) => {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .filter((tag) => Boolean(tag?.name) && Boolean(tag?.value))
    .map((tag) => ({
      name: String(tag.name),
      value: String(tag.value),
    }));
};

const buildPayload = (input: SendEmailInput, config: EmailProviderConfig) => {
  if (!config.fromEmail || !config.apiKey) {
    throw new HttpError(500, "Email provider is not configured.");
  }

  return {
    from: config.fromEmail,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    reply_to: input.replyTo ?? undefined,
    tags: sanitizeTags(input.tags),
  };
};

async function attemptSend(
  input: SendEmailInput,
  deps: EmailDependencies,
  config: EmailProviderConfig,
  attempt: number,
): Promise<void> {
  const payload = buildPayload(input, config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await deps.fetchImpl(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey ??
          `${input.requestId}:${input.to}:${attempt}`,
        "X-Request-Id": input.requestId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "unknown");
      throw new Error(
        `Email provider error ${response.status}: ${text.slice(0, 200)}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
  deps: EmailDependencies = defaultDependencies,
): Promise<void> {
  const config = resolveEmailProviderConfig();
  if (!config.fromEmail || !config.apiKey) {
    throw new HttpError(500, "Email provider is not configured.");
  }

  const attempts = Math.max(
    1,
    Math.min(5, Number.isFinite(config.maxAttempts) ? config.maxAttempts : 3),
  );
  const backoff = Math.max(
    100,
    Number.isFinite(config.backoffMs) ? config.backoffMs : 250,
  );

  let lastError: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await attemptSend(input, deps, config, i + 1);
      return;
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await deps.sleep(backoff * (i + 1));
      }
    }
  }

  const message = lastError instanceof Error
    ? lastError.message
    : "Failed to send transactional email.";
  throw new Error(message);
}
