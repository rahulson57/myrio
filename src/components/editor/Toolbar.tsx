'use client';

import type { Editor as TiptapEditor } from '@tiptap/react';
import { ImageUploadButton } from './ImageUploadButton';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
  editor: TiptapEditor | null;
}

interface ToolbarAction {
  label: string;
  isActive: (editor: TiptapEditor) => boolean;
  run: (editor: TiptapEditor) => void;
}

const ACTIONS: ToolbarAction[] = [
  {
    label: 'Bold',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Italic',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Code',
    isActive: (e) => e.isActive('code'),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    label: 'H2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'H3',
    isActive: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Quote',
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: 'Bullet list',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Numbered list',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'Code block',
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: 'Divider',
    isActive: () => false,
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
];

/**
 * The editor's formatting toolbar (SPEC-005/SPEC-009). Every control is a
 * real `<button>` with `aria-pressed` reflecting live editor state — never
 * a click handler on a `<div>` (SPEC-009 accessibility floor). Image
 * insertion (`ImageUploadButton`) lives here rather than as a Tiptap
 * command because it has to round-trip through `POST /api/uploads`
 * first — see that component for the upload/insert boundary.
 */
export function Toolbar({ editor }: ToolbarProps) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={styles.button}
          aria-pressed={editor ? action.isActive(editor) : false}
          disabled={!editor}
          onClick={() => editor && action.run(editor)}
        >
          {action.label}
        </button>
      ))}
      <ImageUploadButton editor={editor} />
    </div>
  );
}
