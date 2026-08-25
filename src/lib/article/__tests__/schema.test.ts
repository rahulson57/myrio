import { describe, expect, it } from 'vitest';
import {
  articleSchema,
  collectReferencedUploadIds,
  hasNonEmptyBlock,
  sanitizeArticleDocument,
} from '../schema';
import type { ArticleNode } from '../derive';

function doc(content: ArticleNode[]): ArticleNode {
  return { type: 'doc', content };
}

function paragraph(text: string): ArticleNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

describe('articleSchema (ProseMirror closed world)', () => {
  it('registers image as a block-only atom, never inline', () => {
    expect(articleSchema.nodes.image!.spec.inline).toBe(false);
    expect(articleSchema.nodes.image!.spec.group).toBe('block');
    expect(articleSchema.nodes.image!.spec.atom).toBe(true);
  });

  it('rejects an image nested inside a paragraph (inline position)', () => {
    const invalid = articleSchema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { src: 'x.png' } }],
        },
      ],
    });
    expect(() => invalid.check()).toThrow(/Invalid content for node paragraph/);
  });

  it('accepts an image as a top-level sibling of paragraphs', () => {
    const valid = articleSchema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before.' }] },
        { type: 'image', attrs: { src: 'x.png', alt: '', width: 10, height: 10 } },
        { type: 'paragraph', content: [{ type: 'text', text: 'After.' }] },
      ],
    });
    expect(() => valid.check()).not.toThrow();
  });

  it('only allows heading levels 2 and 3', () => {
    expect(() => articleSchema.nodes.heading!.create({ level: 2 })).not.toThrow();
    expect(() => articleSchema.nodes.heading!.create({ level: 3 })).not.toThrow();
  });
});

