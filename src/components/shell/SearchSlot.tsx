'use client';

import { useEffect, useRef, useState } from 'react';
import { CloseIcon, SearchIcon } from './icons';
import styles from './SearchSlot.module.css';

/**
 * Shell-owned search slot. See the ownership-boundary note in
 * SearchSlot.module.css: this renders a real, accessible search input on
 * every route today; it is not the Search section's `<SearchBox />` (no
 * debounce, no dropdown, no API call — that lives in src/components/search/**
 * when that slice lands). Below 720px the input collapses to an
 * icon-triggered full-width overlay, per SPEC-009.
 */
export function SearchSlot() {
  const [isOverlayOpen, setOverlayOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOverlayOpen) return;
    overlayInputRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeOverlay();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeOverlay is stable (declared below, only touches state/refs)
  }, [isOverlayOpen]);

  function closeOverlay() {
    setOverlayOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <form role="search" className={`${styles.field} ${styles.desktopField}`} aria-label="Search articles">
        <SearchIcon className={styles.icon} />
        <label htmlFor="shell-search-desktop" className="visually-hidden">
          Search
        </label>
        <input
          id="shell-search-desktop"
          className={styles.input}
          type="search"
          name="q"
          placeholder="Search"
          autoComplete="off"
        />
      </form>

      <button
        ref={triggerRef}
        type="button"
        className={styles.mobileTrigger}
        aria-label="Search"
        aria-haspopup="true"
        aria-expanded={isOverlayOpen}
        onClick={() => setOverlayOpen(true)}
      >
        <SearchIcon />
      </button>

      {isOverlayOpen && (
        <div className={styles.overlay} role="search" aria-label="Search articles">
          <SearchIcon className={styles.icon} />
          <label htmlFor="shell-search-overlay" className="visually-hidden">
            Search
          </label>
          <input
            ref={overlayInputRef}
            id="shell-search-overlay"
            className={styles.input}
            type="search"
            name="q"
            placeholder="Search"
            autoComplete="off"
          />
          <button type="button" className={styles.overlayClose} aria-label="Close search" onClick={closeOverlay}>
            <CloseIcon />
          </button>
        </div>
      )}
    </>
  );
}
