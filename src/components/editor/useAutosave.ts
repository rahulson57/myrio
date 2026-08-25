'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autosave contract (SPEC-005 "Autosave contract"):
 *
 * | Property | Value |
 * |---|---|
 * | Trigger | 3s of no keystrokes (debounce), OR 15s since the last
 * |         | successful save while typing continuously, OR flush() on
 * |         | blur/route change |
 * | Concurrency | a stale baseVersion (409) is surfaced as `conflict`,
 * |             | distinct from the four save-status states — "Opened
 * |             | elsewhere — reload", never a silent overwrite |
 * | Indicator | exactly four states: saving / saved / unsaved / failed |
 * | Failure | exponential backoff 1s -> 2s -> 4s, 3 attempts, then
 * |         | `failed` |
 */

export type SaveStatus = 'saving' | 'saved' | 'unsaved' | 'failed';

export type SaveOutcome = { ok: true } | { ok: false; conflict?: boolean };

export interface UseAutosaveOptions<T> {
  value: T;
  onSave: (value: T) => Promise<SaveOutcome>;
  /** ms of keystroke idleness before a save fires. Default 3000. */
  debounceMs?: number;
  /** ms since the last successful save before a save fires regardless of
   * ongoing activity. Default 15000. */
  maxWaitMs?: number;
  /** Backoff delays between retry attempts on a non-conflict failure.
   * Default [1000, 2000, 4000] — 3 attempts, then `failed`. */
  retryDelaysMs?: number[];
}

export interface UseAutosaveResult {
  status: SaveStatus;
  lastSavedAt: number | null;
  /** `true` once a save has come back 409 — the caller should show
   * "Opened elsewhere — reload" and stop autosaving until the user acts. */
  conflict: boolean;
  /** Saves immediately and clears any pending timers — call on blur or
   * before a route change. */
  flush: () => void;
}

const DEFAULT_DEBOUNCE_MS = 3000;
const DEFAULT_MAX_WAIT_MS = 15000;
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000];

export function useAutosave<T>(options: UseAutosaveOptions<T>): UseAutosaveResult {
  const {
    value,
    onSave,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  } = options;

  const [status, setStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);

  const valueRef = useRef(value);
  valueRef.current = value;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  const isFirstRender = useRef(true);

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (maxWaitTimer.current) clearTimeout(maxWaitTimer.current);
    debounceTimer.current = null;
    maxWaitTimer.current = null;
  }, []);

  const runSave = useCallback(
    (attempt: number) => {
      if (conflictRef.current) return;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      clearTimers();
      savingRef.current = true;
      setStatus('saving');

      onSaveRef
        .current(valueRef.current)
        .then((outcome) => {
          savingRef.current = false;
          if (outcome.ok) {
            setStatus('saved');
            setLastSavedAt(Date.now());
            return;
          }
          if (outcome.conflict) {
            conflictRef.current = true;
            setConflict(true);
            setStatus('unsaved');
            return;
          }
          if (attempt < retryDelaysMs.length) {
            retryTimer.current = setTimeout(() => runSave(attempt + 1), retryDelaysMs[attempt]);
          } else {
            setStatus('failed');
          }
        })
        .catch(() => {
          savingRef.current = false;
          if (attempt < retryDelaysMs.length) {
            retryTimer.current = setTimeout(() => runSave(attempt + 1), retryDelaysMs[attempt]);
          } else {
            setStatus('failed');
          }
        });
    },
    [clearTimers, retryDelaysMs],
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (conflictRef.current) return;

    setStatus('unsaved');

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSave(0), debounceMs);

    // The max-wait timer is armed once per "dirty streak" — it is NOT
    // reset on every keystroke, only cleared (by runSave, via
    // clearTimers) once an actual save attempt starts.
    if (!maxWaitTimer.current) {
      maxWaitTimer.current = setTimeout(() => runSave(0), maxWaitMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value is the trigger
  }, [value]);

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (maxWaitTimer.current) clearTimeout(maxWaitTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const flush = useCallback(() => {
    if (conflictRef.current) return;
    runSave(0);
  }, [runSave]);

  return { status, lastSavedAt, conflict, flush };
}
