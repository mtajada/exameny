import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/useAuth.ts'
import { formatDurationTimer } from '@/utils/time-format.ts'

// Sync every 30 seconds by default to balance accuracy and Supabase write volume.
const DEFAULT_SYNC_INTERVAL_MS = 30_000

export interface SubmissionTimerOptions {
  submissionId?: string | null
  initialSeconds?: number
  autoStart?: boolean
  syncIntervalMs?: number
}

export interface SubmissionTimerSyncResult {
  seconds: number
  updated: boolean
  syncedAt?: string | null
  error?: string
  skipped?: boolean
}

export interface SubmissionTimerSyncOptions {
  force?: boolean
  reason?: string
  transport?: 'default' | 'keepalive'
}

export interface SubmissionTimerApi {
  elapsedSeconds: number
  formatted: string
  isRunning: boolean
  isSyncing: boolean
  hasUnsyncedChanges: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
  pause: () => void
  resume: () => void
  getTotalSeconds: () => number
  markSynced: (seconds?: number) => void
  syncWithServer: (options?: SubmissionTimerSyncOptions) => Promise<SubmissionTimerSyncResult>
}

interface LogSubmissionTimeSpentRow {
  out_time_spent_seconds: number | null
  out_last_timer_synced_at: string | null
}

function normalizeSeconds(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

export function useSubmissionTimer(options: SubmissionTimerOptions = {}): SubmissionTimerApi {
  const { submissionId, autoStart = true } = options
  const initialSeconds = normalizeSeconds(options.initialSeconds ?? 0)
  const syncIntervalMs = options.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS

  const { user, session } = useAuth()

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(initialSeconds)
  const [isRunning, setIsRunning] = useState<boolean>(autoStart)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)
  const [lastSyncedSnapshot, setLastSyncedSnapshot] = useState<number>(initialSeconds)

  const elapsedRef = useRef<number>(initialSeconds)
  const lastSyncedSecondsRef = useRef<number>(initialSeconds)
  const submissionIdRef = useRef<string | null>(submissionId ?? null)
  const accessTokenRef = useRef<string | null>(session?.access_token ?? null)

  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef<boolean>(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    elapsedRef.current = initialSeconds
    setElapsedSeconds(initialSeconds)
    lastSyncedSecondsRef.current = initialSeconds
    setLastSyncedSnapshot(initialSeconds)
  }, [submissionId, initialSeconds])

  useEffect(() => {
    submissionIdRef.current = submissionId ?? null
  }, [submissionId])

  useEffect(() => {
    accessTokenRef.current = session?.access_token ?? null
  }, [session?.access_token])

  useEffect(() => {
    if (!isRunning) {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      return
    }

    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    timerIntervalRef.current = setInterval(() => {
      const next = elapsedRef.current + 1
      elapsedRef.current = next
      if (isMountedRef.current) {
        setElapsedSeconds(next)
      }
    }, 1000)

    return () => {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
  }, [isRunning])

  const syncWithServer = useCallback(async ({ force = false, reason, transport = 'default' }: SubmissionTimerSyncOptions = {}) => {
    const currentSubmissionId = submissionId
    if (!currentSubmissionId || !user?.id) {
      return {
        seconds: lastSyncedSecondsRef.current,
        updated: false,
        skipped: true,
      }
    }

    const candidateSeconds = normalizeSeconds(elapsedRef.current)
    const lastSyncedSeconds = lastSyncedSecondsRef.current

    if (!force && candidateSeconds <= lastSyncedSeconds) {
      return {
        seconds: lastSyncedSeconds,
        updated: false,
        skipped: true,
      }
    }

    setIsSyncing(true)

    try {
      const payload = await (async (): Promise<LogSubmissionTimeSpentRow | null | undefined> => {
        const shouldUseKeepalive = transport === 'keepalive'
        if (shouldUseKeepalive && typeof fetch === 'function' && typeof document !== 'undefined') {
          const accessToken = accessTokenRef.current
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
          const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

          if (accessToken && supabaseUrl && supabasePublishableKey) {
            try {
              const response = await fetch(`${supabaseUrl}/rest/v1/rpc/log_submission_time_spent`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  apikey: supabasePublishableKey,
                  Authorization: `Bearer ${accessToken}`,
                  Prefer: 'return=representation',
                },
                body: JSON.stringify({
                  p_submission_id: currentSubmissionId,
                  p_new_seconds: candidateSeconds,
                  p_synced_at: new Date().toISOString(),
                }),
                keepalive: true,
                cache: 'no-store',
                credentials: 'omit',
              })

              if (!response.ok) {
                throw new Error(`Keepalive RPC failed with status ${response.status}`)
              }

              const result = await response.json()
              if (Array.isArray(result)) {
                return result[0] as LogSubmissionTimeSpentRow | undefined
              }

              return result as LogSubmissionTimeSpentRow
            } catch (keepaliveError) {
              console.warn('[useSubmissionTimer] Keepalive sync failed, falling back to standard RPC')
            }
          }
        }

        const { data, error } = await supabase.rpc('log_submission_time_spent', {
          p_submission_id: currentSubmissionId,
          p_new_seconds: candidateSeconds,
          p_synced_at: new Date().toISOString(),
        })

        if (error) {
          throw error
        }

        if (Array.isArray(data)) {
          return data[0] as LogSubmissionTimeSpentRow | undefined
        }

        return (data as LogSubmissionTimeSpentRow | null) ?? null
      })()

      if (submissionIdRef.current !== currentSubmissionId) {
        return {
          seconds: lastSyncedSecondsRef.current,
          updated: false,
          skipped: true,
        }
      }

      const syncedSeconds = normalizeSeconds(
        typeof payload?.out_time_spent_seconds === 'number'
          ? payload.out_time_spent_seconds
          : candidateSeconds,
      )
      const syncedAt =
        typeof payload?.out_last_timer_synced_at === 'string' ? payload.out_last_timer_synced_at : null

      lastSyncedSecondsRef.current = syncedSeconds
      setLastSyncedSnapshot(syncedSeconds)
      if (syncedSeconds > elapsedRef.current) {
        elapsedRef.current = syncedSeconds
        if (isMountedRef.current) {
          setElapsedSeconds(syncedSeconds)
        }
      }

      if (syncedAt) {
        setLastSyncedAt(syncedAt)
      }

      setLastSyncError(null)
      return {
        seconds: syncedSeconds,
        updated: syncedSeconds > lastSyncedSeconds,
        syncedAt,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync submission time.'
      setLastSyncError(message)
      console.error('[useSubmissionTimer] Sync failed')
      return {
        seconds: lastSyncedSecondsRef.current,
        updated: false,
        error: message,
      }
    } finally {
      if (isMountedRef.current) {
        setIsSyncing(false)
      }
    }
  }, [submissionId, user?.id])

  useEffect(() => {
    if (!submissionId || syncIntervalMs <= 0) return

    const intervalId = setInterval(() => {
      void syncWithServer({ reason: 'auto-sync' })
    }, syncIntervalMs)

    return () => {
      clearInterval(intervalId)
    }
  }, [submissionId, syncIntervalMs, syncWithServer])

  const pause = useCallback(() => {
    setIsRunning(false)
  }, [])

  const resume = useCallback(() => {
    setIsRunning(true)
  }, [])

  const markSynced = useCallback((seconds?: number) => {
    const normalized = seconds != null ? normalizeSeconds(seconds) : normalizeSeconds(elapsedRef.current)
    lastSyncedSecondsRef.current = normalized
    setLastSyncedSnapshot(normalized)
    if (normalized > elapsedRef.current) {
      elapsedRef.current = normalized
      if (isMountedRef.current) {
        setElapsedSeconds(normalized)
      }
    }
  }, [])

  const getTotalSeconds = useCallback(() => {
    return Math.max(elapsedRef.current, lastSyncedSecondsRef.current)
  }, [])

  const formatted = useMemo(() => formatDurationTimer(elapsedSeconds), [elapsedSeconds])
  const hasUnsyncedChanges = elapsedSeconds > lastSyncedSnapshot

  return {
    elapsedSeconds,
    formatted,
    isRunning,
    isSyncing,
    hasUnsyncedChanges,
    lastSyncedAt,
    lastSyncError,
    pause,
    resume,
    getTotalSeconds,
    markSynced,
    syncWithServer,
  }
}
