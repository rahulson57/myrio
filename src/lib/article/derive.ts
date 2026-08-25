/**
 * Article derivation (SPEC-002 "Canonical derivation rule", SPEC-005
 * "Sanitization contract"). `deriveArticleFields` is the ONLY writer of
 * `articles.slug`, `body_html`, `excerpt`, `word_count` and
 * `read_time_minutes` anywhere in the codebase.
 *
 * PURITY CONTRACT: same input -> byte-identical output. No `Date.now()`,
 * no `Math.random()`, no I/O, no DB access. Seed Data re-derives every
 * seeded article and asserts byte-equality against the stored columns, so
 * any nondeterminism here fails that gate.
 *
 * SIGNATURE (DEC-025 / IF-001): `deriveArticleFields(bodyJson, meta)`.
 * `slug` needs more than the document body — SPEC-002 defines
 * `articles.slug` as `kebab(title) + '-' + first 8 chars of id`, frozen at
 * first publish. Title and id both live outside `body_json`: SPEC-005's
 * document schema forbids H1 inside the document ("the article title is
 * the only H1", held in the separate `articles.title` column), and `id` is
 * a UUIDv7 assigned independently (see `generateUuidV7` in the Data
 * Layer's `src/server/db/schema.ts`). `meta.title`/`meta.id` are exactly
 * those two documented slug inputs and nothing else — they stay part of
 * this function's pure input, so the same three values in always produce
 * the same five fields out. A caller that doesn't have an id yet (a
 * brand-new draft) generates one up front (e.g. `generateUuidV7()`) and
 * passes the same value through to the repository's `id` override, so the
 * derived slug and the stored row agree. SPEC-002 freezes `slug` at first
 * publish — this function always returns a freshly computed slug; it is
 * the caller's update path that must not overwrite an already-published
 * article's stored slug with a new one.
 *
 * RENDERING (DEC-026): `body_html` is produced via the real SPEC-005
 * pipeline — `@tiptap/html`'s `generateHTML` against an extension set that
 * mirrors SPEC-005's closed-world document schema, then `sanitize-html`
 * with the same allowlist as a second, independent pass. Before either
 * runs, `sanitizeDoc`-style filtering below drops any node/mark/attr
 * outside that closed world — defense in depth so this function never
 * throws on, or leaks, content that upstream schema validation (owned by
 * `src/lib/article/schema.ts`, a later slice) should already have removed.
 */

import { generateHTML } from '@tiptap/html';
import { mergeAttributes } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlock from '@tiptap/extension-code-block';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Image from '@tiptap/extension-image';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import HardBreak from '@tiptap/extension-hard-break';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Code from '@tiptap/extension-code';
import Link from '@tiptap/extension-link';
import sanitizeHtml from 'sanitize-html';

/** A ProseMirror mark, as they appear on `text` nodes in Tiptap JSON. */
export interface ArticleMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** A ProseMirror node in the Tiptap document (SPEC-005's closed world). */
export interface ArticleNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ArticleNode[];
  text?: string;
  marks?: ArticleMark[];
}

export interface DeriveArticleFieldsMeta {
  title: string;
  id: string;
}

export interface DerivedArticleFields {
  slug: string;
  bodyHtml: string;
  excerpt: string;
  wordCount: number;
  readTimeMinutes: number;
}

const EXCERPT_MAX_CHARS = 200;
const WORDS_PER_MINUTE = 200;

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------

const DIACRITICS = /[\u0300-\u036f]/g;

/**
 * ASCII kebab-case: strips diacritics, lowercases, collapses any run of
 * non-alphanumeric characters into a single hyphen, trims leading/trailing
 * hyphens.
 */
function kebabCase(input: string): string {
  return input
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveSlug(title: string, id: string): string {
  const kebabTitle = kebabCase(title);
  const idSuffix = id.replace(/-/g, '').slice(0, 8);
  return kebabTitle ? `${kebabTitle}-${idSuffix}` : idSuffix;
}

// ---------------------------------------------------------------------------
// closed-world conformance (defense in depth ahead of generateHTML)
// ---------------------------------------------------------------------------

const ALLOWED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'image',
  'horizontalRule',
  'hardBreak',
  'text',
]);

const ALLOWED_MARK_TYPES = new Set(['bold', 'italic', 'code', 'link']);
const SAFE_HREF = /^(https?:|mailto:)/i;

