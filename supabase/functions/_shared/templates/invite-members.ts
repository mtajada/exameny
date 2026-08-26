import {
  buildAuthUrl,
  formatAuthMethodList,
  type InviteRole,
  normalizeAcademyName,
  resolveAuthMethodFlags,
  ROLE_LABELS,
  toHumanDate,
  wrapEmailLayout,
} from "./template-helpers.ts";

export interface InviteMembersTemplateInput {
  academyName: string;
  role: InviteRole;
  siteUrl: string;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  /**
   * Phase 5 requires reminder copy/subject whenever admins resend invites.
   */
  isResend?: boolean;
}

export interface InviteMembersTemplateOutput {
  subject: string;
  html: string;
  text: string;
  ctaUrl: string;
}

const buildSubscriptionHtml = (
  startHuman: string | null,
  endHuman: string | null,
): string => {
  if (startHuman && endHuman) {
    return `<p style="margin:4px 0;color:#0f172a;">Access window: <strong>${startHuman}</strong> → <strong>${endHuman}</strong></p>`;
  }
  if (startHuman) {
    return `<p style="margin:4px 0;color:#0f172a;">Your access starts on <strong>${startHuman}</strong>.</p>`;
  }
  if (endHuman) {
    return `<p style="margin:4px 0;color:#0f172a;">Your access remains available until <strong>${endHuman}</strong>.</p>`;
  }
  return "";
};

const buildSubscriptionText = (
  startHuman: string | null,
  endHuman: string | null,
): string | null => {
  if (startHuman && endHuman) {
    return `Access window: ${startHuman} → ${endHuman}.`;
  }
  if (startHuman) {
    return `Your access starts on ${startHuman}.`;
  }
  if (endHuman) {
    return `Your access remains available until ${endHuman}.`;
  }
  return null;
};

export function buildInviteMembersTemplate(
  input: InviteMembersTemplateInput,
): InviteMembersTemplateOutput {
  const academyName = normalizeAcademyName(input.academyName);
  const authUrl = buildAuthUrl(input.siteUrl);
  const roleLabel = ROLE_LABELS[input.role] ?? "Member";
  const isResend = Boolean(input.isResend);
  const baseSubject = `Your academy ${academyName} gave you access to Exameny`;
  const subject = isResend ? `Reminder: ${baseSubject}` : baseSubject;
  const ctaLabel = "Access Exameny";
  const startHuman = toHumanDate(input.subscriptionStartDate ?? null);
  const endHuman = toHumanDate(input.subscriptionEndDate ?? null);
  const authFlags = resolveAuthMethodFlags();
  const authMethodList = formatAuthMethodList(authFlags);
  const signInCopy = `sign in with ${authMethodList}`;

  const subscriptionHtml = buildSubscriptionHtml(startHuman, endHuman);
  const subscriptionText = buildSubscriptionText(startHuman, endHuman);
  const introCopy = isResend
    ? `${academyName} already granted you Exameny access as <strong>${roleLabel}</strong>. This reminder keeps the invitation active until you sign in with this email.`
    : `Your academy ${academyName} gave you Exameny access as <strong>${roleLabel}</strong>.`;
  const detailBlock = `
    <div style="margin:20px 0;padding:16px;background:#f9fafb;border-radius:12px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 4px;color:#0f172a;">Assigned role: <strong>${roleLabel}</strong></p>
      ${subscriptionHtml}
    </div>
  `;
  const bulletList = `
    <ul style="margin:16px 0;padding-left:24px;color:#475467;font-size:14px;line-height:1.6;">
      <li>Open <a href="${authUrl}" style="color:#2563eb;">${authUrl}</a> and ${signInCopy}.</li>
      <li>Use the same email address that received this invitation.</li>
      <li>There is no unique link; the invitation remains available until you sign in.</li>
      <li>Need help? Reply to this email or contact your academy administrator.</li>
    </ul>
  `;

  const html = wrapEmailLayout({
    academyName,
    footerPrefix: "Invitation managed by",
    innerHtml: `
      <p style="font-size:14px;color:#475467;margin:0 0 8px;">Hi,</p>
      <p style="font-size:16px;color:#0f172a;margin:0;line-height:1.6;">
        ${introCopy}
      </p>
      ${detailBlock}
      <p style="font-size:15px;color:#0f172a;margin:16px 0;line-height:1.6;">
        Use the button to open /auth and ${signInCopy} using this same email.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${authUrl}"
           style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:600;padding:14px 28px;border-radius:999px;text-decoration:none;">
          ${ctaLabel}
        </a>
      </div>
      ${bulletList}
      <p style="font-size:14px;color:#475467;margin:24px 0 0;">
        Don't recognize this invitation? Reply to this email or contact your academy administrator.
      </p>
    `,
  });

  const lines: string[] = [
    isResend
      ? `${academyName} already granted you Exameny access as ${roleLabel}.`
      : `${academyName} gave you Exameny access as ${roleLabel}.`,
    `Go to ${authUrl} and ${signInCopy}.`,
    "Use the same email that received this invitation.",
    "The invitation stays active until you sign in with this address.",
    "There is no unique link; just sign in when you are ready.",
  ];
  if (subscriptionText) {
    lines.push(subscriptionText);
  }
  lines.push(
    "Need help? Reply to this email or contact your academy administrator.",
  );

  const text = lines.join("\n");

  return {
    subject,
    html,
    text,
    ctaUrl: authUrl,
  };
}
