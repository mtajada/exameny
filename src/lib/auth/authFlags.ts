export type AuthMethodFlags = {
  google: boolean;
  microsoft: boolean;
  magicLink: boolean;
};

const DEFAULT_AUTH_METHOD_FLAGS: AuthMethodFlags = {
  google: true,
  microsoft: false,
  magicLink: false,
};

const parseBooleanFlag = (value: unknown, fallback: boolean): boolean => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const formatListWithOr = (items: string[]): string => {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
};

export const resolveAuthMethodFlags = (): AuthMethodFlags => ({
  google: parseBooleanFlag(import.meta.env.VITE_AUTH_GOOGLE_ENABLED, DEFAULT_AUTH_METHOD_FLAGS.google),
  microsoft: parseBooleanFlag(import.meta.env.VITE_AUTH_MICROSOFT_ENABLED, DEFAULT_AUTH_METHOD_FLAGS.microsoft),
  magicLink: parseBooleanFlag(import.meta.env.VITE_AUTH_MAGIC_LINK_ENABLED, DEFAULT_AUTH_METHOD_FLAGS.magicLink),
});

export const formatAuthMethodList = (flags: AuthMethodFlags = resolveAuthMethodFlags()): string => {
  const labels: string[] = [];
  if (flags.google) {
    labels.push('Google');
  }
  if (flags.microsoft) {
    labels.push('Microsoft');
  }
  if (flags.magicLink) {
    labels.push('Magic Link');
  }
  if (labels.length === 0) {
    labels.push('Google');
  }
  return formatListWithOr(labels);
};

export const buildAuthFooterCopy = (flags: AuthMethodFlags = resolveAuthMethodFlags()): string => {
  const methods = formatAuthMethodList(flags);
  if (flags.magicLink) {
    return `Sign in with ${methods}. If you need help, contact your academy administrator.`;
  }
  return `All logins use ${methods}. If you need help, contact your academy administrator.`;
};
