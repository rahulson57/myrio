'use client';

/**
 * Signup form (SPEC-004: `POST /api/auth/signup`). No `<main>` wrapper here
 * — App Shell's root layout (TASK-001) owns the single `<main id="main">`
 * every route renders inside (SPEC-009); this page is just that route's
 * content.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../auth.module.css';

interface FieldErrors {
  [field: string]: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, handle, displayName }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.fields) {
          setFieldErrors(data.fields);
        } else {
          setFormError(data.error ?? 'Something went wrong. Please try again.');
        }
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Create your account</h1>
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
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            aria-invalid={Boolean(fieldErrors.email)}
            required
          />
          {fieldErrors.email && (
            <span id="email-error" className={styles.fieldError}>
              {fieldErrors.email}
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="handle">
            Handle
          </label>
          <input
            id="handle"
            name="handle"
            type="text"
            className={styles.input}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            aria-describedby={fieldErrors.handle ? 'handle-error' : undefined}
            aria-invalid={Boolean(fieldErrors.handle)}
            required
          />
          {fieldErrors.handle && (
            <span id="handle-error" className={styles.fieldError}>
              {fieldErrors.handle}
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="displayName">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            className={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-describedby={fieldErrors.displayName ? 'displayName-error' : undefined}
            aria-invalid={Boolean(fieldErrors.displayName)}
            required
          />
          {fieldErrors.displayName && (
            <span id="displayName-error" className={styles.fieldError}>
              {fieldErrors.displayName}
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            aria-invalid={Boolean(fieldErrors.password)}
            minLength={10}
            required
          />
          {fieldErrors.password && (
            <span id="password-error" className={styles.fieldError}>
              {fieldErrors.password}
            </span>
          )}
        </div>

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Creating account…' : 'Get started'}
        </button>
      </form>
      <p className={styles.meta}>
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </div>
  );
}
