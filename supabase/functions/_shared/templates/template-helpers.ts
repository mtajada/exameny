const DEFAULT_SITE_URL = "http://127.0.0.1:8080";
const DEFAULT_ACADEMY_NAME = "your academy";

export type InviteRole = "student" | "teacher" | "academy_admin";
export type AuthMethodFlags = {
  google: boolean;
  microsoft: boolean;
  magicLink: boolean;
};

export const ROLE_LABELS: Record<InviteRole, string> = {
  student: "Student",
  teacher: "Teacher",
  academy_admin: "Academy administrator",
};

const DEFAULT_AUTH_METHOD_FLAGS: AuthMethodFlags = {
  google: true,
  microsoft: false,
  magicLink: false,
};

const parseBooleanFlag = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const formatListWithOr = (items: string[]): string => {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
};

export const resolveAuthMethodFlags = (): AuthMethodFlags => ({
  google: parseBooleanFlag(
    Deno.env.get("VITE_AUTH_GOOGLE_ENABLED"),
    DEFAULT_AUTH_METHOD_FLAGS.google,
  ),
  microsoft: parseBooleanFlag(
    Deno.env.get("VITE_AUTH_MICROSOFT_ENABLED"),
    DEFAULT_AUTH_METHOD_FLAGS.microsoft,
  ),
  magicLink: parseBooleanFlag(
    Deno.env.get("VITE_AUTH_MAGIC_LINK_ENABLED"),
    DEFAULT_AUTH_METHOD_FLAGS.magicLink,
  ),
});

export const formatAuthMethodList = (
  flags: AuthMethodFlags = resolveAuthMethodFlags(),
): string => {
  const labels: string[] = [];
  if (flags.google) {
    labels.push("Google");
  }
  if (flags.microsoft) {
    labels.push("Microsoft");
  }
  if (flags.magicLink) {
    labels.push("Magic Link");
  }
  if (labels.length === 0) {
    labels.push("Google");
  }
  return formatListWithOr(labels);
};

export const sanitizeSiteUrl = (value?: string | null): string => {
  if (!value || typeof value !== "string") {
    return DEFAULT_SITE_URL;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return DEFAULT_SITE_URL;
  }
  return trimmed.replace(/\/+$/, "");
};

export const buildAuthUrl = (siteUrl?: string | null): string =>
  `${sanitizeSiteUrl(siteUrl)}/auth`;

export const normalizeAcademyName = (value?: string | null): string => {
  if (!value || typeof value !== "string") {
    return DEFAULT_ACADEMY_NAME;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_ACADEMY_NAME;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export const toHumanDate = (value?: string | null): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return DATE_FORMATTER.format(date);
};

interface EmailLayoutOptions {
  academyName: string;
  innerHtml: string;
  footerPrefix?: string;
}

export const wrapEmailLayout = (options: EmailLayoutOptions): string => {
  const academyName = normalizeAcademyName(options.academyName);
  const footerPrefix = options.footerPrefix ?? "Notifications managed by";
  return `
  <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background-color:#f8fafc;padding:32px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 10px 25px rgba(15,23,42,0.08);">
      ${options.innerHtml}
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:16px;">
      Exameny · ${footerPrefix} ${academyName}
    </p>
  </div>
  `.trim();
};
