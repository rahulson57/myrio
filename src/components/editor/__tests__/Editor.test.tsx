import '@testing-library/jest-dom/vitest';
import './setupJsdomPolyfills';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Editor } from '../Editor';
import { articleSchema } from '../../../lib/article/schema';

function doc(content: unknown[]) {
  return { type: 'doc', content };
}

function paragraph(text: string) {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

async function mount(content: unknown) {
  let editorRef: TiptapEditor | null = null;
  const onUpdate = vi.fn();
  render(
    <Editor
      content={content}
      onUpdate={onUpdate}
      onEditorReady={(editor) => {
        editorRef = editor;
      }}
    />,
  );
  await waitFor(() => expect(editorRef).not.toBeNull());
  return { getEditor: () => editorRef as unknown as TiptapEditor, onUpdate };
}

describe('Editor', () => {
  it('mounts and renders into .article-content', async () => {
    const { getEditor } = await mount(doc([paragraph('Hello.')]));
    const editor = getEditor();
    expect(editor.getHTML()).toContain('Hello.');
    expect(document.querySelector('.article-content')).not.toBeNull();
  });

  it('splits the paragraph when an image is inserted mid-paragraph, never nesting it inside', async () => {
    const { getEditor } = await mount(doc([paragraph('before after')]));
    const editor = getEditor();

    // Place the cursor between "before " and "after" (mid-paragraph).
    const midPosition = 1 + 'before '.length; // 1 for entering the paragraph node
    editor.commands.setTextSelection(midPosition);
    editor.commands.insertContent({
      type: 'image',
      attrs: { src: '/uploads/a.webp', alt: '', width: 10, height: 10, uploadId: 'up_1' },
    });

    interface JsonNode {
      type: string;
      content?: JsonNode[];
    }
    const json = editor.getJSON() as unknown as JsonNode & { content: JsonNode[] };
    expect(json.type).toBe('doc');

    // The image is a top-level sibling of `doc`, never a child of paragraph.
    const paragraphs = json.content.filter((n) => n.type === 'paragraph');
    for (const p of paragraphs) {
      expect((p.content ?? []).some((c) => c.type === 'image')).toBe(false);
    }
    expect(json.content.some((n) => n.type === 'image')).toBe(true);

    // What survives is a real ProseMirror document — schema-checked.
    expect(() => articleSchema.nodeFromJSON(json).check()).not.toThrow();
  });

  it('calls onUpdate with the current JSON on every change', async () => {
    const { getEditor, onUpdate } = await mount(doc([paragraph('x')]));
    const editor = getEditor();
    onUpdate.mockClear();
    editor.commands.insertContentAt(editor.state.doc.content.size, ' more');
    expect(onUpdate).toHaveBeenCalled();
  });

  it('imports the exact shared stylesheet path the reading page must also use', () => {
    // SPEC-005: "editor and reading page import the identical stylesheet
    // path src/styles/article-content.css — no forked copy." This
    // verifies the editor's half (the file this test can own) two ways:
    // the import specifier in source resolves to the canonical repo path,
    // and that file physically exists there. The reading page (Feed &
    // Read, a later slice, out of this task's scope) is responsible for
    // importing the same specifier on its side.
    const editorSource = readFileSync(path.join(__dirname, '../Editor.tsx'), 'utf8');
    expect(editorSource).toMatch(/import ['"]\.\.\/\.\.\/styles\/article-content\.css['"]/);

    const resolvedPath = path.resolve(__dirname, '../../../styles/article-content.css');
    expect(resolvedPath.endsWith('/src/styles/article-content.css')).toBe(true);
    expect(existsSync(resolvedPath)).toBe(true);
  });
});
