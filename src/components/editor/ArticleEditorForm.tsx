'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Editor } from './Editor';
import { Toolbar } from './Toolbar';
import { SaveStatus } from './SaveStatus';
import { useAutosave, type SaveOutcome } from './useAutosave';
import styles from './ArticleEditorForm.module.css';

const MAX_TAGS = 5;

export interface ArticleDraftData {
  id: string;
  title: string;
  subtitle: string | null;
  bodyJson: unknown;
  tags: string[];
  coverUploadId: string | null;
  /** `articles.updated_at` — the optimistic-lock token (SPEC-005
   * autosave contract). */
  updatedAt: number;
  status: 'draft' | 'published';
}

export interface SavePayload {
  title: string;
  subtitle: string | null;
  bodyJson: unknown;
  tags: string[];
  coverUploadId: string | null;
  baseVersion: number;
}

/** Richer than the generic `useAutosave` outcome — a successful save also
 * reports the row's new `updated_at`, which becomes the next call's
 * `baseVersion`. Without threading this through, every save after the
 * first would be rejected as a false conflict. */
export type FormSaveOutcome = { ok: true; updatedAt: number } | { ok: false; conflict?: boolean };

export type PublishOutcome = { ok: true } | { ok: false; errors: Record<string, string> };

export interface ArticleEditorFormProps {
  initial: ArticleDraftData;
  onSave: (payload: SavePayload) => Promise<FormSaveOutcome>;
  onPublish: () => Promise<PublishOutcome>;
  onReload?: () => void;
}

/**
 * The composed write-path UI (SPEC-005 "Autosave contract", "Publish state
 * machine"). Deliberately takes `onSave`/`onPublish` as props rather than
 * calling `fetch` itself — the actual `PATCH /api/drafts/:id` and
 * `POST /api/drafts/:id/publish` route handlers need session resolution
 * (SPEC-004, `src/server/auth/session.ts`) that this component has no
 * business knowing about. A thin `src/app/(write)/**` page wires the real
 * endpoints in; this is the part that's fully unit-testable without one.
 */
export function ArticleEditorForm({ initial, onSave, onPublish, onReload }: ArticleEditorFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [bodyJson, setBodyJson] = useState<unknown>(initial.bodyJson);
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [publishErrors, setPublishErrors] = useState<Record<string, string> | null>(null);
  const [publishing, setPublishing] = useState(false);

  const baseVersionRef = useRef(initial.updatedAt);

  const value = useMemo(() => ({ title, subtitle, bodyJson, tags }), [title, subtitle, bodyJson, tags]);

  const handleSave = useCallback(
    async (v: typeof value): Promise<SaveOutcome> => {
      const outcome = await onSave({
        title: v.title,
        subtitle: v.subtitle || null,
        bodyJson: v.bodyJson,
        tags: v.tags,
        coverUploadId: initial.coverUploadId,
        baseVersion: baseVersionRef.current,
      });
      if (outcome.ok) {
        baseVersionRef.current = outcome.updatedAt;
        return { ok: true };
      }
      return { ok: false, conflict: outcome.conflict };
    },
    [onSave, initial.coverUploadId],
  );

  const autosave = useAutosave({ value, onSave: handleSave });

  const addTag = useCallback(() => {
    const next = tagDraft.trim();
    if (!next || tags.length >= MAX_TAGS || tags.includes(next)) return;
    setTags((prev) => [...prev, next]);
    setTagDraft('');
  }, [tagDraft, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    setPublishErrors(null);
    autosave.flush();
    const result = await onPublish();
    setPublishing(false);
    if (!result.ok) {
      setPublishErrors(result.errors);
    }
  }, [autosave, onPublish]);

  return (
    <form aria-label="Article editor" onSubmit={(e) => e.preventDefault()}>
      {autosave.conflict && (
        <div className={styles.conflictBanner} role="alert">
          <span>Opened elsewhere — reload to see the latest version.</span>
          {onReload && (
            <button type="button" className={styles.reloadButton} onClick={onReload}>
              Reload
            </button>
          )}
        </div>
      )}

      <div className={styles.header}>
        <SaveStatus status={autosave.status} lastSavedAt={autosave.lastSavedAt} />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.publishButton}
            onClick={handlePublish}
            disabled={publishing || autosave.conflict}
          >
            {initial.status === 'published' ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>

      {publishErrors && (
        <ul className={styles.errorList}>
          {Object.entries(publishErrors).map(([field, message]) => (
            <li key={field} id={`publish-error-${field}`}>
              {message}
            </li>
          ))}
        </ul>
      )}

      <input
        className={styles.titleInput}
        placeholder="Title"
        aria-label="Title"
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className={styles.subtitleInput}
        placeholder="Subtitle (optional)"
        aria-label="Subtitle"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
      />

      <div className={styles.tagsRow} role="group" aria-label="Tags">
        {tags.map((tag) => (
          <span key={tag} className={styles.tagPill}>
            {tag}
            <button
              type="button"
              className={styles.tagRemove}
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length < MAX_TAGS && (
          <input
            className={styles.tagInput}
            aria-label="Add a tag"
            placeholder="Add a tag"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
        )}
      </div>

      <Toolbar editor={editor} />
      <Editor content={bodyJson} onUpdate={setBodyJson} onEditorReady={setEditor} />
    </form>
  );
}
