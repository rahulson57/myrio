import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvatarMenu } from '../../src/components/shell/AvatarMenu';
import { Footer } from '../../src/components/shell/Footer';
import { Header } from '../../src/components/shell/Header';
import { IconBadgeLink } from '../../src/components/shell/IconBadgeLink';
import { SearchSlot } from '../../src/components/shell/SearchSlot';
import { SkipLink } from '../../src/components/shell/SkipLink';
import { StatePage } from '../../src/components/shell/StatePage';
import type { SessionUser } from '../../src/components/shell/types';
import RootLayout from '../../src/app/layout';
import NotFound from '../../src/app/not-found';
import ErrorFallback from '../../src/app/error';

/**
 * Rendered-DOM component tests for the App Shell (SPEC-009).
 *
 * DEC-010 (the vitest/Playwright harness gap recorded against TASK-004) is
 * now fixed on this branch: vitest.config.ts's `component` project runs
 * `.test.tsx` files under `environment: 'jsdom'` with `esbuild.jsx:
 * 'automatic'`, so .tsx actually transforms and renders. These tests
 * therefore render real components into a real DOM and assert on the
 * result, superseding the previous readFileSync/regex-over-source-text
 * fallback (which could pass even for a component that rendered nothing).
 *
 * No @testing-library/react: package.json is outside this task's file
 * scope, and it isn't needed — react-dom/client's createRoot plus React's
 * own `act` (both already dependencies) are enough to mount components and
 * assert against the resulting DOM/focus state. `globalThis.
 * IS_REACT_ACT_ENVIRONMENT = true` below is the flag React's own docs
 * describe for wiring up `act` in a custom test harness that isn't RTL.
 */
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