function sanitizeMarks(marks: ArticleMark[] | undefined): ArticleMark[] | undefined {
  if (!marks || marks.length === 0) return undefined;
  const cleaned: ArticleMark[] = [];
  for (const mark of marks) {
    if (!ALLOWED_MARK_TYPES.has(mark.type)) continue;
    if (mark.type === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
      if (!SAFE_HREF.test(href)) continue;
      cleaned.push({ type: 'link', attrs: { href } });
    } else {
      cleaned.push({ type: mark.type });
    }
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeChildren(nodes: ArticleNode[] | undefined): ArticleNode[] {
  return (nodes ?? []).map((node) => sanitizeNode(node)).filter((node): node is ArticleNode => node !== null);
}

/** Plain-text-only children, for codeBlock content — marks never apply
 * inside a code block, regardless of what the input claims. */
function plainTextChildren(nodes: ArticleNode[] | undefined): ArticleNode[] {
  const text = (nodes ?? [])
    .filter((node) => node.type === 'text' && typeof node.text === 'string')
    .map((node) => node.text)
    .join('');
  return text ? [{ type: 'text', text }] : [];
}

function sanitizeNode(node: ArticleNode): ArticleNode | null {
  if (!ALLOWED_NODE_TYPES.has(node.type)) return null;

  switch (node.type) {
    case 'text': {
      if (!node.text) return null;
      const marks = sanitizeMarks(node.marks);
      return marks ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text };
    }
    case 'heading': {
      const level = node.attrs?.level;
      if (level !== 2 && level !== 3) return null; // H1 (and anything else) is dropped
      return { type: 'heading', attrs: { level }, content: sanitizeChildren(node.content) };
    }
    case 'codeBlock':
      return { type: 'codeBlock', content: plainTextChildren(node.content) };
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
      if (!src) return null;
      const attrs: Record<string, unknown> = {
        src,
        alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : '',
      };
      if (typeof node.attrs?.width === 'number') attrs.width = node.attrs.width;
      if (typeof node.attrs?.height === 'number') attrs.height = node.attrs.height;
      if (typeof node.attrs?.caption === 'string' && node.attrs.caption) attrs.caption = node.attrs.caption;
      return { type: 'image', attrs };
    }
    case 'horizontalRule':
    case 'hardBreak':
      return { type: node.type };
    default:
      // doc, paragraph, blockquote, bulletList, orderedList, listItem
      return { type: node.type, content: sanitizeChildren(node.content) };
  }
}

// ---------------------------------------------------------------------------
// HTML rendering — @tiptap/html generateHTML against a schema mirroring
// SPEC-005's closed world, then sanitize-html with the same allowlist.
// ---------------------------------------------------------------------------

/** SPEC-005: image is a block-only atom node — never inline, never a
 * child of paragraph — carrying `{ uploadId, src, alt, caption?, width,
 * height }`, rendered as a `<figure>` with explicit width/height so the
 * reading page has zero layout shift. */
const ArticleImage = Image.extend({
  inline: false,
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: { default: null, rendered: false },
      width: { default: null },
      height: { default: null },
      caption: { default: null, rendered: false },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const { src, alt, width, height, caption } = node.attrs as {
      src: string;
      alt: string | null;
      width: number | null;
      height: number | null;
      caption: string | null;
    };
    const img = [
      'img',
      mergeAttributes(HTMLAttributes, {
        src,
        alt: alt ?? '',
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
      }),
    ] as const;
    return caption ? ['figure', {}, img, ['figcaption', {}, caption]] : ['figure', {}, img];
  },
});

const EXTENSIONS = [
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [2, 3] }),
  Blockquote,
  CodeBlock,
  BulletList,
  OrderedList,
  ListItem,
  ArticleImage,
  HorizontalRule,
  HardBreak,
  Bold,
  Italic,
  Code,
  Link.configure({
    protocols: ['http', 'https', 'mailto'],
    autolink: false,
    openOnClick: false,
    HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
  }),
];

const SANITIZE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'h2',
    'h3',
    'blockquote',
    'pre',
    'code',
    'ul',
    'ol',
    'li',
    'img',
    'hr',
    'br',
    'strong',
    'em',
    'a',
    'figure',
    'figcaption',
  ],
  allowedAttributes: {
    img: ['src', 'alt', 'width', 'height'],
    a: ['href', 'rel', 'target'],
  },
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

function renderBodyHtml(cleanDoc: ArticleNode): string {
  const raw = generateHTML(cleanDoc as unknown as Record<string, unknown>, EXTENSIONS);
  return sanitizeHtml(raw, SANITIZE_HTML_OPTIONS);
}

// ---------------------------------------------------------------------------
// plaintext extraction — shared by excerpt + word_count, walks the SAME
// sanitized tree that produced body_html so both stay consistent.
// ---------------------------------------------------------------------------

function plainTextOf(nodes: ArticleNode[] | undefined): string {
  return (nodes ?? []).map((node) => plainTextOfNode(node)).join('');
}

function plainTextOfNode(node: ArticleNode): string {
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'hardBreak':
      return ' ';
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'codeBlock':
    case 'bulletList':
    case 'orderedList':
    case 'listItem':
      return `${plainTextOf(node.content)} `;
    default:
      return '';
  }
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function deriveExcerpt(plainText: string): string {
  if (plainText.length <= EXCERPT_MAX_CHARS) return plainText;
  const cut = plainText.slice(0, EXCERPT_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  const truncated = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${truncated}…`;
}

function deriveWordCount(plainText: string): number {
  if (!plainText) return 0;
  return plainText.split(/\s+/).filter((token) => token.length > 0).length;
}

function deriveReadTimeMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export function deriveArticleFields(bodyJson: ArticleNode, meta: DeriveArticleFieldsMeta): DerivedArticleFields {
  const cleanDoc: ArticleNode = { type: 'doc', content: sanitizeChildren(bodyJson.content) };

  const bodyHtml = renderBodyHtml(cleanDoc);
  const plainText = collapseWhitespace(plainTextOf(cleanDoc.content));
  const wordCount = deriveWordCount(plainText);

  return {
    slug: deriveSlug(meta.title, meta.id),
    bodyHtml,
    excerpt: deriveExcerpt(plainText),
    wordCount,
    readTimeMinutes: deriveReadTimeMinutes(wordCount),
  };
}
