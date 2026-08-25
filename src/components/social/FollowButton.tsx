'use client';

import { useState } from 'react';
import styles from './FollowButton.module.css';

export interface FollowButtonProps {
  handle: string;
  initialFollowing: boolean;
  /** Viewer isn't signed in — clicking should prompt sign-in rather than call the API (which would 401). */
  isSignedIn: boolean;
  /** Viewer IS this profile — SPEC-007: following yourself is rejected (400). Don't render a button that can only fail. */
  isSelf: boolean;
}

/**
 * The profile page's follow control (SPEC-007 "Follows"). Both directions
 * are idempotent server-side, so this component never needs to worry about
 * double-submitting landing wrong — a click during an in-flight request
 * just gets ignored (`isPendingRef`-style guard via `pending` state) rather
 * than needing a request queue like the clap button's additive batching.
 */
export function FollowButton({ handle, initialFollowing, isSignedIn, isSelf }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  if (isSelf) {
    return null;
  }

  async function handleClick() {
    if (!isSignedIn) {
      setError(true);
      return;
    }
    if (pending) return;

    const nextFollowing = !following;
    setFollowing(nextFollowing);
    setError(false);
    setPending(true);

    try {
      const res = await fetch(`/api/users/${handle}/follow`, {
        method: nextFollowing ? 'POST' : 'DELETE',
      });

      if (!res.ok) {
        setFollowing(!nextFollowing);
        setError(true);
        return;
      }

      const body = (await res.json()) as { following: boolean };
      setFollowing(body.following);
    } catch {
      setFollowing(!nextFollowing);
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.button} ${following ? styles.buttonFollowing : ''}`}
        onClick={handleClick}
        aria-pressed={following}
      >
        {following ? 'Following' : 'Follow'}
      </button>
      {error && (
        <span className={styles.status} role="status">
          {isSignedIn ? "Couldn't update — try again." : 'Sign in to follow.'}
        </span>
      )}
    </>
  );
}
