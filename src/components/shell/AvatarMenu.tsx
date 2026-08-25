'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from './icons';
import type { SessionUser } from './types';
import styles from './AvatarMenu.module.css';

type AvatarMenuProps = {
  user: SessionUser;
  onSignOut?: () => void;
};

/**
 * Avatar dropdown: Profile / Drafts / Settings / Sign out. Traps focus while
 * open, closes on Escape or an outside click, and restores focus to the
 * trigger on close — the modals/menus accessibility floor in SPEC-009.
 */
export function AvatarMenu({ user, onSignOut }: AvatarMenuProps) {
  const [isOpen, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const menuItems = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    menuItems?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === 'Tab' && menuItems && menuItems.length > 0) {
        const first = menuItems[0];
        const last = menuItems[menuItems.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    function onPointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Account menu, signed in as ${user.displayName}`}
        onClick={() => setOpen((open) => !open)}
      >
        {user.avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- shell avatar is a tiny presentational stand-in; real image handling belongs to Media & Uploads
          <img src={user.avatarSrc} alt="" className={styles.avatar} />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <ChevronDownIcon />
      </button>

      {isOpen && (
        <div className={styles.menu} role="menu" aria-label="Account" ref={menuRef}>
          <a href={`/@${user.handle}`} role="menuitem" className={styles.menuItem}>
            Profile
          </a>
          <a href="/drafts" role="menuitem" className={styles.menuItem}>
            Drafts
          </a>
          <a href="/settings" role="menuitem" className={styles.menuItem}>
            Settings
          </a>
          <hr className={styles.divider} />
          <button type="button" role="menuitem" className={styles.menuItem} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
