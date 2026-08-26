import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAutoSelectSingleLevel } from '../useAutoSelectSingleLevel.ts'

const levelOption = {
  id: 1,
  name: 'B2',
  code: 'B2',
}

describe('useAutoSelectSingleLevel', () => {
  it('auto-selects the only available level when guard is inactive', async () => {
    const setAutoAppliedLevelId = vi.fn()
    const onAutoSelectLevel = vi.fn()

    renderHook(() =>
      useAutoSelectSingleLevel({
        levels: [levelOption],
        selectedExamId: '10',
        selectedLevelId: '',
        guardActive: false,
        autoAppliedLevelId: null,
        setAutoAppliedLevelId,
        onAutoSelectLevel,
      }),
    )

    await waitFor(() => {
      expect(onAutoSelectLevel).toHaveBeenCalledWith('1')
      expect(setAutoAppliedLevelId).toHaveBeenCalledWith('1')
    })
  })

  it('auto-selects the preferred level code when multiple levels exist', async () => {
    const setAutoAppliedLevelId = vi.fn()
    const onAutoSelectLevel = vi.fn()

    renderHook(() =>
      useAutoSelectSingleLevel({
        levels: [
          { id: 1, name: 'B2', code: 'B2' },
          { id: 3, name: 'C1', code: 'C1' },
        ],
        selectedExamId: '10',
        selectedLevelId: '',
        guardActive: false,
        preferredLevelCode: 'C1',
        autoAppliedLevelId: null,
        setAutoAppliedLevelId,
        onAutoSelectLevel,
      }),
    )

    await waitFor(() => {
      expect(onAutoSelectLevel).toHaveBeenCalledWith('3')
      expect(setAutoAppliedLevelId).toHaveBeenCalledWith('3')
    })
  })

  it('does not auto-select when guard is active and clears tracked auto level', async () => {
    const setAutoAppliedLevelId = vi.fn()
    const onAutoSelectLevel = vi.fn()

    renderHook(() =>
      useAutoSelectSingleLevel({
        levels: [levelOption],
        selectedExamId: '10',
        selectedLevelId: '',
        guardActive: true,
        autoAppliedLevelId: '1',
        setAutoAppliedLevelId,
        onAutoSelectLevel,
      }),
    )

    await waitFor(() => {
      expect(onAutoSelectLevel).not.toHaveBeenCalled()
      expect(setAutoAppliedLevelId).toHaveBeenCalledWith(null)
    })
  })

  it('clears auto-applied marker when user selects a different level manually', async () => {
    const setAutoAppliedLevelId = vi.fn()
    const onAutoSelectLevel = vi.fn()

    const { rerender } = renderHook(
      (props) => useAutoSelectSingleLevel(props),
      {
        initialProps: {
          levels: [levelOption],
          selectedExamId: '10',
          selectedLevelId: '',
          guardActive: false,
          autoAppliedLevelId: null,
          setAutoAppliedLevelId,
          onAutoSelectLevel,
        },
      },
    )

    await waitFor(() => {
      expect(onAutoSelectLevel).toHaveBeenCalledWith('1')
      expect(setAutoAppliedLevelId).toHaveBeenCalledWith('1')
    })

    setAutoAppliedLevelId.mockClear()
    onAutoSelectLevel.mockClear()

    rerender({
      levels: [levelOption],
      selectedExamId: '10',
      selectedLevelId: '99',
      guardActive: false,
      autoAppliedLevelId: '1',
      setAutoAppliedLevelId,
      onAutoSelectLevel,
    })

    await waitFor(() => {
      expect(onAutoSelectLevel).not.toHaveBeenCalled()
      expect(setAutoAppliedLevelId).toHaveBeenCalledWith(null)
    })
  })
})
