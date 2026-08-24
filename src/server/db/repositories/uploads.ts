import { eq } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { uploads } from '../schema';

export type Upload = typeof uploads.$inferSelect;

export interface CreateUploadInput {
  ownerId: string;
  diskPath: string;
  mime: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  kind: 'avatar' | 'cover' | 'article_image';
}

/**
 * Records an upload's metadata (the file itself is written to disk by a
 * later slice — Media & Uploads — which is the only other caller of this
 * function; it never opens its own connection). `bytes > 5242880` is
 * rejected by the `uploads_max_bytes` CHECK constraint at the DB level.
 */
export function createUpload(db: MyrioDatabase, input: CreateUploadInput): Upload {
  return db
    .insert(uploads)
    .values({
      ownerId: input.ownerId,
      diskPath: input.diskPath,
      mime: input.mime,
      bytes: input.bytes,
      width: input.width ?? null,
      height: input.height ?? null,
      kind: input.kind,
      createdAt: Date.now(),
    })
    .returning()
    .get();
}

export function getUploadById(db: MyrioDatabase, id: string): Upload | undefined {
  return db.select().from(uploads).where(eq(uploads.id, id)).get();
}
