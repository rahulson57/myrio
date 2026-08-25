import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getDb } from '../../../../server/db/client';
import { getSession } from '../../../../server/auth/guard';
import { FollowButton } from '../../../../components/social/FollowButton';
import { getProfileViewModel } from './view-model';
import styles from './page.module.css';

// DEC-056: this plain `[handle]` folder is reached via next.config.ts's
// `rewrites()` entry `{ source: '/@:handle', destination: '/profile/:handle' }`
// — the literal `/@:handle` URL SPEC-007 requires can't be a folder name
// (Next's App Router reserves any `@`-prefixed folder for parallel routes,
// and empirically a literal `@[handle]` folder also breaks `next build`
// outright, not just parallel-route semantics). `params.handle` here really
// is the handle (no [id]-style aliasing needed — nothing else contends for
// this segment name the way DEC-043's `[id]` did).

interface ProfilePageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Builds a `Request` from the incoming RSC request's headers so
 * `getSession` (SPEC-004's guard.ts, typed against the plain Web `Request`)
 * can be reused as-is rather than duplicating session-cookie parsing here.
 * `next/headers`' `headers()` already carries the real `Cookie` header for
 * this request.
 */
async function resolveSession(db: ReturnType<typeof getDb>) {
  const hdrs = await headers();
  const req = new Request('http://localhost:4310/', { headers: hdrs });
  return getSession(req, db);
}

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const { handle } = await params;
  const { tab } = await searchParams;

  const db = getDb();
  const session = await resolveSession(db);
  const vm = getProfileViewModel(db, handle, session, tab);
  if (!vm) {
    notFound();
  }

  return (
    <div className={styles.page}>
      {vm.coverSrc && (
        // Decorative cover banner, dimensions vary per upload; next/image's
        // fixed sizing isn't a fit, and this route isn't the article route
        // the 180 KB budget in tests/perf/budgets.test.ts targets.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vm.coverSrc} alt="" className={styles.cover} width={1500} height={500} />
      )}

      <div className={styles.header}>
        {vm.avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vm.avatarSrc} alt="" width={96} height={96} className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder} aria-hidden="true">
            {vm.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className={styles.identity}>
          <h1 className={styles.displayName}>{vm.displayName}</h1>
          <p className={styles.handle}>@{vm.handle}</p>
          {vm.bio && <p className={styles.bio}>{vm.bio}</p>}

          <div className={styles.links}>
            {vm.socialTwitter && (
              <a href={`https://twitter.com/${vm.socialTwitter}`} className={styles.socialLink} rel="noreferrer">
                @{vm.socialTwitter}
              </a>
            )}
            {vm.socialGithub && (
              <a href={`https://github.com/${vm.socialGithub}`} className={styles.socialLink} rel="noreferrer">
                {vm.socialGithub}
              </a>
            )}
            {vm.socialWebsite && (
              <a href={vm.socialWebsite} className={styles.socialLink} rel="noreferrer">
                {vm.socialWebsite}
              </a>
            )}
          </div>

          <div className={styles.counts}>
            <span>
              <strong>{vm.followerCount}</strong> follower{vm.followerCount === 1 ? '' : 's'}
            </span>
            <span>
              <strong>{vm.followingCount}</strong> following
            </span>
          </div>
        </div>

        <FollowButton
          handle={vm.handle}
          initialFollowing={vm.viewerFollows}
          isSignedIn={vm.isSignedIn}
          isSelf={vm.isOwner}
        />
      </div>

      <nav className={styles.tabs} aria-label="Profile sections">
        <a
          href="?tab=articles"
          className={vm.activeTab === 'articles' ? styles.tabActive : styles.tab}
          aria-current={vm.activeTab === 'articles' ? 'page' : undefined}
        >
          Articles
        </a>
        <a
          href="?tab=about"
          className={vm.activeTab === 'about' ? styles.tabActive : styles.tab}
          aria-current={vm.activeTab === 'about' ? 'page' : undefined}
        >
          About
        </a>
        {vm.isOwner && (
          <a
            href="?tab=drafts"
            className={vm.activeTab === 'drafts' ? styles.tabActive : styles.tab}
            aria-current={vm.activeTab === 'drafts' ? 'page' : undefined}
          >
            Drafts
          </a>
        )}
      </nav>

      {vm.activeTab === 'articles' && (
        <ul className={styles.articleList}>
          {vm.articles.length === 0 && <li className={styles.empty}>No published articles yet.</li>}
          {vm.articles.map((article) => (
            <li key={article.id}>
              <a href={`/@${vm.handle}/${article.slug}`}>{article.title}</a>
            </li>
          ))}
        </ul>
      )}

      {vm.activeTab === 'about' && (
        <div className={styles.about}>
          <p>{vm.bio || 'This author hasn’t written a bio yet.'}</p>
        </div>
      )}

      {vm.activeTab === 'drafts' && vm.isOwner && (
        <ul className={styles.articleList}>
          {vm.drafts.length === 0 && <li className={styles.empty}>No drafts yet.</li>}
          {vm.drafts.map((draft) => (
            <li key={draft.id}>
              <a href={`/new?draft=${draft.id}`}>{draft.title || 'Untitled'}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
