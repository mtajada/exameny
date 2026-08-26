import { describe, expect, it } from 'vitest'
import { getExamTaskMeta, isRuoeTask, isRuoeTaskCode } from '../exam-task-meta'

describe('isRuoeTaskCode', () => {
  it('detects canonical RUoE codes', () => {
    expect(isRuoeTaskCode('C1_LANG_WORD_FORMATION')).toBe(true)
    expect(isRuoeTaskCode('B2_READ_MULTIPLE_MATCHING')).toBe(true)
  })

  it('handles legacy spacing and hyphenation', () => {
    expect(isRuoeTaskCode(' cae uoe p3 ')).toBe(true)
    expect(isRuoeTaskCode('Pet-read-p2')).toBe(true)
  })

  it('returns false for non-RUoE codes', () => {
    expect(isRuoeTaskCode('B2_WRITE_OPTIONAL')).toBe(false)
    expect(isRuoeTaskCode(undefined)).toBe(false)
    expect(isRuoeTaskCode(null)).toBe(false)
  })
})

describe('isRuoeTask', () => {
  it('uses task names when codes are missing', () => {
    expect(isRuoeTask(undefined, 'R&UoE Part 3: Word formation')).toBe(true)
    expect(isRuoeTask(undefined, 'Reading & Use of English practice')).toBe(true)
  })

  it('avoids false positives for writing tasks', () => {
    expect(isRuoeTask(undefined, 'Writing Task: Formal Letter')).toBe(false)
    expect(isRuoeTask(undefined, 'Reading comprehension essay')).toBe(false)
  })
})

describe('getExamTaskMeta', () => {
  it('marks RUoE skill and section for Use of English tasks', () => {
    const meta = getExamTaskMeta('C1_LANG_WORD_FORMATION', 'R&UoE Part 3: Word formation')
    expect(meta.skill).toBe('ruoe')
    expect(meta.sectionLabel).toBe('Language Use')
  })

  it('marks RUoE skill and reading section for reading tasks', () => {
    const meta = getExamTaskMeta('B2_READ_GAPPED_TEXT', 'R&UoE Part 6: Gapped text')
    expect(meta.skill).toBe('ruoe')
    expect(meta.sectionLabel).toBe('Reading')
  })

  it('defaults to writing metadata when task is not RUoE', () => {
    const meta = getExamTaskMeta('B2_WRITE_OPTIONAL', 'Writing Part 2: Email')
    expect(meta.skill).toBe('writing')
    expect(meta.sectionLabel).toBe('Writing')
  })
})
