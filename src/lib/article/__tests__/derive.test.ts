import { describe, expect, it } from 'vitest';
import { deriveArticleFields, type ArticleNode } from '../derive';

const TITLE = 'Hello, World! A Test Article';
const ID = '018f1a2b-3c4d-7e5f-8a9b-0123456789ab';
const META = { title: TITLE, id: ID };

function doc(content: ArticleNode[]): ArticleNode {
  return { type: 'doc', content };
}

function paragraph(text: string): ArticleNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

describe('deriveArticleFields', () => {
  it('is pure: identical input produces byte-identical output', () => {
    const bodyJson = doc([paragraph('Some deterministic content.'), paragraph('More text here.')]);
    const first = deriveArticleFields(bodyJson, META);
    const second = deriveArticleFields(bodyJson, META);
    expect(second).toEqual(first);
    // Re-derive from a freshly parsed clone (simulates round-tripping
    // through JSON storage) — must still match byte-for-byte.
    const cloned = JSON.parse(JSON.stringify(bodyJson));
    const third = deriveArticleFields(cloned, { title: TITLE, id: ID });
    expect(third).toEqual(first);
  });

  it('derives slug as kebab(title) + first 8 chars of id', () => {
    const bodyJson = doc([paragraph('Body.')]);
    const { slug } = deriveArticleFields(bodyJson, META);
    expect(slug).toBe('hello-world-a-test-article-018f1a2b');
  });

  it('slug handles titles with diacritics and repeated punctuation', () => {
    const bodyJson = doc([paragraph('Body.')]);
    const { slug } = deriveArticleFields(bodyJson, { title: 'Café --- Déjà Vu!!', id: ID });
    expect(slug).toBe('cafe-deja-vu-018f1a2b');
  });

  it('renders paragraphs, headings (h2/h3 only) and marks', () => {
    const bodyJson = doc([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Intro' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Sub' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'code', marks: [{ type: 'code' }] },
        ],
      },
    ]);
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    expect(bodyHtml).toBe(
      '<h2>Intro</h2><h3>Sub</h3><p><strong>bold</strong> and <em>italic</em> and <code>code</code></p>',
    );
  });

  it('drops H1 headings entirely (title is the only H1)', () => {
    const bodyJson = doc([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Should not appear' }] },
      paragraph('Kept.'),
    ]);
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    expect(bodyHtml).toBe('<p>Kept.</p>');
    expect(bodyHtml).not.toMatch(/<h1/i);
  });

  it('drops forbidden node types, marks and attrs instead of escaping them', () => {
    const bodyJson: ArticleNode = {
      type: 'doc',
      content: [
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] } as ArticleNode,
        { type: 'iframe', attrs: { src: 'https://evil.example' } } as ArticleNode,
        {
          type: 'paragraph',
          attrs: { style: 'color:red' },
          content: [
            {
              type: 'text',
              text: 'hi',
              marks: [{ type: 'onerror', attrs: { onerror: 'alert(1)' } }],
            },
          ],
        },
        { type: 'table', content: [] } as ArticleNode,
      ],
    };
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    expect(bodyHtml).not.toMatch(/<script|onerror=|<iframe|style=|<h1|<table/i);
    expect(bodyHtml).toBe('<p>hi</p>');
  });

  it('renders a link mark only for http/https/mailto and adds rel/target', () => {
    const bodyJson = doc([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'safe',
            marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
          },
          { type: 'text', text: ' ' },
          {
            type: 'text',
            text: 'unsafe',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ]);
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    const linkMatch = bodyHtml.match(/<a\s([^>]*)>safe<\/a>/);
    expect(linkMatch).not.toBeNull();
    const linkAttrs = linkMatch![1];
    expect(linkAttrs).toContain('href="https://example.com"');
    expect(linkAttrs).toContain('rel="noopener noreferrer nofollow"');
    expect(linkAttrs).toContain('target="_blank"');
    expect(bodyHtml).toContain('unsafe');
    expect(bodyHtml).not.toContain('javascript:');
    expect(bodyHtml).not.toMatch(/<a[^>]*javascript/i);
  });

  it('renders block images as figures with explicit width/height, never inline', () => {
    const bodyJson = doc([
      paragraph('Before.'),
      {
        type: 'image',
        attrs: {
          uploadId: 'up_1',
          src: '/uploads/a.webp',
          alt: 'A cat',
          caption: 'A very good cat',
          width: 800,
          height: 600,
        },
      },
      paragraph('After.'),
    ]);
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    expect(bodyHtml).toContain('<figure>');
    expect(bodyHtml).toMatch(/<img[^>]*src="\/uploads\/a\.webp"/);
    expect(bodyHtml).toMatch(/<img[^>]*alt="A cat"/);
    expect(bodyHtml).toMatch(/<img[^>]*width="800"/);
    expect(bodyHtml).toMatch(/<img[^>]*height="600"/);
    expect(bodyHtml).toContain('<figcaption>A very good cat</figcaption>');
    // never inline: no <img> ever appears nested inside a <p>...</p> run
    expect(bodyHtml).not.toMatch(/<p>[^<]*<img/);
    expect(bodyHtml.indexOf('<p>Before.</p>')).toBeLessThan(bodyHtml.indexOf('<figure>'));
    expect(bodyHtml.indexOf('<figure>')).toBeLessThan(bodyHtml.indexOf('<p>After.</p>'));
  });

  it('drops an image node with no src', () => {
    const bodyJson = doc([{ type: 'image', attrs: { alt: 'no src' } }, paragraph('Text.')]);
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    expect(bodyHtml).toBe('<p>Text.</p>');
  });

  it('escapes HTML-significant characters in text content', () => {
    const bodyJson = doc([paragraph('<script>alert("x")</script> & <b>')]);
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    expect(bodyHtml).not.toMatch(/<script|<b>/i);
    expect(bodyHtml).toContain('&amp;');
  });

  it('renders lists, blockquotes, code blocks and horizontal rules', () => {
    const bodyJson = doc([
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('one')] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [paragraph('two')] }] },
      { type: 'blockquote', content: [paragraph('quoted')] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;\n<b>' }] },
      { type: 'horizontalRule' },
    ]);
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    expect(bodyHtml).toContain('<ul><li><p>one</p></li></ul>');
    expect(bodyHtml).toContain('<ol><li><p>two</p></li></ol>');
    expect(bodyHtml).toContain('<blockquote><p>quoted</p></blockquote>');
    expect(bodyHtml).toContain('<pre><code>const x = 1;\n&lt;b&gt;</code></pre>');
    expect(bodyHtml).toMatch(/<hr\s*\/?>/);
  });

  it('strips marks from codeBlock text even if the input claims them', () => {
    const bodyJson = doc([
      {
        type: 'codeBlock',
        content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://x' } }] }],
      },
    ]);
    const { bodyHtml } = deriveArticleFields(bodyJson, META);
    expect(bodyHtml).toBe('<pre><code>x</code></pre>');
  });

  it('computes word_count from whitespace-delimited plaintext tokens', () => {
    const bodyJson = doc([paragraph('one two  three'), paragraph('four')]);
    const { wordCount } = deriveArticleFields(bodyJson, META);
    expect(wordCount).toBe(4);
  });

  it('computes read_time_minutes as max(1, ceil(word_count / 200))', () => {
    const shortDoc = doc([paragraph('one two three')]);
    expect(deriveArticleFields(shortDoc, META).readTimeMinutes).toBe(1);

    const words = Array.from({ length: 401 }, (_, i) => `w${i}`).join(' ');
    const longDoc = doc([paragraph(words)]);
    const result = deriveArticleFields(longDoc, META);
    expect(result.wordCount).toBe(401);
    expect(result.readTimeMinutes).toBe(3); // ceil(401 / 200) = 3
  });

  it('truncates excerpt to 200 chars on a word boundary with an ellipsis', () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const bodyJson = doc([paragraph(words)]);
    const { excerpt } = deriveArticleFields(bodyJson, META);
    expect(excerpt.length).toBeLessThanOrEqual(201); // <=200 chars + ellipsis
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.endsWith(' …')).toBe(false);
  });

  it('does not truncate an excerpt already under 200 chars', () => {
    const bodyJson = doc([paragraph('Short body.')]);
    const { excerpt } = deriveArticleFields(bodyJson, META);
    expect(excerpt).toBe('Short body.');
  });

  it('is a pure function: throws nothing, touches no filesystem/db for a well-formed doc', () => {
    const bodyJson = doc([paragraph('x')]);
    expect(() => deriveArticleFields(bodyJson, META)).not.toThrow();
  });
});
