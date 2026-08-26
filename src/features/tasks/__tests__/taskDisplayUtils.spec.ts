import { describe, expect, it } from 'vitest'
import { getTaskDisplayName, stripRuoePrefix } from '../taskDisplayUtils.ts'

describe('taskDisplayUtils', () => {
  describe('stripRuoePrefix', () => {
    it('removes leading R&UoE prefix regardless of casing', () => {
      expect(stripRuoePrefix('R&UoE Part 1 - Multiple Choice')).toBe('Part 1 - Multiple Choice')
      expect(stripRuoePrefix('r&uoE Part 1')).toBe('Part 1')
    })

    it('returns original name when prefix removal would result in empty string', () => {
      expect(stripRuoePrefix('R&UoE')).toBe('R&UoE')
    })

    it('handles nullish values gracefully', () => {
      expect(stripRuoePrefix(undefined)).toBe('')
      expect(stripRuoePrefix(null)).toBe('')
    })
  })

  describe('getTaskDisplayName', () => {
    it('returns empty string for null task', () => {
      expect(getTaskDisplayName(null)).toBe('')
    })

    it('removes RUoE prefix when task code is RUoE', () => {
      expect(
        getTaskDisplayName({
          taskCode: 'C1_LANG_WORD_FORMATION',
          name: 'R&UoE Word Formation',
        }),
      ).toBe('Word Formation')
    })

    it('returns name unchanged for non-RUoE tasks', () => {
      expect(
        getTaskDisplayName({
          taskCode: 'C1_WRITE_ESSAY',
          name: 'Formal Letter',
        }),
      ).toBe('Formal Letter')
    })

    it('falls back to empty string when name missing', () => {
      expect(
        getTaskDisplayName({
          taskCode: 'C1_WRITE_ESSAY',
          name: null,
        }),
      ).toBe('')
    })
  })
})
