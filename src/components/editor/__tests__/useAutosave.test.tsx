import './setupJsdomPolyfills';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave, type SaveOutcome } from '../useAutosave';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires a save after exactly 3s of keystroke idleness, not before', async () => {
    const onSave = vi.fn<(value: string) => Promise<SaveOutcome>>().mockResolvedValue({ ok: true });
    const { rerender } = renderHook(({ value }) => useAutosave({ value, onSave }), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });

    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(onSave).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('ab');
  });

  it('resets the 3s debounce on every keystroke', async () => {
    const onSave = vi.fn<(value: string) => Promise<SaveOutcome>>().mockResolvedValue({ ok: true });
    const { rerender } = renderHook(({ value }) => useAutosave({ value, onSave }), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    rerender({ value: 'abc' }); // resets the debounce window
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(onSave).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('abc');
  });

  it('saves after 15s of continuous typing even though the 3s debounce never fires', async () => {
    const onSave = vi.fn<(value: string) => Promise<SaveOutcome>>().mockResolvedValue({ ok: true });
    const { rerender } = renderHook(({ value }) => useAutosave({ value, onSave }), {
      initialProps: { value: 'a' },
    });

    // A keystroke every 2s for 16s — always inside the 3s debounce window,
    // so only the 15s max-wait timer can be what fires the save.
    for (let i = 0; i < 8; i++) {
      rerender({ value: `v${i}` });
      await act(() => vi.advanceTimersByTimeAsync(2000));
    }
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('exposes exactly the four documented states', async () => {
    const onSave = vi.fn<(value: string) => Promise<SaveOutcome>>().mockResolvedValue({ ok: true });
    const { result, rerender } = renderHook(({ value }) => useAutosave({ value, onSave }), {
      initialProps: { value: 'a' },
    });
    expect(result.current.status).toBe('saved');

    rerender({ value: 'ab' });
    expect(result.current.status).toBe('unsaved');

    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it('retries on failure with 1s/2s/4s backoff, then gives up as failed', async () => {
    const onSave = vi.fn<(value: string) => Promise<SaveOutcome>>().mockResolvedValue({ ok: false });
    const { result, rerender } = renderHook(({ value }) => useAutosave({ value, onSave }), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    await act(() => vi.advanceTimersByTimeAsync(3000)); // initial attempt
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(1000)); // retry #1 at +1s
    expect(onSave).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(2000)); // retry #2 at +2s
    expect(onSave).toHaveBeenCalledTimes(3);

    await act(() => vi.advanceTimersByTimeAsync(4000)); // retry #3 at +4s
    expect(onSave).toHaveBeenCalledTimes(4);

    expect(result.current.status).toBe('failed');
  });

  it('surfaces a 409 as a conflict and stops autosaving', async () => {
    const onSave = vi
      .fn<(value: string) => Promise<SaveOutcome>>()
      .mockResolvedValue({ ok: false, conflict: true });
    const { result, rerender } = renderHook(({ value }) => useAutosave({ value, onSave }), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(result.current.conflict).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);

    // Further edits must not trigger another save once conflicted.
    rerender({ value: 'abc' });
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('flush() saves immediately, e.g. on blur', async () => {
    const onSave = vi.fn<(value: string) => Promise<SaveOutcome>>().mockResolvedValue({ ok: true });
    const { result, rerender } = renderHook(({ value }) => useAutosave({ value, onSave }), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    await act(async () => {
      result.current.flush();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
