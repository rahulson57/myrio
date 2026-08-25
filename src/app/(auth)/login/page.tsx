'use client';

/** Login form (SPEC-004: `POST /api/auth/login`). See signup/page.tsx for
 * the `<main>`-ownership note — it applies to every page in this dir. */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../auth.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? 'Something went wrong. Please try again.');
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
      <h1 className={styles.heading}>Sign in</h1>
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
            required
          />
        </div>

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className={styles.meta}>
        <a href="/forgot-password">Forgot password?</a> · New here? <a href="/signup">Get started</a>
      </p>
    </div>
  );
}
