import '@testing-library/jest-dom/vitest';
import './setupJsdomPolyfills';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Editor } from '../Editor';
import { ImageUploadButton } from '../ImageUploadButton';

function doc(content: unknown[]) {
  return { type: 'doc', content };
}

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

async function mountWithEditor() {
  let editorRef: TiptapEditor | null = null;
  render(
    <EditorHarness
      onReady={(e) => {
        editorRef = e;
      }}
    />,
  );
  await waitFor(() => expect(editorRef).not.toBeNull());
  return () => editorRef as unknown as TiptapEditor;
}

function EditorHarness({ onReady }: { onReady: (editor: TiptapEditor) => void }) {
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  return (
    <>
      <Editor
        content={doc([paragraph('Body.')])}
        onUpdate={() => {}}
        onEditorReady={(e) => {
          setEditor(e);
          onReady(e);
        }}
      />
      <ImageUploadButton editor={editor} />
    </>
  );
}

const file = new File(['x'], 'a.png', { type: 'image/png' });

describe('ImageUploadButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('inserts a block image node on a 201 response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 201,
      json: async () => ({ uploadId: 'up_1', src: '/uploads/a.webp', width: 10, height: 10 }),
    });

    const getEditor = await mountWithEditor();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const json = getEditor().getJSON() as { content: Array<{ type: string; attrs?: Record<string, unknown> }> };
      expect(json.content.some((n) => n.type === 'image' && n.attrs?.uploadId === 'up_1')).toBe(true);
    });
  });

  it('inserts nothing and shows a failure toast on a non-201 response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 413,
      json: async () => ({ error: 'File too large.' }),
    });

    const getEditor = await mountWithEditor();
    const before = JSON.stringify(getEditor().getJSON());

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('File too large.'));

    const after = JSON.stringify(getEditor().getJSON());
    expect(after).toBe(before);
    // No placeholder / broken-src image node anywhere.
    expect(after).not.toMatch(/"type":"image"/);
  });

  it('surfaces a network failure the same way as a non-201 response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    const getEditor = await mountWithEditor();
    const before = JSON.stringify(getEditor().getJSON());

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(JSON.stringify(getEditor().getJSON())).toBe(before);
  });
});
