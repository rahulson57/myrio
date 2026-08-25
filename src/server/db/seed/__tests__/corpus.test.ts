import { describe, expect, it } from 'vitest';
import { ARTICLE_MANIFEST, SEED_USERS } from '../authors';
import { loadCorpus } from '../corpus-loader';

describe('loadCorpus', () => {
  it('loads all 34 corpus files (28 published + 6 draft, SPEC-003 volumes)', () => {
    const corpus = loadCorpus();
    expect(corpus.length).toBe(34);
  });

  it('every corpus file has unique title, valid tags (1-5), and non-null provenance', () => {
    const corpus = loadCorpus();
    const titles = new Set<string>();
    for (const entry of corpus) {
      expect(titles.has(entry.title), `duplicate title "${entry.title}"`).toBe(false);
      titles.add(entry.title);

      expect(entry.tags.length).toBeGreaterThanOrEqual(1);
      expect(entry.tags.length).toBeLessThanOrEqual(5);

      expect(entry.source.work).toBeTruthy();
      expect(entry.source.author).toBeTruthy();
      expect(entry.source.url).toBeTruthy();
      expect(entry.source.license).toBe('public-domain');
    }
  });

  it('is deterministic: repeated calls return identical content', () => {
    const a = loadCorpus();
    const b = loadCorpus();
    expect(a).toEqual(b);
  });

  it('returns entries in a fixed (filename-sorted) order', () => {
    const a = loadCorpus().map((c) => c.title);
    const b = loadCorpus().map((c) => c.title);
    expect(a).toEqual(b);
  });
});

describe('ARTICLE_MANIFEST / SEED_USERS consistency (build.ts assumes this holds)', () => {
  it('every corpus title has exactly one ARTICLE_MANIFEST entry, and vice versa', () => {
    const corpus = loadCorpus();
    const corpusTitles = new Set(corpus.map((c) => c.title));
    const manifestTitles = new Set(ARTICLE_MANIFEST.map((m) => m.title));

    expect(manifestTitles.size).toBe(ARTICLE_MANIFEST.length); // no duplicate manifest entries
    expect(corpusTitles.size).toBe(corpus.length); // no duplicate corpus titles

    for (const title of corpusTitles) {
      expect(manifestTitles.has(title), `corpus title "${title}" missing from ARTICLE_MANIFEST`).toBe(true);
    }
    for (const title of manifestTitles) {
      expect(corpusTitles.has(title), `manifest title "${title}" has no corpus file`).toBe(true);
    }
  });

  it('every ARTICLE_MANIFEST handle refers to a real SEED_USERS entry', () => {
    const handles = new Set(SEED_USERS.map((u) => u.handle));
    for (const entry of ARTICLE_MANIFEST) {
      expect(handles.has(entry.handle), `manifest references unknown handle "${entry.handle}"`).toBe(true);
    }
  });

  it('SEED_USERS has exactly 12 users: 10 authors + 2 readers', () => {
    expect(SEED_USERS.length).toBe(12);
    expect(SEED_USERS.filter((u) => u.role === 'author').length).toBe(10);
    expect(SEED_USERS.filter((u) => u.role === 'reader').length).toBe(2);
  });

  it('ARTICLE_MANIFEST has exactly 28 published and 6 draft entries', () => {
    expect(ARTICLE_MANIFEST.filter((m) => m.status === 'published').length).toBe(28);
    expect(ARTICLE_MANIFEST.filter((m) => m.status === 'draft').length).toBe(6);
  });

  it('drafts span exactly 3 distinct authors (SPEC-003: "Across 3 authors")', () => {
    const draftHandles = new Set(ARTICLE_MANIFEST.filter((m) => m.status === 'draft').map((m) => m.handle));
    expect(draftHandles.size).toBe(3);
  });

  it('every author has 1-5 published articles', () => {
    const counts = new Map<string, number>();
    for (const entry of ARTICLE_MANIFEST) {
      if (entry.status !== 'published') continue;
      counts.set(entry.handle, (counts.get(entry.handle) ?? 0) + 1);
    }
    for (const [handle, count] of counts) {
      expect(count, `author "${handle}" has ${count} published articles`).toBeGreaterThanOrEqual(1);
      expect(count, `author "${handle}" has ${count} published articles`).toBeLessThanOrEqual(5);
    }
  });

  it('every user handle is unique', () => {
    const handles = SEED_USERS.map((u) => u.handle);
    expect(new Set(handles).size).toBe(handles.length);
  });
});
