/**
 * jsdom doesn't implement layout, so `Range`/`Element` methods ProseMirror
 * calls during `scrollIntoView` (triggered by `.focus()`) are missing and
 * throw. This is a well-known jsdom+ProseMirror gap, not a bug in this
 * module — polyfilling these to no-ops is the standard workaround (same
 * one ProseMirror's own test suite uses under jsdom). Imported for its
 * side effect by every editor test that mounts a real Tiptap instance.
 *
 * Also registers React Testing Library's `cleanup()` in an `afterEach` —
 * vitest.config.ts has no global `setupFiles` (out of this task's file
 * scope to add one), and RTL's own auto-cleanup only self-registers when
 * it detects Jest's global `afterEach`, which this project's non-`globals`
 * vitest config doesn't provide. Without this, DOM nodes from one test
 * leak into the next `render()` in the same file.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

if (typeof document !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
  }
  if (!Element.prototype.getClientRects) {
    Element.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  }
}
