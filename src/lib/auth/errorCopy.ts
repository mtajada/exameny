import type { EdgeFunctionErrorPayload } from '@/lib/auth/edge';

type ErrorCopyResolver = (error: EdgeFunctionErrorPayload) => string;

const FINALIZE_ERROR_FALLBACK = 'We could not sync your account. Try again in a moment.';
export const SELECTOR_ERROR_FALLBACK = "We couldn't update your academy. Try again.";
const SELECTOR_SESSION_EXPIRED_COPY =
  'Your session expired before we could update the academy. Sign in again and retry.';
const SELECTOR_ACCESS_DENIED_COPY =
  'You no longer have access to that academy. Pick a different option or ask your administrator for help.';
const SELECTOR_SCOPE_CONFLICT_COPY =
  'This account cannot control that academy. Contact your platform administrator to proceed.';
const SELECTOR_GENERIC_COPY = SELECTOR_ERROR_FALLBACK;
const ONBOARDING_ERROR_FALLBACK =
  "We couldn't save your onboarding details. Try again or contact your academy administrator.";
const MEMBERSHIP_ALIAS_CONFLICT_COPY =
  'We detected an email mismatch between your account and the invitation. Ask your academy to confirm the email before retrying.';
const ACCOUNT_PENDING_ERASURE_COPY =
  'This account already has a pending deletion request. Contact support to cancel it before signing in again.';

const ROLE_CONFLICT_COPY =
  'This account is already linked to a {{current}} profile. Sign in with another account to access as {{requested}}, or ask your academy to invite a different email.';
const INVITATION_ALREADY_CLAIMED_COPY =
  'It looks like this invitation was already used. Try another account or ask your academy to resend it.';
const AUTH_REQUIRED_COPY = 'Your session expired. Please sign in again and retry.';
const EMAIL_REQUIRED_COPY =
  "We couldn't read the email tied to your session. Sign out and sign back in, or contact your academy administrator.";
const INVITE_ROLE_CONFLICT_COPY =
  'This email is already linked to {{current}}. Use a different account to invite them as {{requested}}.';
const INVITE_DUPLICATE_COPY =
  'An invitation already exists for this email in the selected academy. Review its status before resending.';
const INVITE_MANUAL_INTERVENTION_COPY =
  'Manual clean-up is required before this invite can be resent. Follow the outlined remediation steps.';
const INVITE_ALIAS_CONFLICT_COPY =
  'We detected an email mismatch for this membership. Resolve the alias conflict before trying again.';
const INVITE_GENERIC_COPY = 'We could not send the invites. Try again or contact support.';

const ROLE_LABELS: Record<string, string> = {
  academy_admin: 'academy admin',
  platform_owner: 'platform admin',
  super_admin: 'platform admin',
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toDetailsRecord = (value: unknown): Record<string, unknown> =>
  isPlainRecord(value) ? value : {};

const describeRole = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (ROLE_LABELS[normalized]) {
    return ROLE_LABELS[normalized];
  }
  return normalized;
};

export const resolveRoleConflictCopy = (error: EdgeFunctionErrorPayload): string => {
  const details = toDetailsRecord(error.details);
  const currentRole = describeRole(details.current_role ?? details.currentRole);
  const requestedRole = describeRole(details.requested_role ?? details.requestedRole);

  if (currentRole && requestedRole) {
    return ROLE_CONFLICT_COPY.replace('{{current}}', currentRole).replace('{{requested}}', requestedRole);
  }
  if (currentRole) {
    return ROLE_CONFLICT_COPY.replace('{{current}}', currentRole).replace('{{requested}}', 'another role');
  }
  return ROLE_CONFLICT_COPY.replace('{{current}}', 'another role').replace('{{requested}}', 'the requested role');
};

const FINALIZE_ERROR_RESOLVERS: Record<string, ErrorCopyResolver> = {
  INVITATION_ALREADY_CLAIMED: () => INVITATION_ALREADY_CLAIMED_COPY,
  ROLE_CONFLICT: resolveRoleConflictCopy,
  MEMBERSHIP_OWNERSHIP_CONFLICT: () => MEMBERSHIP_ALIAS_CONFLICT_COPY,
  AUTH_REQUIRED: () => AUTH_REQUIRED_COPY,
  EMAIL_REQUIRED: () => EMAIL_REQUIRED_COPY,
  ACCOUNT_ALREADY_PENDING_ERASURE: () => ACCOUNT_PENDING_ERASURE_COPY,
};

export const mapFinalizeErrorToCopy = (error: EdgeFunctionErrorPayload | null): string => {
  if (!error) {
    return FINALIZE_ERROR_FALLBACK;
  }
  const code = (error.code ?? '').toUpperCase();
  if (code && FINALIZE_ERROR_RESOLVERS[code]) {
    return FINALIZE_ERROR_RESOLVERS[code](error);
  }
  return FINALIZE_ERROR_FALLBACK;
};

