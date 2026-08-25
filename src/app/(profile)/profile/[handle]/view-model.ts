/**
 * Pure data-assembly for the profile page (SPEC-007 "Profile"), split out of
 * `page.tsx` so it's unit-testable without a Next.js server-component
 * runtime (`next/headers`/`next/navigation` aren't mockable under plain
 * `vitest run` the way this project is set up — no precedent for it
 * anywhere else in the repo). `page.tsx` stays a thin RSC wrapper: resolve
 * the session from request headers, call this, `notFound()` on `null`,
 * render the result.
 */

import type { MyrioDatabase } from '../../../../server/db/client';
import type { Session } from '../../../../server/auth/guard';
import { getProfileByHandle } from '../../../../server/services/profiles';
import { countFollowers, countFollowing, isFollowing } from '../../../../server/db/repositories/follows';
import { listArticlesByAuthor, type Article } from '../../../../server/db/repositories/articles';
import { getUploadById } from '../../../../server/db/repositories/uploads';

export type ProfileTab = 'articles' | 'about' | 'drafts';

export interface ProfileViewModel {
  displayName: string;
  handle: string;
  bio: string | null;
  socialTwitter: string | null;
  socialGithub: string | null;
  socialWebsite: string | null;
  avatarSrc: string | null;
  coverSrc: string | null;
  followerCount: number;
  followingCount: number;
  viewerFollows: boolean;
  isSignedIn: boolean;
  /** True when the viewer IS this profile (SPEC-007: only the owner sees the Drafts tab / drafts data). */
  isOwner: boolean;
  activeTab: ProfileTab;
  articles: Article[];
  /** Always `[]` for a non-owner, regardless of the requested tab — never populated for anyone but the owner. */
  drafts: Article[];
}

function resolveUploadPath(db: MyrioDatabase, uploadId: string | null): string | null {
  if (!uploadId) return null;
  const upload = getUploadById(db, uploadId);
  // `diskPath` is Media & Uploads' (SPEC-011) contract: files land under
  // `public/uploads/**`, the same path Next serves statically.
  return upload ? upload.diskPath : null;
}

/**
 * Resolves everything the profile page needs to render, or `null` if
 * `handle` doesn't name a user (caller should render a 404). `requestedTab`
 * is whatever the `?tab=` query param said; it's downgraded to `'articles'`
 * if it names `'drafts'` and the viewer isn't the owner — a non-owner
 * can't reach the Drafts tab by URL-guessing any more than by clicking a
 * tab that was never rendered for them.
 */
export function getProfileViewModel(
  db: MyrioDatabase,
  handle: string,
  session: Session | null,
  requestedTab: string | undefined,
): ProfileViewModel | null {
  const profile = getProfileByHandle(db, handle);
  if (!profile) return null;

  const isOwner = session?.userId === profile.id;
  const activeTab: ProfileTab =
    requestedTab === 'about' ? 'about' : requestedTab === 'drafts' && isOwner ? 'drafts' : 'articles';

  return {
    displayName: profile.displayName,
    handle: profile.handle,
    bio: profile.bio,
    socialTwitter: profile.socialTwitter,
    socialGithub: profile.socialGithub,
    socialWebsite: profile.socialWebsite,
    avatarSrc: resolveUploadPath(db, profile.avatarUploadId),
    coverSrc: resolveUploadPath(db, profile.coverUploadId),
    followerCount: countFollowers(db, profile.id),
    followingCount: countFollowing(db, profile.id),
    viewerFollows: session ? isFollowing(db, session.userId, profile.id) : false,
    isSignedIn: session !== null,
    isOwner,
    activeTab,
    articles: activeTab === 'articles' ? listArticlesByAuthor(db, profile.id, 'published') : [],
    drafts: activeTab === 'drafts' && isOwner ? listArticlesByAuthor(db, profile.id, 'draft') : [],
  };
}
