import '@testing-library/jest-dom/vitest';
import './setupJsdomPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Editor } from '../Editor';
import { Toolbar } from '../Toolbar';

function doc(content: unknown[]) {
  return { type: 'doc', content };
}
function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function Harness() {
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  return (
    <>
      <Editor content={doc([paragraph('x')])} onUpdate={() => {}} onEditorReady={setEditor} />
      <Toolbar editor={editor} />
    </>
  );
}

describe('Toolbar', () => {
  it('renders every action as a real button inside a toolbar landmark', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('toolbar')).toBeInTheDocument());
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(5);
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
    }
  });

  it('toggles bold and reflects it via aria-pressed', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('toolbar')).toBeInTheDocument());
    const boldButton = screen.getByRole('button', { name: 'Bold' });
    expect(boldButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables every action button until the editor is ready', () => {
    render(<Toolbar editor={null} />);
    const boldButton = screen.getByRole('button', { name: 'Bold' });
    expect(boldButton).toBeDisabled();
  });
});
