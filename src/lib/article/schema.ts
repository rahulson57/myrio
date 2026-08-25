/**
 * Article document schema (SPEC-005 "Document schema (the closed world)").
 *
 * This is the ONE allowlisted ProseMirror/Tiptap schema shared by the
 * interactive editor (`src/components/editor/**`, which imports
 * `articleExtensions`) and server-side validation of every write
 * (`sanitizeArticleDocument`, called by `src/server/services/articles.ts`
 * before a `body_json` value is ever persisted). Using the same extension
 * list in both places is what makes "closed world, both client and server"
 * true rather than aspirational — there is exactly one place the allowed
 * node/mark types are declared.
 *
 * `sanitizeArticleDocument` is defense #1 in the sanitization contract:
 * unknown nodes/marks/attrs are DROPPED, never escaped, and the result is
 * what gets stored as `articles.body_json`. `deriveArticleFields` (in
 * `derive.ts`) does its own independent, defense-in-depth clean before
 * rendering the article's HTML — the two are deliberately redundant.
 *
 * `image` is registered `group: 'block'`, `inline: false`, `atom: true` —
 * ProseMirror's own content-matching rejects an image anywhere inline
 * (e.g. as a child of `paragraph`); see `__tests__/schema.test.ts` for a
 * schema-level assertion of both facts.
 */

import { getSchema, type Extensions } from '@tiptap/core';
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
import type { ArticleMark, ArticleNode } from './derive';

/**
 * The block-image node (SPEC-005 "Images are BLOCK nodes — never inline"):
 * `group: 'block'`, `inline: false`, `draggable: true`, `atom: true`.
 * Carries `{ uploadId, src, alt, caption?, width, height }` — `uploadId`
 * is `rendered: false` (never leaks into the HTML `<img>` tag; it is only
 * used server-side for the publish-time ownership check) and is the one
 * attribute `derive.ts`'s own render path deliberately drops that this
 * module's sanitizer must keep, because it is the only record of which
 * upload a stored article references.
 */
export const ArticleImage = Image.extend({
  name: 'image',
  inline: false,
  group: 'block',
  draggable: true,
  atom: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: { default: null },
      width: { default: null },
      height: { default: null },
      caption: { default: null },
    };
  },
});

/** The closed-world extension list — imported as-is by the Tiptap React
 * editor so what the author can type is exactly what the server accepts. */
export const articleExtensions: Extensions = [
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
  }),
];

/** The real ProseMirror `Schema` built from `articleExtensions` — the
 * single source of truth for "what content model does each node have."
 * `sanitizeArticleDocument` below uses its `contentMatch` state machines
 * to decide which children survive in which parent, instead of hand-coded
 * per-type nesting rules that could drift from the schema. */
export const articleSchema = getSchema(articleExtensions);

const ALLOWED_MARK_TYPES = new Set(['bold', 'italic', 'code', 'link']);
const SAFE_HREF = /^(https?:|mailto:)/i;

function cleanMarks(marks: ArticleMark[] | undefined): ArticleMark[] | undefined {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Per-type attribute/mark allowlisting — drops anything the type isn't
 * allowed to carry (a `style` attr, an `onerror`-flavoured mark, an out of
 * range heading level) before structural filtering runs. Returns `null` to
 * drop the node entirely (e.g. a heading whose level isn't 2/3, an image
 * with no `src`, an empty text node). */
function cleanLeafAttrs(node: ArticleNode): ArticleNode | null {
  switch (node.type) {
    case 'text': {
      if (!node.text) return null;
      const marks = cleanMarks(node.marks);
      return marks ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text };
    }
    case 'heading': {
      const level = node.attrs?.level;
      if (level !== 2 && level !== 3) return null;
      return { type: 'heading', attrs: { level }, content: node.content };
    }
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
      if (!src) return null;
      const attrs: Record<string, unknown> = {
        src,
        alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : '',
      };
      if (typeof node.attrs?.width === 'number') attrs.width = node.attrs.width;
      if (typeof node.attrs?.height === 'number') attrs.height = node.attrs.height;
      if (typeof node.attrs?.caption === 'string' && node.attrs.caption) {
        attrs.caption = node.attrs.caption;
      }
      if (typeof node.attrs?.uploadId === 'string' && node.attrs.uploadId) {
        attrs.uploadId = node.attrs.uploadId;
      }
      return { type: 'image', attrs };
    }
    case 'codeBlock': {
      // marks never apply inside a code block, whatever the input claims.
      const text = (node.content ?? [])
        .filter((child) => child.type === 'text' && typeof child.text === 'string')
        .map((child) => child.text)
        .join('');
      return { type: 'codeBlock', content: text ? [{ type: 'text', text }] : [] };
    }
    case 'horizontalRule':
    case 'hardBreak':
      return { type: node.type };
    default:
      // doc, paragraph, blockquote, bulletList, orderedList, listItem —
      // no attrs of their own worth keeping (drops e.g. a `style` attr).
      return { type: node.type, content: node.content };
  }
}

