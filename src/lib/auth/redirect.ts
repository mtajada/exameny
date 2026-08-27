type RouterLocationLike = {
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeInternalPath = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  const [pathname] = value.split(/[?#]/, 1);
  if (pathname === '/auth' || pathname === '/profile-setup') {
    return null;
  }

  return value;
};

export const resolvePostAuthPath = (state: unknown): string | null => {
  if (!isRecord(state) || !('from' in state)) {
    return null;
  }

  const from = state.from;
  const directPath = normalizeInternalPath(from);
  if (directPath) {
    return directPath;
  }

  if (!isRecord(from)) {
    return null;
  }

  const location = from as RouterLocationLike;
  const pathname = normalizeInternalPath(location.pathname);
  if (!pathname) {
    return null;
  }

  const search = typeof location.search === 'string' && location.search.startsWith('?')
    ? location.search
    : '';
  const hash = typeof location.hash === 'string' && location.hash.startsWith('#')
    ? location.hash
    : '';

  return `${pathname}${search}${hash}`;
};
