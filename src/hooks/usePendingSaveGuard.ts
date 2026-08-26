import { useEffect } from 'react';

/**
 * Registers a beforeunload handler when there are pending saves,
 * warning the user before leaving the page.
 */
export const usePendingSaveGuard = (hasPending: boolean) => {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasPending) return;
      e.preventDefault();
      // Some browsers require setting returnValue for the dialog to appear
      e.returnValue = '';
    };
    if (hasPending) {
      window.addEventListener('beforeunload', handler);
    }
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [hasPending]);
};

export default usePendingSaveGuard;