/** Greedy content-model filter: walks `children` in order against
 * `parentType`'s real `contentMatch` state machine, keeping a child only
 * if it advances the match. A child whose type doesn't fit the parent's
 * content expression at its current position is dropped — this is what
 * guarantees an `image` (block, atom) can never survive as a child of
 * `paragraph` (content `inline*`) even if something upstream let it
 * through the per-type attr pass above. */
function filterByContentModel(
  parentTypeName: string,
  children: ArticleNode[],
): ArticleNode[] {
  const parentType = articleSchema.nodes[parentTypeName];
  if (!parentType) return [];
  let match = parentType.contentMatch;
  const kept: ArticleNode[] = [];
  for (const child of children) {
    const childType = articleSchema.nodes[child.type];
    if (!childType) continue;
    const next = match.matchType(childType);
    if (!next) continue;
    match = next;
    kept.push(child);
  }
  return kept;
}

function cleanNode(node: unknown): ArticleNode | null {
  if (!isPlainObject(node) || typeof node.type !== 'string') return null;
  const nodeType = articleSchema.nodes[node.type];
  if (!nodeType) return null;

  const raw: ArticleNode = {
    type: node.type,
    attrs: isPlainObject(node.attrs) ? node.attrs : undefined,
    content: Array.isArray(node.content) ? (node.content as ArticleNode[]) : undefined,
    text: typeof node.text === 'string' ? node.text : undefined,
    marks: Array.isArray(node.marks) ? (node.marks as ArticleMark[]) : undefined,
  };

  // Recursively clean children first (bottom-up) so structural filtering
  // above only ever sees already-valid node shapes.
  const cleanedChildren = (raw.content ?? [])
    .map((child) => cleanNode(child))
    .filter((child): child is ArticleNode => child !== null);

  const leaf = cleanLeafAttrs({ ...raw, content: cleanedChildren });
  if (!leaf) return null;

  if (leaf.content) {
    leaf.content = filterByContentModel(leaf.type, leaf.content);
    // A container that requires non-empty content (e.g. bulletList needs
    // >=1 listItem) but ended up empty after filtering is itself invalid
    // — drop it rather than leave a malformed node. `doc` is handled by
    // the caller (sanitizeArticleDocument), never dropped here.
    if (leaf.content.length === 0 && leaf.type !== 'doc' && !nodeType.contentMatch.validEnd) {
      return null;
    }
  }

  return leaf;
}

/** Falls back to when nothing survives sanitization — an empty paragraph
 * is always valid `doc` content and never throws downstream. */
const EMPTY_DOC: ArticleNode = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };

/**
 * Cleans an arbitrary (untrusted) JSON value into a document that
 * conforms to `articleExtensions`'s closed world: unknown node/mark types,
 * disallowed attributes and structurally-invalid nesting are all dropped,
 * never escaped or coerced into something else. The result is safe to
 * `JSON.stringify` directly into `articles.body_json`, and safe to pass
 * into `deriveArticleFields`.
 */
export function sanitizeArticleDocument(raw: unknown): ArticleNode {
  if (!isPlainObject(raw) || raw.type !== 'doc') return EMPTY_DOC;

  const content = Array.isArray(raw.content) ? (raw.content as unknown[]) : [];
  const cleanedChildren = content
    .map((child) => cleanNode(child))
    .filter((child): child is ArticleNode => child !== null);
  const filtered = filterByContentModel('doc', cleanedChildren);

  const doc: ArticleNode = filtered.length > 0 ? { type: 'doc', content: filtered } : EMPTY_DOC;

  // Final defense-in-depth: the cleaned tree must actually construct and
  // pass ProseMirror's own structural check. This should be unreachable
  // given the filtering above, but a hand-rolled recursive cleaner is not
  // infallible, and this module must never crash the write path.
  try {
    articleSchema.nodeFromJSON(doc).check();
    return doc;
  } catch {
    return EMPTY_DOC;
  }
}

/** `true` if `bodyJson` has at least one non-empty block — the "body >= 1
 * non-empty block" publish-validation rule (SPEC-005 "Publish state
 * machine"). An empty paragraph, or a doc with no content, does not count. */
export function hasNonEmptyBlock(doc: ArticleNode): boolean {
  return (doc.content ?? []).some((node) => !isBlockEmpty(node));
}

function isBlockEmpty(node: ArticleNode): boolean {
  if (node.type === 'image' || node.type === 'horizontalRule') return false;
  if (node.type === 'text') return !node.text;
  if (!node.content || node.content.length === 0) return true;
  return node.content.every((child) => isBlockEmpty(child));
}

/** Every `uploadId` referenced by `image` nodes anywhere in the document
 * (SPEC-005 "Publish-time: validate that every uploadId referenced by the
 * document exists and is owned by the author"). */
export function collectReferencedUploadIds(doc: ArticleNode): string[] {
  const ids: string[] = [];
  const walk = (node: ArticleNode): void => {
    if (node.type === 'image' && typeof node.attrs?.uploadId === 'string') {
      ids.push(node.attrs.uploadId);
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return [...new Set(ids)];
}
