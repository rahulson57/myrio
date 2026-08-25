'use client';

import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';
import { articleExtensions } from '../../lib/article/schema';
import '../../styles/article-content.css';

export interface EditorProps {
  content: unknown;
  onUpdate: (json: unknown) => void;
  onEditorReady?: (editor: TiptapEditor) => void;
  editable?: boolean;
}

/**
 * The Tiptap React editor (SPEC-005). Uses `articleExtensions` — the exact
 * same allowlisted node/mark set `src/lib/article/schema.ts` validates
 * against server-side — plus `Placeholder`, which is editor-only UX and
 * never produces document content. Renders into `.article-content`
 * (`src/styles/article-content.css`, imported here by path so this is the
 * ONE place that stylesheet enters the write path; the reading page
 * imports the identical specifier on its own side).
 *
 * Because `image` is registered `group: 'block', inline: false` in the
 * shared schema, ProseMirror's own insertion logic is what makes "insert
 * an image with the cursor mid-paragraph" split the paragraph into two
 * siblings around the image — this component adds no special-case split
 * logic of its own; it only has to not fight the schema.
 */
export function Editor({ content, onUpdate, onEditorReady, editable = true }: EditorProps) {
  const editor = useEditor({
    extensions: [
      ...articleExtensions,
      Placeholder.configure({ placeholder: 'Tell your story…' }),
    ],
    content: content as never,
    editable,
    editorProps: {
      attributes: {
        class: 'article-content',
        'aria-label': 'Article body',
      },
    },
    onUpdate: ({ editor: updated }) => onUpdate(updated.getJSON()),
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  return <EditorContent editor={editor} />;
}
