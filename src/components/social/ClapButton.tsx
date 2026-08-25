'use client';

import { useEffect, useRef, useState } from 'react';
import { ClapIcon } from './icons';
import styles from './ClapButton.module.css';

/** SPEC-007: "flushes one request per 500 ms idle". */
const FLUSH_IDLE_MS = 500;
/** SPEC-007: per-user cap; matches `CLAP_MAX_DELTA`/the server's clamp in `src/server/services/claps.ts`. */
const MAX_MY_COUNT = 50;

export interface ClapButtonProps {
  articleId: string;
  initialTotal: number;
  initialMyCount: number;
  /**
   * An anonymous clap is rejected server-side with 401 (SPEC-007). Passed
   * in (from the RSC page's already-resolved session) rather than this
   * component reading a session itself — session reading is guard.ts's
   * job (SPEC-004), not a client island's.
   */
  isSignedIn: boolean;
}

type Status = 'idle' | 'saving' | 'error' | 'signed-out';

/**
 * The article page's clap control (SPEC-007 "Claps", SPEC-009's named
 * reduced-motion and focus-visible target). Batches rapid taps client-side
 * and flushes a single `POST /api/articles/:id/claps` request per 500 ms
 * of idle time, with an optimistic count that reconciles against the
 * response body once it lands.
 *
 * Reconciliation note: on a successful flush this snaps `total` to the
 * server's authoritative value for that batch. If the visitor keeps
 * clicking WHILE that request is in flight, their new optimistic bump can
 * be briefly overwritten by the older response before their own batch's
 * flush confirms a moment later — a transient flicker, not a lost clap
 * (the DB is the source of truth and every batch's delta is still sent).
 * Not eliminated here: no acceptance criterion exercises overlapping
 * in-flight batches, and avoiding it entirely needs extra state (tracking
 * "confirmed" vs "optimistic" separately) that isn't worth it for a
 * cosmetic edge case.
 */
export function ClapButton({ articleId, initialTotal, initialMyCount, isSignedIn }: ClapButtonProps) {
  const [total, setTotal] = useState(initialTotal);
  const [myCount, setMyCount] = useState(initialMyCount);
  const [status, setStatus] = useState<Status>('idle');

  const pendingDeltaRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFlushingRef = useRef(false);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function scheduleFlush() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, FLUSH_IDLE_MS);
  }

  async function flush() {
    if (isFlushingRef.current) return;
    const delta = pendingDeltaRef.current;
    if (delta === 0) return;

    pendingDeltaRef.current = 0;
    isFlushingRef.current = true;
    setStatus('saving');

    try {
      const res = await fetch(`/api/articles/${articleId}/claps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });

      if (res.status === 401) {
        setTotal((t) => t - delta);
        setMyCount((c) => Math.max(0, c - delta));
        setStatus('signed-out');
        return;
      }

      if (!res.ok) {
        setTotal((t) => t - delta);
        setMyCount((c) => Math.max(0, c - delta));
        setStatus('error');
        return;
      }

      const body = (await res.json()) as { myCount: number; total: number };
      setTotal(body.total);
      setMyCount(body.myCount);
      setStatus('idle');
    } catch {
      setTotal((t) => t - delta);
      setMyCount((c) => Math.max(0, c - delta));
      setStatus('error');
    } finally {
      isFlushingRef.current = false;
      if (pendingDeltaRef.current > 0) {
        scheduleFlush();
      }
    }
  }

  function handleClick() {
    if (!isSignedIn) {
      setStatus('signed-out');
      return;
    }
    if (myCount >= MAX_MY_COUNT) {
      // Already at the cap (including any not-yet-flushed optimistic
      // clicks, since myCount is bumped in lockstep with pendingDeltaRef
      // below) — SPEC-007 clamps further deltas silently, so there's
      // nothing more for the optimistic UI to show.
      return;
    }

    pendingDeltaRef.current += 1;
    setTotal((t) => t + 1);
    setMyCount((c) => Math.min(MAX_MY_COUNT, c + 1));
    setStatus('saving');
    scheduleFlush();
  }

  const isActive = myCount > 0;
  const statusText =
    status === 'signed-out'
      ? 'Sign in to clap for this article.'
      : status === 'error'
        ? "Couldn't save your claps — try again."
        : status === 'saving'
          ? 'Saving…'
          : '';

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={`${styles.button} ${isActive ? styles.buttonActive : ''}`}
        onClick={handleClick}
        aria-pressed={isActive}
        aria-label={`Clap for this article. ${myCount} of ${MAX_MY_COUNT} claps used. ${total} total claps.`}
      >
        <ClapIcon />
      </button>
      <span className={styles.count} aria-hidden="true">
        {total}
      </span>
      <span
        className={`${styles.status} ${status === 'error' ? styles.statusError : ''}`}
        aria-live="polite"
      >
        {statusText}
      </span>
    </div>
  );
}
