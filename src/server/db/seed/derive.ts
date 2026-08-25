import type { ProseMirrorDoc, ProseMirrorMark, ProseMirrorNode } from './corpus-types';

/**
 * KNOWN GAP (flagged to the coordinator, see task discussion on TASK-019 /
 * MSG-2034 — not silently worked around): SPEC-002/SPEC-005 name
 * `deriveArticleFields(bodyJson)` in `src/lib/article/derive.ts` as the
 * SINGLE, ONLY writer of `slug`/`body_html`/`excerpt`/`word_count`/
 * `read_time_minutes` project-wide, and SPEC-003's own acceptance criteria
 * ask for a "re-derivation check" against that exact function. That module
 * belongs to Article Core (TASK-023), which is not built yet — BUILD_ORDER.md
 * places Article Core (S06) *after* Seed Data (S02) ("Prerequisites: S02,
 * S03, S04"), and TASK-019's own file scope/out-of-scope list forbids
 * building `src/lib/article/**` here. So the byte-identical re-derivation
 * check literally cannot be satisfied by this task in isolation.
 *
 * `deriveSeedArticleFields` below is this module's own, seed-scoped
 * stand-in: it exists only so `createArticle` (which requires these columns
 * as caller-supplied input — see `articles.ts`'s `DerivedArticleFields`) has
 * something deterministic to pass in. It is NOT presented as the project's
 * canonical derivation and nothing outside `src/server/db/seed/**` imports
 * it. Once TASK-023 lands `src/lib/article/derive.ts`, the real
 * re-derivation check belongs there (ideally as an integration test that
 * re-derives every seeded article and compares byte-for-byte against this
 * module's output, since by then the two implementations should agree or
 * seed data should be regenerated through the real function).
 */
export interface SeedDerivedFields {
  slug: string;
  bodyHtml: string;
  excerpt: string;
  wordCount: number;
  readTimeMinutes: number;
}

const WORDS_PER_MINUTE = 225;
const EXCERPT_MAX_CHARS = 160;
const SLUG_MAX_CHARS = 80;

export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_CHARS)
    .replace(/-+$/g, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Fixed, deterministic nesting order for marks so output is stable regardless
 * of the order marks appear in the source JSON. */
const MARK_ORDER: ProseMirrorMark['type'][] = ['code', 'bold', 'italic', 'link'];

function wrapMark(inner: string, mark: ProseMirrorMark): string {
  switch (mark.type) {
    case 'bold':
      return `<strong>${inner}</strong>`;
    case 'italic':
      return `<em>${inner}</em>`;
    case 'code':
      return `<code>${inner}</code>`;
    case 'link': {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '#';
      return `<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">${inner}</a>`;
    }
    default:
      return inner;
  }
}

function renderTextNode(node: ProseMirrorNode): string {
  let html = escapeHtml(node.text ?? '');
  const marks = node.marks ?? [];
  for (const type of MARK_ORDER) {
    const mark = marks.find((m) => m.type === type);
    if (mark) html = wrapMark(html, mark);
  }
  return html;
}

function renderInline(nodes: ProseMirrorNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text') return renderTextNode(node);
      if (node.type === 'hardBreak') return '<br />';
      return '';
    })
    .join('');
}

function renderListItems(items: ProseMirrorNode[] | undefined): string {
  if (!items) return '';
  return items.map((item) => `<li>${(item.content ?? []).map(renderBlock).join('')}</li>`).join('');
}

function renderBlock(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${renderInline(node.content)}</p>`;
    case 'heading': {
      const level = node.attrs?.level === 3 ? 3 : 2;
      return `<h${level}>${renderInline(node.content)}</h${level}>`;
    }
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map(renderBlock).join('')}</blockquote>`;
    case 'codeBlock':
      return `<pre><code>${escapeHtml(
        (node.content ?? []).map((n) => n.text ?? '').join(''),
      )}</code></pre>`;
    case 'bulletList':
      return `<ul>${renderListItems(node.content)}</ul>`;
    case 'orderedList':
      return `<ol>${renderListItems(node.content)}</ol>`;
    case 'horizontalRule':
      return '<hr />';
    default:
      return '';
  }
}

