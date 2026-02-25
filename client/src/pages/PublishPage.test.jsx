import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PublishPage from './PublishPage';
import { fetchTaggedItems } from '../services/raindropioService';

// Mock the service
vi.mock('../services/raindropioService', () => ({
    fetchTaggedItems: vi.fn()
}));

const mockArticles = [
    {
        _id: 1,
        title: 'Article 1',
        link: 'https://example.com/1',
        highlights: [{ text: 'Highlight 1' }]
    },
    {
        _id: 2,
        title: 'Article 2',
        link: 'https://example.com/2',
        highlights: [{ text: 'Highlight 2A' }, { text: 'Highlight 2B' }]
    }
];

describe('PublishPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders loading state initially and calls fetchTaggedItems', async () => {
        fetchTaggedItems.mockResolvedValueOnce([]);
        render(<PublishPage selectedTag="important" onBack={() => { }} />);

        expect(screen.getByText(/loading/i)).toBeInTheDocument();
        expect(fetchTaggedItems).toHaveBeenCalledWith('important');

        await waitFor(() => {
            expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        });
    });

    it('displays empty queue message when no items are returned', async () => {
        fetchTaggedItems.mockResolvedValueOnce([]);
        render(<PublishPage selectedTag="empty-tag" onBack={() => { }} />);

        await waitFor(() => {
            expect(screen.getByText(/empty queue/i)).toBeInTheDocument();
        });
    });

    it('renders first article details when items are returned', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PublishPage selectedTag="testing" onBack={() => { }} />);

        await waitFor(() => {
            expect(screen.getByText('Article 1')).toBeInTheDocument();
        });
        expect(screen.getByText('https://example.com/1')).toBeInTheDocument();
        expect(screen.getByText(/Highlight 1/i)).toBeInTheDocument();
        // Since there are 2 articles, older button should be visible/active
        expect(screen.getByRole('button', { name: /older/i })).toBeInTheDocument();
        // Newer should be disabled on the first item
        expect(screen.getByRole('button', { name: /newer/i })).toBeDisabled();
    });

    it('navigates between articles using Older and Newer buttons', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        const user = userEvent.setup();
        render(<PublishPage selectedTag="testing" onBack={() => { }} />);

        // Wait for first article to load
        await waitFor(() => {
            expect(screen.getByText('Article 1')).toBeInTheDocument();
        });

        // Click older
        await user.click(screen.getByRole('button', { name: /older/i }));

        expect(screen.getByText('Article 2')).toBeInTheDocument();
        expect(screen.getByText(/Highlight 2A/i)).toBeInTheDocument();
        expect(screen.getByText(/Highlight 2B/i)).toBeInTheDocument();

        // Now on last item, older should be disabled
        expect(screen.getByRole('button', { name: /older/i })).toBeDisabled();
        // Newer should be enabled
        expect(screen.getByRole('button', { name: /newer/i })).not.toBeDisabled();

        // Click newer
        await user.click(screen.getByRole('button', { name: /newer/i }));
        expect(screen.getByText('Article 1')).toBeInTheDocument();
    });
});
