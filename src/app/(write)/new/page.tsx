'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArticleEditorForm,
  type ArticleDraftData,
  type FormSaveOutcome,
  type PublishOutcome,
  type SavePayload,
} from '../../../components/editor/ArticleEditorForm';

interface CreateDraftResponse {
  article: {
    id: string;
    title: string;
    subtitle: string | null;
    bodyJson: string;
    coverUploadId: string | null;
    updatedAt: number;
    status: 'draft' | 'published';
  };
}

/**
 * `Write` → `/new` (SPEC-009 header nav). Creates an empty draft on mount
 * (`POST /api/drafts`) and hands the rest to `ArticleEditorForm`, whose
 * `onSave`/`onPublish` props wrap the actual `PATCH`/`publish` endpoints —
 * this file's only job is the fetch plumbing session-aware route handlers
 * need, which `ArticleEditorForm` deliberately knows nothing about.
 *
 * No `<main>`/heading wrapper here: the root layout (`src/app/layout.tsx`,
 * App Shell's file) already provides the page's one `<main id="main">`.
 */
export default function NewArticlePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ArticleDraftData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (res.status !== 201) {
          setError('Could not start a new draft. Please try again.');
          return;
        }
        const data = (await res.json()) as CreateDraftResponse;
        setDraft({
          id: data.article.id,
          title: data.article.title,
          subtitle: data.article.subtitle,
          bodyJson: JSON.parse(data.article.bodyJson),
          tags: [],
          coverUploadId: data.article.coverUploadId,
          updatedAt: data.article.updatedAt,
          status: data.article.status,
        });
      })
      .catch(() => {
        if (!cancelled) setError('Could not start a new draft. Please try again.');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);

  const handleSave = async (payload: SavePayload): Promise<FormSaveOutcome> => {
    if (!draft) return { ok: false };
    const res = await fetch(`/api/drafts/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 200) {
      const data = (await res.json()) as CreateDraftResponse;
      return { ok: true, updatedAt: data.article.updatedAt };
    }
    return { ok: false, conflict: res.status === 409 };
  };

  const handlePublish = async (): Promise<PublishOutcome> => {
    if (!draft) return { ok: false, errors: {} };
    const res = await fetch(`/api/drafts/${draft.id}/publish`, { method: 'POST' });
    if (res.status === 200) {
      // Editing continues in place — there's no separate published-article
      // edit route in this slice yet (Feed & Read, a later slice, owns
      // the public /@handle/:slug reading page this would eventually link
      // to).
      return { ok: true };
    }
    const data = (await res.json().catch(() => ({ error: {} }))) as { error: Record<string, string> };
    return { ok: false, errors: data.error ?? {} };
  };

  if (error) return <p role="alert">{error}</p>;
  if (!draft) return <p aria-live="polite">Starting a new draft…</p>;

  return (
    <ArticleEditorForm
      initial={draft}
      onSave={handleSave}
      onPublish={handlePublish}
      onReload={() => window.location.reload()}
    />
  );
}
