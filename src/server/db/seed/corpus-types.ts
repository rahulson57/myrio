/**
 * The Tiptap/ProseMirror node & mark shapes allowed by SPEC-005's "Document
 * schema (the closed world)" — Seed Data only ever emits a subset of this
 * (no `image` nodes; uploads are separate solid-colour PNGs, see `png.ts`),
 * but corpus JSON is typed against the full allowlist so it stays valid if
 * a later corpus revision uses more of it.
 */
export interface ProseMirrorMark {
  type: 'bold' | 'italic' | 'code' | 'link';
  attrs?: Record<string, unknown>;
}

export interface ProseMirrorNode {
  type:
    | 'doc'
    | 'paragraph'
    | 'heading'
    | 'blockquote'
    | 'codeBlock'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'image'
    | 'horizontalRule'
    | 'hardBreak'
    | 'text';
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: ProseMirrorMark[];
}

export interface ProseMirrorDoc {
  type: 'doc';
  content: ProseMirrorNode[];
}

/**
 * SPEC-003 "Corpus source". One JSON file under `corpus/*.json` per article.
 * `bodyJson` must validate against the SPEC-005 allowlist above.
 */
export interface CorpusFile {
  title: string;
  subtitle: string | null;
  /** 1-5 human-readable tag names (slugified by the tags repository on write). */
  tags: string[];
  bodyJson: ProseMirrorDoc;
  source: {
    work: string;
    author: string;
    url: string;
    license: 'public-domain';
  };
}
