import { sendTransactionalEmail } from "./email.ts";
import { buildLoginReminderTemplate } from "./templates/login-reminder.ts";

export interface SendLoginReminderEmailInput {
  to: string;
  academyName: string;
  authUrl: string;
  requestId: string;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
}

const defaultDependencies = {
  sendEmail: sendTransactionalEmail,
};

export type SendLoginReminderEmailDependencies = typeof defaultDependencies;

export async function sendLoginReminderEmail(
  input: SendLoginReminderEmailInput,
  deps: SendLoginReminderEmailDependencies = defaultDependencies,
): Promise<void> {
  const template = buildLoginReminderTemplate({
    academyName: input.academyName,
    authUrl: input.authUrl,
  });

  await deps.sendEmail({
    to: input.to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    requestId: input.requestId,
    idempotencyKey: input.idempotencyKey ??
      `${input.requestId}:login-reminder:${input.to}`,
    tags: input.tags,
  });
}
