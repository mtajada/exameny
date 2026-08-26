import { useCallback, useEffect, useMemo, useState } from 'react';

interface PersistedSnapshot {
  questionId?: number;
  questionIndex?: number;
}

const STORAGE_PREFIX = 'ruoe:cursor:';

const normalizeSnapshot = (snapshot: PersistedSnapshot | null): PersistedSnapshot | null => {
  if (!snapshot) return null;

  const normalized: PersistedSnapshot = {};

  const maybeId = snapshot.questionId;
  if (typeof maybeId === 'number' && Number.isFinite(maybeId)) {
    normalized.questionId = maybeId;
  }

  const maybeIndex = snapshot.questionIndex;
  if (typeof maybeIndex === 'number' && Number.isInteger(maybeIndex)) {
    normalized.questionIndex = maybeIndex;
  }

  return Object.keys(normalized).length === 0 ? null : normalized;
};

const readSnapshotFromStorage = (storageKey: string | null): PersistedSnapshot | null => {
  if (!storageKey || typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSnapshot | null;
    return normalizeSnapshot(parsed);
  } catch (error) {
    console.warn('Failed to read persisted RUoE cursor');
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(storageKey);
    }
    return null;
  }
};

const writeSnapshotToStorage = (storageKey: string | null, snapshot: PersistedSnapshot | null) => {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  if (!snapshot) {
    window.sessionStorage.removeItem(storageKey);
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Failed to persist RUoE cursor');
  }
};

export interface UsePersistedQuestionCursorResult {
  snapshot: PersistedSnapshot | null;
  setQuestionId: (questionId: number | null, questionIndex?: number | null) => void;
  setQuestionIndex: (questionIndex: number | null, questionId?: number | null) => void;
  clearSnapshot: () => void;
  hydrated: boolean;
}

export const usePersistedQuestionCursor = (attemptId: number | null): UsePersistedQuestionCursorResult => {
  const storageKey = useMemo(() => (
    attemptId ? `${STORAGE_PREFIX}${attemptId}` : null
  ), [attemptId]);

  const [snapshot, setSnapshot] = useState<PersistedSnapshot | null>(null);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const resolvedSnapshot = useMemo(() => normalizeSnapshot(snapshot), [snapshot]);

  useEffect(() => {
    setHydrated(false);
    const initial = readSnapshotFromStorage(storageKey);
    setSnapshot(initial);
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback((next: PersistedSnapshot | null) => {
    const normalized = normalizeSnapshot(next);
    setSnapshot((current) => {
      const currentNormalized = normalizeSnapshot(current);
      const currentId = currentNormalized?.questionId ?? null;
      const currentIndex = currentNormalized?.questionIndex ?? null;
      const nextId = normalized?.questionId ?? null;
      const nextIndex = normalized?.questionIndex ?? null;

      const hasChanged = currentId !== nextId || currentIndex !== nextIndex;

      if (!hasChanged) {
        return currentNormalized;
      }

      writeSnapshotToStorage(storageKey, normalized);
      return normalized;
    });
  }, [storageKey]);

  const setQuestionId = useCallback((questionId: number | null, questionIndex?: number | null) => {
    if (questionId == null) {
      persist(questionIndex == null ? null : { questionIndex });
      return;
    }

    const next: PersistedSnapshot = { questionId };
    if (typeof questionIndex === 'number' && Number.isInteger(questionIndex)) {
      next.questionIndex = questionIndex;
    }
    persist(next);
  }, [persist]);

  const setQuestionIndex = useCallback((questionIndex: number | null, questionId?: number | null) => {
    if (questionIndex == null) {
      persist(questionId == null ? null : { questionId });
      return;
    }

    const next: PersistedSnapshot = { questionIndex };
    if (typeof questionId === 'number' && Number.isFinite(questionId)) {
      next.questionId = questionId;
    }
    persist(next);
  }, [persist]);

  const clearSnapshot = useCallback(() => {
    persist(null);
  }, [persist]);

  return {
    snapshot: resolvedSnapshot,
    setQuestionId,
    setQuestionIndex,
    clearSnapshot,
    hydrated,
  };
};
