import {
  formatAuthMethodList,
  normalizeAcademyName,
  resolveAuthMethodFlags,
  wrapEmailLayout,
} from "./template-helpers.ts";

export interface LoginReminderTemplateInput {
  academyName: string;
  authUrl?: string | null;
}

export interface LoginReminderTemplateOutput {
  subject: string;
  html: string;
  text: string;
  ctaUrl: string;
}

const DEFAULT_AUTH_URL = "http://127.0.0.1:8080/auth";

const resolveAuthUrl = (value?: string | null): string => {
  if (!value || typeof value !== "string") {
    return DEFAULT_AUTH_URL;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_AUTH_URL;
};

export function buildLoginReminderTemplate(
  input: LoginReminderTemplateInput,
): LoginReminderTemplateOutput {
  const academyName = normalizeAcademyName(input.academyName);
  const authUrl = resolveAuthUrl(input.authUrl);
  const subject = `Reminder: log back in to Exameny for ${academyName}`;
  const authFlags = resolveAuthMethodFlags();
  const authMethodList = formatAuthMethodList(authFlags);

  const html = wrapEmailLayout({
    academyName,
    footerPrefix: "Reminder managed by",
    innerHtml: `
      <p style="font-size:14px;color:#475467;margin:0 0 8px;">Hi,</p>
      <p style="font-size:16px;color:#0f172a;margin:0;line-height:1.6;">
        ${academyName} keeps your Exameny access ready. Just sign in again at /auth with the same email that received this reminder.
      </p>
      <p style="font-size:15px;color:#0f172a;margin:16px 0;line-height:1.6;">
        Use ${authMethodList} with this same email. Staying on this address ensures we connect you to the correct academy.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${authUrl}"
           style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:600;padding:14px 28px;border-radius:999px;text-decoration:none;">
          Access Exameny
        </a>
      </div>
      <ul style="margin:16px 0;padding-left:24px;color:#475467;font-size:14px;line-height:1.6;">
        <li>Open ${authUrl} whenever you need to resume.</li>
        <li>Choose ${authMethodList} to match the email that received invites.</li>
        <li>Your access stays active until you sign in again—no special link is required.</li>
      </ul>
      <p style="font-size:14px;color:#475467;margin:24px 0 0;">
        Need help or don't recognize this reminder? Contact your academy administrator.
      </p>
    `,
  });

  const text = [
    `${academyName} keeps your Exameny access ready.`,
    `Log in at ${authUrl} using ${authMethodList}.`,
    "Use the same email that received this reminder.",
    "Your access stays active until you sign in again—no special link is required.",
    "Need help? Contact your academy administrator.",
  ].join("\n");

  return {
    subject,
    html,
    text,
    ctaUrl: authUrl,
  };
}
