'use client';

import styles from './Toast.module.css';

export interface ToastProps {
  message: string;
  onDismiss: () => void;
}

/** A failure toast (SPEC-005: a non-201 upload "surfaces a failure toast").
 * `role="alert"` + implicit `aria-live="assertive"` announces it the
 * moment it mounts, without stealing focus. */
export function Toast({ message, onDismiss }: ToastProps) {
  return (
    <div className={styles.toast} role="alert">
      <span>{message}</span>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