const resolveInviteRoleConflictCopy = (error: EdgeFunctionErrorPayload): string => {
  const details = toDetailsRecord(error.details);
  const currentRole = describeRole(details.current_role ?? details.currentRole);
  const requestedRole = describeRole(details.requested_role ?? details.requestedRole);

  if (currentRole && requestedRole) {
    return INVITE_ROLE_CONFLICT_COPY.replace('{{current}}', currentRole).replace('{{requested}}', requestedRole);
  }
  if (currentRole) {
    return INVITE_ROLE_CONFLICT_COPY.replace('{{current}}', currentRole).replace('{{requested}}', 'the requested role');
  }
  if (requestedRole) {
    return INVITE_ROLE_CONFLICT_COPY.replace('{{current}}', 'another role').replace('{{requested}}', requestedRole);
  }
  return INVITE_ROLE_CONFLICT_COPY.replace('{{current}}', 'another role').replace('{{requested}}', 'the requested role');
};

export const mapInviteAdminErrorToCopy = (error: EdgeFunctionErrorPayload | null): string => {
  if (!error) {
    return INVITE_GENERIC_COPY;
  }
  const code = (error.code ?? '').toUpperCase();
  if (code === 'ROLE_CONFLICT') {
    return resolveInviteRoleConflictCopy(error);
  }
  if (code === 'INVITATION_ALREADY_EXISTS') {
    return INVITE_DUPLICATE_COPY;
  }
  if (code === 'MANUAL_INTERVENTION_REQUIRED') {
    return INVITE_MANUAL_INTERVENTION_COPY;
  }
  if (code === 'MEMBERSHIP_OWNERSHIP_CONFLICT') {
    return INVITE_ALIAS_CONFLICT_COPY;
  }
  return INVITE_GENERIC_COPY;
};

const normalize = (value: string | null | undefined): string => (value ?? '').trim().toUpperCase();

const matchesAccessDenied = (error: EdgeFunctionErrorPayload): boolean => {
  const normalizedCode = normalize(error.code);
  const normalizedMessage = normalize(error.message);
  return (
    normalizedCode === 'ACADEMY_NOT_OWNED' ||
    normalizedCode === 'ROLE_SCOPE_CONFLICT' ||
    normalizedMessage.includes('DO NOT HAVE ACCESS TO THAT ACADEMY')
  );
};

const matchesScopeConflict = (error: EdgeFunctionErrorPayload): boolean => {
  const normalizedCode = normalize(error.code);
  if (normalizedCode === 'ROLE_SCOPE_CONFLICT') {
    return true;
  }
  const normalizedMessage = normalize(error.message);
  return normalizedMessage.includes('ROLE_SCOPE_CONFLICT');
};

const matchesSessionExpired = (error: EdgeFunctionErrorPayload): boolean => {
  const normalizedCode = normalize(error.code);
  if (normalizedCode === 'AUTH_REQUIRED') {
    return true;
  }
  const normalizedMessage = normalize(error.message);
  return normalizedMessage.includes('AUTH REQUIRED') || normalizedMessage.includes('MISSING AUTHENTICATION');
};

export const mapSelectorErrorToCopy = (error: EdgeFunctionErrorPayload | null): string => {
  if (!error) {
    return SELECTOR_GENERIC_COPY;
  }
  if (matchesSessionExpired(error)) {
    return SELECTOR_SESSION_EXPIRED_COPY;
  }
  if (matchesAccessDenied(error)) {
    return SELECTOR_ACCESS_DENIED_COPY;
  }
  if (matchesScopeConflict(error)) {
    return SELECTOR_SCOPE_CONFLICT_COPY;
  }
  return SELECTOR_GENERIC_COPY;
};

const ONBOARDING_ERROR_RESOLVERS: Record<string, ErrorCopyResolver> = {
  ROLE_CONFLICT: resolveRoleConflictCopy,
  INVITATION_ALREADY_CLAIMED: () => INVITATION_ALREADY_CLAIMED_COPY,
  FULL_NAME_REQUIRED: () => 'We need your full name to continue onboarding.',
  TARGET_REQUIRED: () => 'Select both exam and level to complete your learning goal.',
  STUDENT_MEMBERSHIP_REQUIRED: () => 'You need an active student membership before setting a learning goal.',
  INVALID_EXAM_TYPE: () => 'The selected exam no longer exists. Choose another option.',
  INVALID_LEVEL: () => 'The selected level no longer exists. Choose another option.',
  INCOMPATIBLE_EXAM_LEVEL: () => 'That exam and level combination is unavailable. Review your selection.',
  AUTH_REQUIRED: () => AUTH_REQUIRED_COPY,
  METADATA_SYNC_FAILED: () => "We couldn't sync your session. Sign in again and retry.",
};

const isClientGeneratedError = (error: EdgeFunctionErrorPayload | null): boolean => {
  if (!error) {
    return false;
  }
  if (!error.details || !isPlainRecord(error.details)) {
    return false;
  }
  return error.details.clientGenerated === true;
};

export const mapOnboardingErrorToCopy = (
  error: EdgeFunctionErrorPayload | null,
  options?: { allowClientGeneratedMessage?: boolean },
): string | null => {
  if (!error) {
    return null;
  }

  const allowClientMessage = Boolean(options?.allowClientGeneratedMessage) && isClientGeneratedError(error);
  if (allowClientMessage) {
    return error.message;
  }

  const code = (error.code ?? '').toUpperCase();
  if (code && ONBOARDING_ERROR_RESOLVERS[code]) {
    return ONBOARDING_ERROR_RESOLVERS[code](error);
  }

  return ONBOARDING_ERROR_FALLBACK;
};

export const onboardingErrorHasMetadata = (error: EdgeFunctionErrorPayload | null): boolean =>
  Boolean(error?.requestId || error?.code);
