'use client';

import { useState } from 'react';
import styles from './CommentItem.module.css';

export interface CommentItemData {
  id: string;
  authorHandle: string;
  authorDisplayName: string;
  bodyText: string;
  createdAt: number;
  deletedAt: number | null;
}

export interface CommentItemProps {
  comment: CommentItemData;
  /** Resolved server-side (viewer is the comment author or the article author) — this component makes no authorization decisions of its own. */
  canDelete: boolean;
  onDeleted?: (id: string) => void;
}

/**
 * A single comment (SPEC-007 "Comments"). Body text is rendered as an
 * ordinary React child — never `dangerouslySetInnerHTML` — so it is always
 * HTML-escaped by React itself; a `bodyText` of `<script>alert(1)</script>`
 * renders as the literal string, not a script element (SPEC-007 acceptance
 * criterion, and the project-wide XSS boundary: comments are plaintext
 * only, no rendering path here treats them as markup).
 *
 * A soft-deleted comment (`deletedAt != null`) renders the fixed "This
 * comment was deleted" placeholder instead of `bodyText` (which the
 * repository already blanks to `''` on delete) and hides the delete
 * control — nothing left to delete.
 */
export function CommentItem({ comment, canDelete, onDeleted }: CommentItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(false);
  const isDeleted = comment.deletedAt !== null;

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(false);

    try {
      const res = await fetch(`/api/comments/${comment.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(true);
        return;
      }
      onDeleted?.(comment.id);
    } catch {
      setError(true);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <li className={styles.item}>
      <div className={styles.header}>
        <a href={`/@${comment.authorHandle}`} className={styles.author}>
          {comment.authorDisplayName}
        </a>
        <time className={styles.time} dateTime={new Date(comment.createdAt).toISOString()}>
          {new Date(comment.createdAt).toLocaleDateString()}
        </time>
      </div>

      <p className={isDeleted ? styles.bodyDeleted : styles.body}>
        {isDeleted ? 'This comment was deleted' : comment.bodyText}
      </p>

      {canDelete && !isDeleted && (
        <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      )}
      {error && <span role="status">Couldn&rsquo;t delete — try again.</span>}
    </li>
  );
}
