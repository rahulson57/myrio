'use client';

/** Forgot-password form (SPEC-004: `POST /api/auth/forgot`). Dev-only reset
 * mechanism — no email provider; the server console prints the reset URL.
 * See signup/page.tsx for the `<main>`-ownership note. */

import { useState, type FormEvent } from 'react';
import styles from '../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      // SPEC-004: response is generic regardless of whether the email
      // exists, so the UI can't (and shouldn't) distinguish either.
      setSubmitted(true);
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Reset your password</h1>

      {submitted ? (
        <p role="status" aria-live="polite">
          If that email is registered, a reset link was sent.
        </p>
      ) : (
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {formError && (
            <div className={styles.formError} role="alert" aria-live="polite">
              {formError}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className={styles.meta}>
        <a href="/login">Back to sign in</a>
      </p>
    </div>
  );
}
