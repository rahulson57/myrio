import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { CorpusFile } from './corpus-types';

const CORPUS_DIR = path.join(__dirname, 'corpus');

function isCorpusFile(value: unknown): value is CorpusFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === 'string' &&
    (typeof v.subtitle === 'string' || v.subtitle === null) &&
    Array.isArray(v.tags) &&
    v.tags.every((t) => typeof t === 'string') &&
    typeof v.bodyJson === 'object' &&
    v.bodyJson !== null &&
    typeof v.source === 'object' &&
    v.source !== null
  );
}

/**
 * Reads every `corpus/*.json` file (SPEC-003's `corpusFiles` port —
 * "genuinely external", read-only, zero network) in a fixed, deterministic
 * order (filename sort — filenames are zero-padded so this is also
 * numeric order), and validates each one's shape.
 */
export function loadCorpus(): CorpusFile[] {
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const seenTitles = new Set<string>();
  const corpus: CorpusFile[] = [];

  for (const file of files) {
    const raw = readFileSync(path.join(CORPUS_DIR, file), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isCorpusFile(parsed)) {
      throw new Error(`Invalid corpus file (does not match CorpusFile shape): ${file}`);
    }
    if (seenTitles.has(parsed.title)) {
      throw new Error(`Duplicate corpus title "${parsed.title}" in ${file}`);
    }
    seenTitles.add(parsed.title);
    corpus.push(parsed);
  }

  return corpus;
}
