import '@testing-library/jest-dom/vitest';
import '../../../../components/editor/__tests__/setupJsdomPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

// eslint-disable-next-line import/first -- must follow the mock above
import NewArticlePage from '../page';

function draftResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    article: {
      id: 'a1',
      title: '',
      subtitle: null,
      bodyJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [] }] }),
      coverUploadId: null,
      updatedAt: 1000,
      status: 'draft',
      ...overrides,
    },
  };
}

describe('/new (NewArticlePage)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    replace.mockClear();
    push.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a draft on mount and renders the editor form', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 201, json: async () => draftResponse() });

    render(<NewArticlePage />);

    expect(screen.getByText('Starting a new draft…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith('/api/drafts', expect.objectContaining({ method: 'POST' }));
  });

  it('redirects to /login on a 401', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 401, json: async () => ({}) });
    render(<NewArticlePage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('shows an error message if draft creation fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 500, json: async () => ({}) });
    render(<NewArticlePage />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/try again/i));
  });
});
