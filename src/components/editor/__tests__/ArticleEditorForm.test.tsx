import '@testing-library/jest-dom/vitest';
import './setupJsdomPolyfills';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArticleEditorForm, type ArticleDraftData, type FormSaveOutcome } from '../ArticleEditorForm';

function baseDraft(overrides: Partial<ArticleDraftData> = {}): ArticleDraftData {
  return {
    id: 'a1',
    title: 'My Title',
    subtitle: null,
    bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
    tags: [],
    coverUploadId: null,
    updatedAt: 1000,
    status: 'draft',
    ...overrides,
  };
}

describe('ArticleEditorForm', () => {
  it('renders title/subtitle/tags and the editor', async () => {
    const onSave = vi.fn<() => Promise<FormSaveOutcome>>().mockResolvedValue({ ok: true, updatedAt: 2000 });
    const onPublish = vi.fn().mockResolvedValue({ ok: true });
    render(<ArticleEditorForm initial={baseDraft({ tags: ['tech'] })} onSave={onSave} onPublish={onPublish} />);

    expect(screen.getByLabelText('Title')).toHaveValue('My Title');
    expect(screen.getByText('tech')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.article-content')).not.toBeNull());
  });

  it('adds and removes tags, capped at 5', () => {
    const onSave = vi.fn<() => Promise<FormSaveOutcome>>().mockResolvedValue({ ok: true, updatedAt: 2000 });
    const onPublish = vi.fn().mockResolvedValue({ ok: true });
    render(<ArticleEditorForm initial={baseDraft()} onSave={onSave} onPublish={onPublish} />);

    const input = screen.getByLabelText('Add a tag');
    for (const tag of ['a', 'b', 'c', 'd', 'e']) {
      fireEvent.change(input, { target: { value: tag } });
      fireEvent.keyDown(input, { key: 'Enter' });
    }
    expect(screen.getAllByLabelText(/Remove tag/)).toHaveLength(5);
    // At 5 tags the "add a tag" input is no longer rendered.
    expect(screen.queryByLabelText('Add a tag')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove tag a'));
    expect(screen.getByLabelText('Add a tag')).toBeInTheDocument();
  });

  it('threads the new updated_at from a successful save into the next baseVersion', async () => {
    const onSave = vi.fn<() => Promise<FormSaveOutcome>>().mockResolvedValue({ ok: true, updatedAt: 2000 });
    const onPublish = vi.fn().mockResolvedValue({ ok: true });
    render(<ArticleEditorForm initial={baseDraft({ updatedAt: 1000 })} onSave={onSave} onPublish={onPublish} />);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } });
    // handlePublish() calls autosave.flush() which saves immediately.
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ baseVersion: 1000 })));
    await waitFor(() => expect(onPublish).toHaveBeenCalled());
  });

  it('shows field-keyed publish errors', async () => {
    const onSave = vi.fn<() => Promise<FormSaveOutcome>>().mockResolvedValue({ ok: true, updatedAt: 2000 });
    const onPublish = vi.fn().mockResolvedValue({ ok: false, errors: { tags: 'Choose between 1 and 5 tags.' } });
    render(<ArticleEditorForm initial={baseDraft()} onSave={onSave} onPublish={onPublish} />);

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByText('Choose between 1 and 5 tags.')).toBeInTheDocument());
  });

  it('shows a reload banner on conflict and disables publish', async () => {
    const onSave = vi.fn<() => Promise<FormSaveOutcome>>().mockResolvedValue({ ok: false, conflict: true });
    const onPublish = vi.fn().mockResolvedValue({ ok: false, errors: {} });
    const onReload = vi.fn();
    render(
      <ArticleEditorForm initial={baseDraft()} onSave={onSave} onPublish={onPublish} onReload={onReload} />,
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' })); // flush()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Opened elsewhere'));
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalled();
  });

  it('shows "Update" instead of "Publish" for an already-published article', () => {
    const onSave = vi.fn<() => Promise<FormSaveOutcome>>().mockResolvedValue({ ok: true, updatedAt: 2000 });
    const onPublish = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ArticleEditorForm initial={baseDraft({ status: 'published' })} onSave={onSave} onPublish={onPublish} />,
    );
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });
});
