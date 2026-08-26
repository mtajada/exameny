import { useEffect, useRef } from 'react';

/**
 * Locks page-level scrolling by applying overflow hidden to html/body
 * and toggling a namespaced class for future styling.
 * Restores previous inline styles on unmount.
 */
export function useScrollLock(enabled: boolean = true) {
  const previousHtmlOverflow = useRef<string | null>(null);
  const previousBodyOverflow = useRef<string | null>(null);
  const previousHtmlHeight = useRef<string | null>(null);
  const previousBodyHeight = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const html = document.documentElement;
    const body = document.body;

    // Store previous inline styles so we can restore precisely
    previousHtmlOverflow.current = html.style.overflow || null;
    previousBodyOverflow.current = body.style.overflow || null;
    previousHtmlHeight.current = html.style.height || null;
    previousBodyHeight.current = body.style.height || null;

    html.classList.add('ruoe-scroll-lock');
    body.classList.add('ruoe-scroll-lock');

    // Force hidden overflow as a guard in case the CSS class is overridden
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';

    return () => {
      html.classList.remove('ruoe-scroll-lock');
      body.classList.remove('ruoe-scroll-lock');
      // Restore previous inline styles
      if (previousHtmlOverflow.current !== null) html.style.overflow = previousHtmlOverflow.current; else html.style.removeProperty('overflow');
      if (previousBodyOverflow.current !== null) body.style.overflow = previousBodyOverflow.current; else body.style.removeProperty('overflow');
      if (previousHtmlHeight.current !== null) html.style.height = previousHtmlHeight.current; else html.style.removeProperty('height');
      if (previousBodyHeight.current !== null) body.style.height = previousBodyHeight.current; else body.style.removeProperty('height');
    };
  }, [enabled]);
}
