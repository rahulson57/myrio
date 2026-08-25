import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentForm } from '../../src/components/social/CommentForm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
  return container;
}

function setValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submit(form: HTMLFormElement) {
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('CommentForm (SPEC-007)', () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it('disables submit for an empty body and shows the char count', () => {
    const el = render(<CommentForm articleId="a1" isSignedIn />);
    const submitBtn = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(el.textContent).toContain('0/2000');
  });

  it('disables submit and flags aria-invalid past 2000 chars', () => {
    const el = render(<CommentForm articleId="a1" isSignedIn />);
    const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
    setValue(textarea, 'a'.repeat(2001));

    const submitBtn = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
  });

  it('POSTs the body and parentId, clears the field, and calls onSubmitted on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'c1',
        authorHandle: 'me',
        authorDisplayName: 'Me',
        bodyText: 'hello',
        createdAt: Date.now(),
        deletedAt: null,
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const onSubmitted = vi.fn();

    const el = render(
      <CommentForm articleId="a1" parentId="top1" isSignedIn onSubmitted={onSubmitted} />,
    );
    const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
    setValue(textarea, 'hello');

    await act(async () => {
      submit(el.querySelector('form')!);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/articles/a1/comments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ bodyText: 'hello', parentId: 'top1' }),
      }),
    );
    expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(textarea.value).toBe('');
  });

  it('shows an error and does not clear the field on a failed submit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Nope' }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const el = render(<CommentForm articleId="a1" isSignedIn />);
    const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
    setValue(textarea, 'hello');

    await act(async () => {
      submit(el.querySelector('form')!);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(el.textContent).toContain('Nope');
    expect(textarea.value).toBe('hello');
  });

  it('shows a sign-in prompt instead of posting when signed out', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const el = render(<CommentForm articleId="a1" isSignedIn={false} />);
    const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
    setValue(textarea, 'hello');
    submit(el.querySelector('form')!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Sign in to comment');
  });
});