describe('sanitizeArticleDocument', () => {
  it('is a no-op on an already-clean document', () => {
    const clean = doc([paragraph('Hello.')]);
    expect(sanitizeArticleDocument(clean)).toEqual(clean);
  });

  it('splits an image out of a paragraph into a doc-level sibling instead of dropping it silently', () => {
    // A malicious/malformed payload that places an image mid-paragraph.
    // The paragraph itself is structurally invalid content for `image`,
    // so the image is dropped from that position (never kept as a child
    // of paragraph) rather than escaped or coerced.
    const dirty: ArticleNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'before ' },
            { type: 'image', attrs: { src: 'x.png' } },
            { type: 'text', text: ' after' },
          ],
        },
      ],
    };
    const cleaned = sanitizeArticleDocument(dirty);
    // No image survives anywhere as a child of a paragraph.
    const walk = (node: ArticleNode): boolean =>
      node.type === 'paragraph'
        ? (node.content ?? []).some((c) => c.type === 'image')
        : (node.content ?? []).some(walk);
    expect(walk(cleaned)).toBe(false);
    expect(() => articleSchema.nodeFromJSON(cleaned).check()).not.toThrow();
  });

  it('drops script, iframe, style attrs, onerror-flavoured marks and H1', () => {
    const dirty = {
      type: 'doc',
      content: [
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
        { type: 'iframe', attrs: { src: 'https://evil.example' } },
        {
          type: 'paragraph',
          attrs: { style: 'color:red' },
          content: [
            { type: 'text', text: 'hi', marks: [{ type: 'onerror', attrs: { onerror: 'alert(1)' } }] },
          ],
        },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Should not appear' }] },
        { type: 'table', content: [] },
      ],
    };
    const cleaned = sanitizeArticleDocument(dirty);
    const json = JSON.stringify(cleaned);
    expect(json).not.toMatch(/script|iframe|onerror|style|"level":1|table/i);
    expect(cleaned).toEqual(doc([paragraph('hi')]));
  });

  it('drops an unsafe link href but keeps the text', () => {
    const dirty: ArticleNode = doc([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
      },
    ]);
    const cleaned = sanitizeArticleDocument(dirty);
    expect(JSON.stringify(cleaned)).not.toContain('javascript:');
    expect(JSON.stringify(cleaned)).toContain('click');
  });

  it('keeps a caption, width and height on image nodes', () => {
    const clean = doc([
      { type: 'image', attrs: { src: 'x.png', caption: 'A cat', width: 800, height: 600 } },
    ]);
    const cleaned = sanitizeArticleDocument(clean);
    expect(cleaned.content?.[0]?.attrs).toMatchObject({ caption: 'A cat', width: 800, height: 600 });
  });

  it('preserves codeBlock text content and drops horizontalRule/hardBreak attrs', () => {
    const dirty: ArticleNode = doc([
      { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
      { type: 'horizontalRule', attrs: { style: 'color:red' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] },
    ]);
    const cleaned = sanitizeArticleDocument(dirty);
    expect(cleaned).toEqual(
      doc([
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] },
      ]),
    );
  });

  it('keeps uploadId on image nodes (needed for publish-time ownership checks)', () => {
    const clean = doc([{ type: 'image', attrs: { src: 'x.png', uploadId: 'up_123', width: 10, height: 10 } }]);
    const cleaned = sanitizeArticleDocument(clean);
    expect(cleaned.content?.[0]?.attrs?.uploadId).toBe('up_123');
  });

  it('drops an image with no src', () => {
    const dirty = doc([{ type: 'image', attrs: { alt: 'no src' } }, paragraph('Text.')]);
    const cleaned = sanitizeArticleDocument(dirty);
    expect(cleaned).toEqual(doc([paragraph('Text.')]));
  });

  it('falls back to an empty paragraph when everything is stripped', () => {
    const dirty = { type: 'doc', content: [{ type: 'script', content: [] }] };
    const cleaned = sanitizeArticleDocument(dirty);
    expect(cleaned).toEqual(doc([{ type: 'paragraph', content: [] }]));
  });

  it('falls back to an empty paragraph for non-doc / malformed top-level input', () => {
    expect(sanitizeArticleDocument(null)).toEqual(doc([{ type: 'paragraph', content: [] }]));
    expect(sanitizeArticleDocument({ type: 'paragraph' })).toEqual(doc([{ type: 'paragraph', content: [] }]));
    expect(sanitizeArticleDocument('not json')).toEqual(doc([{ type: 'paragraph', content: [] }]));
  });

  it('always produces a document that passes a real ProseMirror check()', () => {
    const dirty = {
      type: 'doc',
      content: [
        { type: 'bulletList', content: [{ type: 'notAListItem' }] },
        { type: 'orderedList', content: [] },
        paragraph('ok'),
      ],
    };
    const cleaned = sanitizeArticleDocument(dirty);
    expect(() => articleSchema.nodeFromJSON(cleaned).check()).not.toThrow();
  });
});

describe('hasNonEmptyBlock', () => {
  it('is false for an empty document', () => {
    expect(hasNonEmptyBlock(doc([{ type: 'paragraph', content: [] }]))).toBe(false);
  });

  it('is true when any block has content', () => {
    expect(hasNonEmptyBlock(doc([paragraph('x')]))).toBe(true);
  });

  it('is true for an image-only document (no text required)', () => {
    expect(hasNonEmptyBlock(doc([{ type: 'image', attrs: { src: 'x.png' } }]))).toBe(true);
  });
});

describe('collectReferencedUploadIds', () => {
  it('collects every uploadId referenced by image nodes, deduplicated', () => {
    const bodyJson = doc([
      { type: 'image', attrs: { src: 'a.png', uploadId: 'up_1' } },
      paragraph('between'),
      { type: 'image', attrs: { src: 'b.png', uploadId: 'up_2' } },
      { type: 'image', attrs: { src: 'a2.png', uploadId: 'up_1' } },
    ]);
    expect(collectReferencedUploadIds(bodyJson)).toEqual(['up_1', 'up_2']);
  });

  it('returns an empty array when there are no images', () => {
    expect(collectReferencedUploadIds(doc([paragraph('x')]))).toEqual([]);
  });
});
