'use client';

import type { SaveStatus as SaveStatusValue } from './useAutosave';
import styles from './SaveStatus.module.css';

function relativeTime(fromMs: number, nowMs: number): string {
  const diffSeconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export interface SaveStatusProps {
  status: SaveStatusValue;
  lastSavedAt: number | null;
  /** Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
}

/** Renders exactly the four documented autosave states (SPEC-005
 * "Autosave contract"), announced via `aria-live="polite"` so a screen
 * reader user hears "Saving…" / "Saved 3s ago" / etc. without focus
 * moving. Deliberately does NOT render the 409 "Opened elsewhere —
 * reload" conflict message — that's a separate, non-status UI (see
 * `Editor.tsx`), not one of the four states. */
export function SaveStatus({ status, lastSavedAt, now = Date.now }: SaveStatusProps) {
  const label = (() => {
    switch (status) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return lastSavedAt ? `Saved ${relativeTime(lastSavedAt, now())}` : 'Saved';
      case 'unsaved':
        return 'Unsaved changes';
      case 'failed':
        return 'Save failed — retry';
    }
  })();

  return (
    <p className={styles.status} data-status={status} aria-live="polite">
      {label}
    </p>
  );
}
