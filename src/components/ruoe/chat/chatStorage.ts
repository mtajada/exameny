// Enhanced storage helper functions with error handling and retry logic
// Extracted from ChatPanel.tsx for better organization and performance

// Centralized debug logging
const debugLog = (action: string, data: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`💬 Chat Storage - ${action}:`);
  }
};

export const getDraftStorageKey = (attemptId: number | null): string | null => {
  return attemptId ? `ruoe_draft_message_${attemptId}` : null;
};

// Retry storage operations up to 3 times
export const retryStorageOperation = async function<T>(
  operation: () => T,
  maxRetries: number = 3
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return operation();
    } catch (error) {
      if (i === maxRetries - 1) {
        debugLog('Storage operation failed after retries', { error, maxRetries });
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 * (i + 1))); // Exponential backoff
    }
  }
  return null;
};

export const loadDraftFromStorage = async (attemptId: number | null): Promise<string> => {
  const storageKey = getDraftStorageKey(attemptId);
  if (!storageKey) return '';

  const result = await retryStorageOperation(() => {
    const stored = sessionStorage.getItem(storageKey) || '';
    // Validate that the stored value is a string
    if (stored && typeof stored === 'string') {
      return stored;
    }
    return '';
  });

  if (result) {
    debugLog('Loaded draft', { attemptId, length: result.length });
  }

  return result || '';
};

export const saveDraftToStorage = async (attemptId: number | null, text: string): Promise<boolean> => {
  const storageKey = getDraftStorageKey(attemptId);
  if (!storageKey) return false;

  const success = await retryStorageOperation(() => {
    if (text.trim()) {
      sessionStorage.setItem(storageKey, text);
    } else {
      sessionStorage.removeItem(storageKey);
    }
    return true;
  });

  debugLog('Save draft', {
    attemptId,
    length: text.length,
    success: success !== null
  });

  return success !== null;
};

export const clearDraftFromStorage = async (attemptId: number | null): Promise<boolean> => {
  const storageKey = getDraftStorageKey(attemptId);
  if (!storageKey) return false;

  const success = await retryStorageOperation(() => {
    sessionStorage.removeItem(storageKey);
    return true;
  });

  debugLog('Cleared draft', { attemptId, success: success !== null });

  return success !== null;
};