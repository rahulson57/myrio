import { describe, expect, it } from 'vitest';
import { appendProvenanceFooter, deriveSeedArticleFields, slugifyTitle } from '../derive';
import type { ProseMirrorDoc } from '../corpus-types';

describe('slugifyTitle', () => {
  it('lowercases, replaces non-alphanumerics with hyphens, and trims edge hyphens', () => {
    expect(slugifyTitle('The Lamp at Merrow Point')).toBe('the-lamp-at-merrow-point');
    expect(slugifyTitle('  Spaces & Punctuation!! ')).toBe('spaces-punctuation');
  });

  it('caps length and never ends with a hyphen', () => {
    const long = 'a'.repeat(100);
    const slug = slugifyTitle(long);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('deriveSeedArticleFields', () => {
  const doc: ProseMirrorDoc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Intro' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
          { type: 'text', text: '.' },
        ],
      },
      {
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A quoted line.' }] }],
      },
    ],
  };

  it('renders headings/paragraphs/blockquotes/marks to HTML, escaping raw text', () => {
    const fields = deriveSeedArticleFields('A Title', doc);
    expect(fields.bodyHtml).toBe(
      '<h2>Intro</h2><p>Hello <strong>world</strong>.</p><blockquote><p>A quoted line.</p></blockquote>',
    );
  });

  it('escapes HTML-significant characters instead of interpreting them', () => {
    const xssDoc: ProseMirrorDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '<script>alert(1)</script> & "quotes"' }],
        },
      ],
    };
    const fields = deriveSeedArticleFields('XSS', xssDoc);
    expect(fields.bodyHtml).not.toContain('<script>');
    expect(fields.bodyHtml).toContain('&lt;script&gt;');
    expect(fields.bodyHtml).toContain('&amp;');
  });

  it('counts words across all text nodes, ignoring markup', () => {
    const fields = deriveSeedArticleFields('A Title', doc);
    // "Intro" + "Hello" + "world." + "A" + "quoted" + "line." = 6 words
    expect(fields.wordCount).toBe(6);
  });

  it('derives a slug from the title, not the body', () => {
    const fields = deriveSeedArticleFields('The Lamp at Merrow Point', doc);
    expect(fields.slug).toBe('the-lamp-at-merrow-point');
  });

  it('computes read time as words / 225 rounded up, minimum 1', () => {
    const short = deriveSeedArticleFields('Short', doc);
    expect(short.readTimeMinutes).toBe(1);

    const words = Array.from({ length: 500 }, () => ({ type: 'text' as const, text: 'word ' }));
    const longDoc: ProseMirrorDoc = { type: 'doc', content: [{ type: 'paragraph', content: words }] };
    const long = deriveSeedArticleFields('Long', longDoc);
    expect(long.wordCount).toBe(500);
    expect(long.readTimeMinutes).toBe(Math.ceil(500 / 225));
  });

  it('truncates a long excerpt at a word boundary with an ellipsis', () => {
    const words = Array.from({ length: 60 }, (_, i) => ({ type: 'text' as const, text: `word${i} ` }));
    const longDoc: ProseMirrorDoc = { type: 'doc', content: [{ type: 'paragraph', content: words }] };
    const fields = deriveSeedArticleFields('Long', longDoc);
    expect(fields.excerpt.length).toBeLessThanOrEqual(161);
    expect(fields.excerpt.endsWith('…')).toBe(true);
    expect(fields.excerpt.endsWith(' …')).toBe(false);
  });

  it('leaves a short excerpt untouched (no ellipsis)', () => {
    const fields = deriveSeedArticleFields('A Title', doc);
    expect(fields.excerpt).not.toContain('…');
  });

  it('is a pure function: same input always produces byte-identical output', () => {
    const a = deriveSeedArticleFields('Determinism Check', doc);
    const b = deriveSeedArticleFields('Determinism Check', doc);
    expect(a).toEqual(b);
  });
});

describe('appendProvenanceFooter', () => {
  const doc: ProseMirrorDoc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body text.' }] }],
  };
  const source = {
    work: 'The Lighthouse Keeper’s Journal',
    author: 'Thomas Hollis Ward',
    url: 'https://archive.example.org/works/lighthouse',
    license: 'public-domain' as const,
  };

  it('does not mutate the original doc', () => {
    const before = JSON.stringify(doc);
    appendProvenanceFooter(doc, source);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('appends a horizontalRule then a paragraph carrying work/author/url/license', () => {
    const withFooter = appendProvenanceFooter(doc, source);
    expect(withFooter.content.length).toBe(doc.content.length + 2);
    const rule = withFooter.content[withFooter.content.length - 2]!;
    const footer = withFooter.content[withFooter.content.length - 1]!;
    expect(rule.type).toBe('horizontalRule');
    expect(footer.type).toBe('paragraph');
    const footerText = footer.content?.[0]?.text ?? '';
    expect(footerText).toContain(source.work);
    expect(footerText).toContain(source.author);
    expect(footerText).toContain(source.url);
    expect(footerText).toContain('public-domain');
  });

  it('the rendered body_html for every provenance-footed doc contains the source text (rendered "in the footer")', () => {
    const withFooter = appendProvenanceFooter(doc, source);
    const fields = deriveSeedArticleFields('A Title', withFooter);
    expect(fields.bodyHtml).toContain(source.work);
    expect(fields.bodyHtml).toContain(source.author);
    expect(fields.bodyHtml.endsWith('</p>')).toBe(true);
    expect(fields.bodyHtml.indexOf(source.work)).toBeGreaterThan(fields.bodyHtml.indexOf('Body text.'));
  });
});
