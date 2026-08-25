import '@testing-library/jest-dom/vitest';
import './setupJsdomPolyfills';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaveStatus } from '../SaveStatus';

describe('SaveStatus', () => {
  it('renders exactly the four documented states', () => {
    const { rerender } = render(<SaveStatus status="saving" lastSavedAt={null} />);
    expect(screen.getByText('Saving…')).toBeInTheDocument();

    rerender(<SaveStatus status="unsaved" lastSavedAt={null} />);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    rerender(<SaveStatus status="failed" lastSavedAt={null} />);
    expect(screen.getByText('Save failed — retry')).toBeInTheDocument();

    const now = 1_000_000;
    rerender(<SaveStatus status="saved" lastSavedAt={now - 30_000} now={() => now} />);
    expect(screen.getByText('Saved 30s ago')).toBeInTheDocument();
  });

  it('is announced via aria-live=polite', () => {
    render(<SaveStatus status="saving" lastSavedAt={null} />);
    const el = screen.getByText('Saving…');
    expect(el).toHaveAttribute('aria-live', 'polite');
  });
});
