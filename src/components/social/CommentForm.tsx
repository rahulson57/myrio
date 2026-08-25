'use client';

import { useId, useState } from 'react';
import styles from './CommentForm.module.css';

// Mirrors src/server/services/comments.ts's BODY_MIN_LENGTH/BODY_MAX_LENGTH
// (not imported directly — that module is server-only and pulls in
// Data Layer repositories, which must not end up in the client bundle).
const BODY_MIN_LENGTH = 1;
const BODY_MAX_LENGTH = 2000;

export interface NewComment {
  id: string;
  authorHandle: string;
  authorDisplayName: string;
  bodyText: string;
  createdAt: number;
  deletedAt: null;
}

export interface CommentFormProps {
  articleId: string;
  /** Set when composing a reply instead of a top-level comment (SPEC-007: single level only). */
  parentId?: string;
  isSignedIn: boolean;
  onSubmitted?: (comment: NewComment) => void;
  onCancel?: () => void;
}

/**
 * The comment/reply composer (SPEC-007 "Comments"). Body is plaintext
 * only — a plain `<textarea>`, no rich-text control — 1-2000 chars,
 * enforced here for immediate feedback AND re-enforced server-side (this
 * client check is a UX nicety, never the authority).
 */
export function CommentForm({ articleId, parentId, isSignedIn, onSubmitted, onCancel }: CommentFormProps) {
  const [bodyText, setBodyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaId = useId();

  const trimmedLength = bodyText.length;
  const isOverLimit = trimmedLength > BODY_MAX_LENGTH;
  const isValid = trimmedLength >= BODY_MIN_LENGTH && !isOverLimit;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isSignedIn) {
      setError('Sign in to comment.');
      return;
    }
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/articles/${articleId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyText, parentId }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't post your comment — try again.");
        return;
      }

      const comment = (await res.json()) as NewComment;
      setBodyText('');
      onSubmitted?.(comment);
    } catch {
      setError("Couldn't post your comment — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor={textareaId} className="visually-hidden">
        {parentId ? 'Write a reply' : 'Write a comment'}
      </label>
      <textarea
        id={textareaId}
        className={styles.textarea}
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        placeholder={parentId ? 'Write a reply…' : 'Write a comment…'}
        aria-describedby={`${textareaId}-count`}
        aria-invalid={isOverLimit}
      />
      <div className={styles.footer}>
        <span id={`${textareaId}-count`} className={`${styles.count} ${isOverLimit ? styles.countOverLimit : ''}`}>
          {trimmedLength}/{BODY_MAX_LENGTH}
        </span>
        <span>
          {parentId && onCancel && (
            <button type="button" onClick={onCancel} className={styles.cancel}>
              Cancel
            </button>
          )}
          <button type="submit" className={styles.submit} disabled={!isValid || submitting}>
            {submitting ? 'Posting…' : parentId ? 'Reply' : 'Comment'}
          </button>
        </span>
      </div>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
