'use client';

import { useId, useRef, useState } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { useImageUpload, type UploadPurpose } from './useImageUpload';
import { Toast } from './Toast';
import styles from './ImageUploadButton.module.css';

export interface ImageUploadButtonProps {
  editor: TiptapEditor | null;
  purpose?: UploadPurpose;
  label?: string;
}

/**
 * SPEC-005 "Image upload — CONSUMED, not owned" boundary, end to end:
 * posts the picked file to `POST /api/uploads`, and on `201` inserts a
 * block `image` node carrying the returned `src`/`width`/`height` and the
 * `uploadId` (needed later for the publish-time ownership check). On
 * anything else, the document is left untouched and a failure toast shows
 * the server's error — never a placeholder or broken-`src` node.
 */
export function ImageUploadButton({ editor, purpose = 'article', label = 'Add image' }: ImageUploadButtonProps) {
  const { uploading, error, upload } = useImageUpload(purpose);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const visibleError = error && error !== dismissedError ? error : null;

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;

    const result = await upload(file);
    if (!result) return; // non-201: nothing inserted, error toast renders below

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: {
          src: result.src,
          uploadId: result.uploadId,
          width: result.width,
          height: result.height,
          alt: '',
        },
      })
      .run();
  };

  return (
    <div className={styles.wrapper}>
      <label htmlFor={inputId} className={styles.button} aria-disabled={uploading}>
        {uploading ? 'Uploading…' : label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className={styles.hiddenInput}
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={handleChange}
      />
      {visibleError && <Toast message={visibleError} onDismiss={() => setDismissedError(visibleError)} />}
    </div>
  );
}