function keydown(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe('SkipLink', () => {
  it('renders a real <a href="#main"> with the exact required copy', () => {
    const el = render(<SkipLink />);
    const link = el.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('#main');
    expect(link?.textContent).toBe('Skip to content');
  });
});

describe('layout.tsx (RootLayout)', () => {
  it('renders SkipLink before Header, and exactly one <main id="main"> that is programmatically focusable', () => {
    const el = render(
      <RootLayout>
        <div>page content</div>
      </RootLayout>,
    );

    const skipLink = el.querySelector('a[href="#main"]');
    const header = el.querySelector('header');
    const mains = el.querySelectorAll('main#main');

    expect(skipLink).not.toBeNull();
    expect(header).not.toBeNull();
    expect(mains.length).toBe(1);

    // DOM order: the skip link must precede the header.
    const position = skipLink!.compareDocumentPosition(header!);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    const main = mains[0] as HTMLElement;
    expect(main.tabIndex).toBe(-1);
  });

  it('renders the Footer', () => {
    const el = render(
      <RootLayout>
        <div>page content</div>
      </RootLayout>,
    );
    expect(el.querySelector('footer')).not.toBeNull();
  });
});

describe('Header', () => {
  it('renders a search input and only Sign in / Get started when signed out', () => {
    const el = render(<Header user={null} />);

    expect(el.querySelectorAll('input[type="search"]').length).toBe(1);
    const links = Array.from(el.querySelectorAll('a'));
    expect(links.some((a) => a.textContent === 'Sign in')).toBe(true);
    expect(links.some((a) => a.textContent === 'Get started')).toBe(true);

    expect(el.querySelector('[aria-label="Write"]')).toBeNull();
    expect(el.querySelector('[aria-haspopup="menu"]')).toBeNull();
    expect(links.some((a) => a.getAttribute('aria-label')?.startsWith('Notifications'))).toBe(false);
  });

  it('renders a search input and Write / bell / inbox / avatar-menu when signed in', () => {
    const user: SessionUser = {
      handle: 'ada',
      displayName: 'Ada Lovelace',
      avatarSrc: null,
      unreadNotifications: 3,
      unreadMessages: 0,
    };
    const el = render(<Header user={user} />);

    expect(el.querySelectorAll('input[type="search"]').length).toBe(1);
    expect(el.querySelector('[aria-label="Write"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Notifications, 3 unread"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Inbox"]')).not.toBeNull();
    expect(el.querySelector('[aria-haspopup="menu"]')).not.toBeNull();

    const links = Array.from(el.querySelectorAll('a'));
    expect(links.some((a) => a.textContent === 'Sign in')).toBe(false);
  });
});

describe('SearchSlot', () => {
  it('renders a real accessible <input type="search"> for the desktop field on mount', () => {
    const el = render(<SearchSlot />);
    const input = el.querySelector('#shell-search-desktop');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('type')).toBe('search');
  });

  it('opens a full-width overlay with its own focused input when the mobile trigger is activated', () => {
    const el = render(<SearchSlot />);
    const trigger = el.querySelector('button[aria-label="Search"]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const overlayInput = el.querySelector('#shell-search-overlay') as HTMLInputElement | null;
    expect(overlayInput).not.toBeNull();
    expect(document.activeElement).toBe(overlayInput);
  });

  it('closes the overlay and restores focus to its trigger on Escape', () => {
    const el = render(<SearchSlot />);
    const trigger = el.querySelector('button[aria-label="Search"]') as HTMLButtonElement;

    click(trigger);
    expect(el.querySelector('#shell-search-overlay')).not.toBeNull();

    keydown({ key: 'Escape' });

    expect(el.querySelector('#shell-search-overlay')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('AvatarMenu', () => {
  const user: SessionUser = {
    handle: 'ada',
    displayName: 'Ada Lovelace',
    avatarSrc: null,
    unreadNotifications: 0,
    unreadMessages: 0,
  };

  it('exposes Profile / Drafts / Settings / Sign out as real menuitem controls, and focuses the first on open', () => {
    const el = render(<AvatarMenu user={user} />);
    const trigger = el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = Array.from(el.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    expect(items.map((i) => i.textContent)).toEqual(['Profile', 'Drafts', 'Settings', 'Sign out']);
    expect(document.activeElement).toBe(items[0]);
  });

  it('traps Tab within the menu: Tab on the last item wraps to the first, Shift+Tab on the first wraps to the last', () => {
    const el = render(<AvatarMenu user={user} />);
    const trigger = el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    click(trigger);

    const items = Array.from(el.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    const first = items[0]!;
    const last = items[items.length - 1]!;

    act(() => {
      last.focus();
    });
    keydown({ key: 'Tab' });
    expect(document.activeElement).toBe(first);

    act(() => {
      first.focus();
    });
    keydown({ key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('closes on Escape and restores focus to the trigger', () => {
    const el = render(<AvatarMenu user={user} />);
    const trigger = el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    click(trigger);
    expect(el.querySelector('[role="menu"]')).not.toBeNull();

    keydown({ key: 'Escape' });

    expect(el.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('calls onSignOut when "Sign out" is activated', () => {
    const onSignOut = vi.fn();
    const el = render(<AvatarMenu user={user} onSignOut={onSignOut} />);
    click(el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement);

    const items = Array.from(el.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    const signOut = items.find((i) => i.textContent === 'Sign out')!;
    click(signOut);

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('IconBadgeLink', () => {
  it('announces the unread count in its accessible name and shows a visible badge when count > 0', () => {
    const el = render(<IconBadgeLink href="/inbox" label="Inbox" count={3} icon={<span />} />);
    const link = el.querySelector('a')!;
    expect(link.getAttribute('aria-label')).toBe('Inbox, 3 unread');
    expect(link.getAttribute('aria-live')).toBe('polite');
    expect(el.textContent).toContain('3');
  });

  it('omits the count from the accessible name and renders no badge when count is 0', () => {
    const el = render(<IconBadgeLink href="/inbox" label="Inbox" count={0} icon={<span />} />);
    const link = el.querySelector('a')!;
    expect(link.getAttribute('aria-label')).toBe('Inbox');
    expect(el.textContent?.trim()).toBe('');
  });

  it('caps the displayed badge at "99+" for counts over 99', () => {
    const el = render(<IconBadgeLink href="/inbox" label="Inbox" count={150} icon={<span />} />);
    expect(el.textContent).toContain('99+');
    expect(el.querySelector('a')?.getAttribute('aria-label')).toBe('Inbox, 150 unread');
  });
});

describe('StatePage', () => {
  it('renders exactly one <h1> with the given heading, the Wordmark, and the passed action', () => {
    const el = render(<StatePage heading="Page not found" message="gone" action={<a href="/x">Go home</a>} />);
    const h1s = el.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent).toBe('Page not found');
    expect(el.querySelector('a[href="/"]')?.textContent).toBe('myrio');
    expect(el.textContent).toContain('Go home');
  });

  it('renders no action wrapper when no action is passed', () => {
    const el = render(<StatePage heading="Empty" message="nothing here" />);
    expect(el.querySelector('a[href="/"]')?.textContent).toBe('myrio');
    expect(el.textContent).not.toContain('Go home');
  });
});

describe('not-found.tsx', () => {
  it('renders via StatePage: one <h1>, the Wordmark, and a link home', () => {
    const el = render(<NotFound />);
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toBe('Page not found');

    const links = Array.from(el.querySelectorAll('a'));
    expect(links.some((a) => a.getAttribute('href') === '/' && a.textContent === 'myrio')).toBe(true);
    expect(links.some((a) => a.getAttribute('href') === '/' && a.textContent === 'Go home')).toBe(true);
  });
});

describe('error.tsx', () => {
  it('renders via StatePage with a retry action and a home link, and never leaks error.message or error.stack into the DOM', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secretMessage = 'super secret internal detail 12345';
    const error = new Error(secretMessage) as Error & { digest?: string };
    error.stack = 'at SECRET_INTERNAL_FUNCTION (secret.ts:1:1)';

    const el = render(<ErrorFallback error={error} reset={() => {}} />);

    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.textContent).not.toContain(secretMessage);
    expect(el.textContent).not.toContain('SECRET_INTERNAL_FUNCTION');
    expect(el.querySelector('button')?.textContent).toBe('Try again');

    const links = Array.from(el.querySelectorAll('a'));
    expect(links.some((a) => a.getAttribute('href') === '/' && a.textContent === 'Go home')).toBe(true);

    consoleError.mockRestore();
  });

  it('calls reset() when "Try again" is activated', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    const error = new Error('boom') as Error & { digest?: string };

    const el = render(<ErrorFallback error={error} reset={reset} />);
    click(el.querySelector('button') as HTMLButtonElement);

    expect(reset).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe('Footer', () => {
  it('renders the seed-corpus attribution and a link home', () => {
    const el = render(<Footer />);
    expect(el.querySelector('footer')).not.toBeNull();
    expect(el.textContent).toContain('public-domain corpus');
    const links = Array.from(el.querySelectorAll('a'));
    expect(links.some((a) => a.getAttribute('href') === '/' && a.textContent === 'Home')).toBe(true);
  });
});
