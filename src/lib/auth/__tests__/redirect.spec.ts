import { describe, expect, it } from 'vitest';

import { resolvePostAuthPath } from '@/lib/auth/redirect';

describe('resolvePostAuthPath', () => {
  it('preserves an internal route with search and hash', () => {
    expect(
      resolvePostAuthPath({
        from: {
          pathname: '/academy/dashboard',
          search: '?view=compact',
          hash: '#members',
        },
      }),
    ).toBe('/academy/dashboard?view=compact#members');
  });

  it('accepts a direct internal path', () => {
    expect(resolvePostAuthPath({ from: '/evaluation/submission-1' })).toBe(
      '/evaluation/submission-1',
    );
  });

  it('rejects auth loops and external protocol-relative destinations', () => {
    expect(resolvePostAuthPath({ from: '/auth' })).toBeNull();
    expect(resolvePostAuthPath({ from: '/profile-setup' })).toBeNull();
    expect(resolvePostAuthPath({ from: '//example.test/path' })).toBeNull();
  });

  it('rejects malformed location state', () => {
    expect(resolvePostAuthPath(null)).toBeNull();
    expect(resolvePostAuthPath({ from: { pathname: 'https://example.test' } })).toBeNull();
  });
});
