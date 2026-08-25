import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClapButton } from '../../src/components/social/ClapButton';

// Same harness pattern as tests/a11y/shell-components.test.tsx: no
// @testing-library/react (package.json is out of scope for this task too),
// react-dom/client's createRoot + React's own `act` are enough.
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

describe('ClapButton (SPEC-007 / SPEC-009)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a real <button> with an accessible name carrying the counts', () => {
    const el = render(
      <ClapButton articleId="a1" initialTotal={10} initialMyCount={0} isSignedIn />,
    );
    const button = el.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toContain('10 total claps');
  });

  it('bumps the displayed total optimistically on click, before any request resolves', () => {
    const fetchMock = vi.fn(
      () => new Promise<Response>(() => {}), // never resolves within this test
    );
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <ClapButton articleId="a1" initialTotal={10} initialMyCount={0} isSignedIn />,
    );
    const button = el.querySelector('button')!;

    click(button);

    expect(el.textContent).toContain('11');
    expect(fetchMock).not.toHaveBeenCalled(); // not flushed yet — still idle-debouncing
  });

  it('batches rapid clicks into exactly one request after 500ms idle', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ myCount: 3, total: 13 }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <ClapButton articleId="a1" initialTotal={10} initialMyCount={0} isSignedIn />,
    );
    const button = el.querySelector('button')!;

    click(button);
    click(button);
    click(button);

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/articles/a1/claps');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ delta: 3 });

    // Reconciled against the response body.
    expect(el.textContent).toContain('13');
  });

  it('reverts the optimistic bump and shows a sign-in message on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <ClapButton articleId="a1" initialTotal={10} initialMyCount={0} isSignedIn />,
    );
    const button = el.querySelector('button')!;
    click(button);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(el.textContent).toContain('10'); // reverted
    expect(el.textContent).toContain('Sign in to clap');
  });

  it('short-circuits with no fetch when isSignedIn is false', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <ClapButton articleId="a1" initialTotal={10} initialMyCount={0} isSignedIn={false} />,
    );
    click(el.querySelector('button')!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Sign in to clap');
  });

  it('does not let a click push myCount past 50 optimistically', () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    const el = render(
      <ClapButton articleId="a1" initialTotal={100} initialMyCount={50} isSignedIn />,
    );
    click(el.querySelector('button')!);

    expect(el.textContent).toContain('100'); // total unchanged — already at the per-user cap
  });
});
