import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FollowButton } from '../../src/components/social/FollowButton';

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

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

describe('FollowButton (SPEC-007)', () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it('renders nothing when viewing your own profile (self-follow is rejected server-side)', () => {
    const el = render(
      <FollowButton handle="me" initialFollowing={false} isSignedIn isSelf />,
    );
    expect(el.querySelector('button')).toBeNull();
  });

  it('toggles to Following optimistically and POSTs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ following: true, followerCount: 1 }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <FollowButton handle="ada" initialFollowing={false} isSignedIn isSelf={false} />,
    );
    const button = el.querySelector('button')!;
    expect(button.textContent).toBe('Follow');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/users/ada/follow', { method: 'POST' });
    expect(el.querySelector('button')?.textContent).toBe('Following');
  });

  it('toggles back to Follow and DELETEs when already following', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ following: false, followerCount: 0 }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <FollowButton handle="ada" initialFollowing isSignedIn isSelf={false} />,
    );
    const button = el.querySelector('button')!;
    expect(button.textContent).toBe('Following');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/users/ada/follow', { method: 'DELETE' });
  });

  it('reverts and shows an error on a failed request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <FollowButton handle="ada" initialFollowing={false} isSignedIn isSelf={false} />,
    );

    await act(async () => {
      el.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(el.querySelector('button')?.textContent).toBe('Follow');
    expect(el.textContent).toContain("Couldn't update");
  });

  it('shows a sign-in prompt instead of calling the API when signed out', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <FollowButton handle="ada" initialFollowing={false} isSignedIn={false} isSelf={false} />,
    );
    click(el.querySelector('button')!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Sign in to follow');
  });
});
