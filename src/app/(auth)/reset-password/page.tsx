'use client';

/** Reset-password form (SPEC-004: `POST /api/auth/reset`). Reached via the
 * URL the `forgot` endpoint prints to the server console
 * (`/reset-password?token=...`). See signup/page.tsx for the
 * `<main>`-ownership note. */

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../auth.module.css';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldError(null);

    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.fields?.password) {
          setFieldError(data.fields.password);
        } else {
          setFormError(data.error ?? 'Something went wrong. Please try again.');
        }
        return;
      }

      router.push('/login');
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.container}>
        <h1 className={styles.heading}>Reset your password</h1>
        <div className={styles.formError} role="alert">
          This reset link is missing its token. Request a new one from{' '}
          <a href="/forgot-password">the forgot-password page</a>.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Choose a new password</h1>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && (
          <div className={styles.formError} role="alert" aria-live="polite">
            {formError}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={fieldError ? 'password-error' : undefined}
            aria-invalid={Boolean(fieldError)}
            minLength={10}
            required
          />
          {fieldError && (
            <span id="password-error" className={styles.fieldError}>
              {fieldError}
            </span>
          )}
        </div>

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
