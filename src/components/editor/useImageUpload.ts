'use client';

import { useCallback, useState } from 'react';

/**
 * SPEC-005 "Image upload — CONSUMED, not owned": every byte-level rule (5MB
 * cap, magic-byte allowlist, downscale, EXIF strip, webp re-encode, dedupe,
 * rate limit) belongs to Media & Uploads, which owns `POST /api/uploads`.
 * This hook only implements Article Core's obligations at that boundary:
 * post the file, and on anything other than `201` surface the server's
 * `error` string and insert nothing — no placeholder, no broken `src`.
 */
export interface UploadResult {
  uploadId: string;
  src: string;
  width: number;
  height: number;
}

export type UploadPurpose = 'article' | 'cover';

export interface UseImageUploadResult {
  /** `true` while a request is in flight — render as a non-document
   * loading affordance in the editor chrome, never as a node in the doc. */
  uploading: boolean;
  /** The server's `error` string from the most recent failed upload, or
   * `null`. Cleared at the start of the next upload attempt. */
  error: string | null;
  upload: (file: File) => Promise<UploadResult | null>;
}

export function useImageUpload(purpose: UploadPurpose): UseImageUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('purpose', purpose);

        const response = await fetch('/api/uploads', { method: 'POST', body: formData });

        if (response.status !== 201) {
          const body = await response.json().catch(() => ({ error: undefined }));
          setError(typeof body.error === 'string' ? body.error : 'Upload failed. Please try again.');
          return null;
        }

        return (await response.json()) as UploadResult;
      } catch {
        setError('Upload failed. Please try again.');
        return null;
      } finally {
        setUploading(false);
      }
    },
    [purpose],
  );

  return { uploading, error, upload };
}