/** Concatenates a run of inline nodes (text + hardBreak) with no inserted
 * spacing — adjacent text nodes in the same paragraph are meant to butt up
 * directly against each other (the source JSON already carries any spaces
 * between them, e.g. `"Hello "` followed by `"world"`). */
function collectInlineText(nodes: ProseMirrorNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.text ?? '';
      if (node.type === 'hardBreak') return ' ';
      return '';
    })
    .join('');
}

/** Plain text for one block-level node. Block children (e.g. list items
 * inside a list, paragraphs inside a blockquote) are joined WITH a space —
 * they are distinct blocks, not a continuous run of inline text. */
function collectBlockText(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return collectInlineText(node.content);
    case 'blockquote':
    case 'bulletList':
    case 'orderedList':
    case 'listItem':
      return (node.content ?? []).map(collectBlockText).join(' ');
    case 'codeBlock':
      return (node.content ?? []).map((n) => n.text ?? '').join('');
    default:
      return '';
  }
}

function extractPlainText(doc: ProseMirrorDoc): string {
  return doc.content
    .map(collectBlockText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(plainText: string): number {
  if (plainText.length === 0) return 0;
  return plainText.split(/\s+/).filter(Boolean).length;
}

function buildExcerpt(plainText: string): string {
  if (plainText.length <= EXCERPT_MAX_CHARS) return plainText;
  const truncated = plainText.slice(0, EXCERPT_MAX_CHARS);
  const lastSpace = truncated.lastIndexOf(' ');
  const cut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${cut}…`;
}

/**
 * Seed-only derivation of the columns `createArticle` requires as
 * caller-supplied input. See the module doc comment above for the
 * cross-slice gap this stands in for.
 */
export function deriveSeedArticleFields(title: string, doc: ProseMirrorDoc): SeedDerivedFields {
  const bodyHtml = doc.content.map(renderBlock).join('');
  const plainText = extractPlainText(doc);
  const wordCount = countWords(plainText);
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
  const excerpt = buildExcerpt(plainText);
  const slug = slugifyTitle(title);

  return { slug, bodyHtml, excerpt, wordCount, readTimeMinutes };
}

export interface CorpusSource {
  work: string;
  author: string;
  url: string;
  license: 'public-domain';
}

/**
 * SECOND KNOWN GAP (flagged, see task discussion / MSG-2044): SPEC-003
 * requires every seeded article to carry non-null provenance "rendered in
 * the article footer" — but SPEC-002's `articles` table (schema.ts, Data
 * Layer, already landed, out of this task's file scope) has no
 * work/author/url/license columns at all. There is nowhere else to put it.
 *
 * Resolution: append a provenance block — a `horizontalRule` then a
 * `paragraph` (both in the SPEC-005 allowlist) — to the END of the
 * article's own `bodyJson` before deriving `bodyHtml`, so provenance is
 * literally rendered in the article body's footer and lands in the stored
 * `body_html` using only existing columns. Returns a NEW doc; does not
 * mutate `doc`. Called before `deriveSeedArticleFields` so the stored
 * `bodyJson` and the derived `bodyHtml`/`excerpt`/`wordCount` all agree
 * (re-derivation determinism holds either way, since both are derived from
 * the same, already-appended doc).
 */
export function appendProvenanceFooter(doc: ProseMirrorDoc, source: CorpusSource): ProseMirrorDoc {
  const footerText = `Source: "${source.work}" by ${source.author} — ${source.url} — license: ${source.license}.`;
  return {
    type: 'doc',
    content: [
      ...doc.content,
      { type: 'horizontalRule' },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: footerText, marks: [{ type: 'italic' }] }],
      },
    ],
  };
}
