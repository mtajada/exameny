import { describe, expect, it } from 'vitest'

import { isTrustedSupabaseAuthUrl } from './client'

describe('isTrustedSupabaseAuthUrl', () => {
  it('accepts only Auth endpoints on the configured Supabase origin', () => {
    expect(isTrustedSupabaseAuthUrl('http://127.0.0.1:54321/auth/v1/authorize?provider=google')).toBe(true)
    expect(isTrustedSupabaseAuthUrl('https://attacker.example/auth/v1/authorize')).toBe(false)
    expect(isTrustedSupabaseAuthUrl('javascript:alert(1)')).toBe(false)
    expect(isTrustedSupabaseAuthUrl('http://127.0.0.1:54321/storage/v1/object')).toBe(false)
  })
})
