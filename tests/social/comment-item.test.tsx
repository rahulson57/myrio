import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentItem, type CommentItemData } from '../../src/components/social/CommentItem';

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

function baseComment(overrides: Partial<CommentItemData> = {}): CommentItemData {
  return {
    id: 'c1',
    authorHandle: 'ada',
    authorDisplayName: 'Ada Lovelace',
    bodyText: 'Great article!',
    createdAt: Date.parse('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('CommentItem (SPEC-007 XSS boundary + soft-delete rendering)', () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it('renders a <script>-containing body as literal text, never as a script element', () => {
    const el = render(
      <ul>
        <CommentItem comment={baseComment({ bodyText: '<script>alert(1)</script>' })} canDelete={false} />
      </ul>,
    );

    expect(el.querySelectorAll('script')).toHaveLength(0);
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });

  it('renders the deleted placeholder and hides the delete control for a soft-deleted comment', () => {
    const el = render(
      <ul>
        <CommentItem
          comment={baseComment({ bodyText: '', deletedAt: Date.now() })}
          canDelete
        />
      </ul>,
    );

    expect(el.textContent).toContain('This comment was deleted');
    expect(el.querySelector('button')).toBeNull();
  });

  it('shows a delete button only when canDelete is true', () => {
    const withPermission = render(
      <ul>
        <CommentItem comment={baseComment()} canDelete />
      </ul>,
    );
    expect(withPermission.querySelector('button')).not.toBeNull();

    act(() => {
      root?.unmount();
    });
    container?.remove();

    const withoutPermission = render(
      <ul>
        <CommentItem comment={baseComment()} canDelete={false} />
      </ul>,
    );
    expect(withoutPermission.querySelector('button')).toBeNull();
  });

  it('calls onDeleted after a successful DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const onDeleted = vi.fn();

    const el = render(
      <ul>
        <CommentItem comment={baseComment()} canDelete onDeleted={onDeleted} />
      </ul>,
    );

    await act(async () => {
      el.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/comments/c1', { method: 'DELETE' });
    expect(onDeleted).toHaveBeenCalledWith('c1');
  });

  it('shows an error and does not call onDeleted when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const onDeleted = vi.fn();

    const el = render(
      <ul>
        <CommentItem comment={baseComment()} canDelete onDeleted={onDeleted} />
      </ul>,
    );

    await act(async () => {
      el.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onDeleted).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Couldn’t delete");
  });
});
