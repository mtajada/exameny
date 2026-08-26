import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type EasingName = 'linear' | 'easeInOut' | 'easeOut' | 'easeOutBalanced';

export interface UseSimulatedProgressOptions {
  /** Whether the simulated progress should be running */
  isActive: boolean;
  /** Target percentage to reach while simulating (default 95) */
  target?: number;
  /** Milliseconds it should take to reach the target (default 30000) */
  durationMs?: number;
  /** Starting point for the simulated progress (default 0) */
  initialValue?: number;
  /** How frequently the progress state should update (default 120ms) */
  tickIntervalMs?: number;
  /** Easing curve applied to the progress interpolation */
  easing?: EasingName;
}

interface UseSimulatedProgressResult {
  progress: number;
  /** Override the current progress immediately (clamped 0-100) */
  setProgress: (value: number) => void;
  /** Reset to the initial value and halt animation until reactivated */
  reset: () => void;
}

const easingFns: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutBalanced: (t) => {
    const base = 1 - Math.pow(1 - t, 2);
    return Math.pow(base, 1.6);
  },
};

const clamp = (value: number, min = 0, max = 100) => Math.min(Math.max(value, min), max);

export function useSimulatedProgress(options: UseSimulatedProgressOptions): UseSimulatedProgressResult {
  const {
    isActive,
    target = 95,
    durationMs = 30_000,
    initialValue = 0,
    tickIntervalMs = 120,
    easing = 'easeOut',
  } = options;

  const [progress, internalSetProgress] = useState<number>(() => clamp(initialValue));
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [runToken, restart] = useState(0);

  const easingFn = useMemo(() => easingFns[easing] ?? easingFns.easeOut, [easing]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    if (startTimeRef.current === null) {
      startTimeRef.current = now;
    }

    const elapsed = now - startTimeRef.current;
    const normalized = clamp(durationMs === 0 ? 1 : elapsed / durationMs, 0, 1);
    const eased = easingFn(normalized);
    const nextValue = clamp(initialValue + (target - initialValue) * eased);

    internalSetProgress((current) => (nextValue > current ? nextValue : current));

    if (normalized >= 1) {
      clearTimer();
    }
  }, [clearTimer, durationMs, easingFn, initialValue, target]);

  const reset = useCallback(() => {
    clearTimer();
    startTimeRef.current = null;
    internalSetProgress(clamp(initialValue));
    restart((token) => token + 1);
  }, [clearTimer, initialValue, restart]);

  const setProgress = useCallback((value: number) => {
    clearTimer();
    startTimeRef.current = null;
    internalSetProgress(clamp(value));
  }, [clearTimer]);

  useEffect(() => {
    if (!isActive) {
      clearTimer();
      startTimeRef.current = null;
      return;
    }

    startTimeRef.current = null;
    tick();
    clearTimer();
    intervalRef.current = setInterval(tick, tickIntervalMs);

    return () => {
      clearTimer();
    };
  }, [clearTimer, isActive, tick, tickIntervalMs, runToken]);

  return {
    progress,
    setProgress,
    reset,
  };
}
