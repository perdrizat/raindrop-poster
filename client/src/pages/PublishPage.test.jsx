import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PublishPage from './PublishPage';
import { fetchTaggedItems } from '../services/raindropioService';
import { generateProposals } from '../services/aiService';

// Mock the services
vi.mock('../services/raindropioService', () => ({
    fetchTaggedItems: vi.fn()
}));

vi.mock('../services/aiService', () => ({
    generateProposals: vi.fn()
}));

const mockArticles = [
    {
        _id: 1,
        title: 'Article 1',
        link: 'https://example.com/1',
        highlight: 'Highlight 1'
    },
    {
        _id: 2,
        title: 'Article 2',
        link: 'https://example.com/2',
        highlight: 'Highlight 2A'
    }
];

describe('PublishPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
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

        // Now on last item, older should be disabled
        expect(screen.getByRole('button', { name: /older/i })).toBeDisabled();
        // Newer should be enabled
        expect(screen.getByRole('button', { name: /newer/i })).not.toBeDisabled();

        // Click newer
        await user.click(screen.getByRole('button', { name: /newer/i }));
        expect(screen.getByText('Article 1')).toBeInTheDocument();
    });

    it('triggers AI generation and shows loading state when an article is displayed', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        // Delay the resolution to check loading state
        let resolveGen;
        const genPromise = new Promise(resolve => { resolveGen = resolve; });
        generateProposals.mockReturnValueOnce(genPromise);

        render(<PublishPage selectedTag="testing" onBack={() => { }} />);

        // Wait for article view
        await waitFor(() => {
            expect(screen.getByText('Article 1')).toBeInTheDocument();
        });

        // Verify aiService was called
        expect(generateProposals).toHaveBeenCalledWith(mockArticles[0], expect.any(String));

        // Wait for loading element specific to generation
        await waitFor(() => {
            expect(screen.getByText(/Generating proposals.../i)).toBeInTheDocument();
        });

        // Resolve to clean up
        resolveGen({ proposals: ['Prop 1', 'Prop 2', 'Prop 3'], author: null });
        await waitFor(() => {
            expect(screen.queryByText(/Generating proposals.../i)).not.toBeInTheDocument();
        });
    });

    it('displays generated proposals successfully', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({ proposals: ['First awesome tweet!', 'Second highly engaging thread.', 'Third short hook.'], author: null, scrapeData: { markdown: '', html: '' } });

        render(<PublishPage selectedTag="testing" onBack={() => { }} />);

        await waitFor(() => {
            expect(screen.getByText(/First awesome tweet/i)).toBeInTheDocument();
            expect(screen.getByText(/Second highly engaging thread/i)).toBeInTheDocument();
            expect(screen.getByText(/Third short hook/i)).toBeInTheDocument();
        });
    });

    it('displays an error message and a retry button if generation fails', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockRejectedValueOnce(new Error('API failure'));
        const user = userEvent.setup();

        render(<PublishPage selectedTag="test-tag" onBack={() => { }} />);

        // Wait for it to fail
        await waitFor(() => {
            expect(screen.getByText('API failure')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /retry generation/i })).toBeInTheDocument();
        });

        // Click retry
        generateProposals.mockResolvedValueOnce({ proposals: ['Retried tweet'], author: null });
        await user.click(screen.getByRole('button', { name: /Retry Generation/i }));

        await waitFor(() => {
            expect(screen.getByText('Retried tweet')).toBeInTheDocument();
        });
    });
    it('shows extracted author in the author field after generation', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({ proposals: ['Tweet 1'], author: 'Jane Doe' });

        render(<PublishPage selectedTag="testing" onSelectProposal={() => {}} />);

        await waitFor(() => {
            expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
        });
    });

    it('allows overriding the author and passes scrapeData to onSelectProposal', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        const mockScrapeData = { markdown: '# Test\n\nContent', html: '<h1>Test</h1><p>Content</p>' };
        generateProposals.mockResolvedValueOnce({ proposals: ['Tweet 1'], author: 'Jane Doe', scrapeData: mockScrapeData });
        const onSelect = vi.fn();
        const user = userEvent.setup();

        render(<PublishPage selectedTag="testing" onSelectProposal={onSelect} />);

        await waitFor(() => {
            expect(screen.getByText('Tweet 1')).toBeInTheDocument();
        });

        // Override the author
        const authorInput = screen.getByLabelText(/Author/i);
        await user.clear(authorInput);
        await user.type(authorInput, 'John Smith');

        // Click Review & Publish on the AI proposal
        const reviewButtons = screen.getAllByRole('button', { name: /Review & Publish/i });
        await user.click(reviewButtons[0]);

        expect(onSelect).toHaveBeenCalledWith(
            'Tweet 1',
            expect.objectContaining({
                extractedAuthor: 'John Smith',
                scrapeData: mockScrapeData
            })
        );
    });

    it('renders custom post textarea and passes it to onSelectProposal', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({ proposals: ['AI tweet'], author: null });
        const onSelect = vi.fn();
        const user = userEvent.setup();

        render(<PublishPage selectedTag="testing" onSelectProposal={onSelect} />);

        await waitFor(() => {
            expect(screen.getByText('AI tweet')).toBeInTheDocument();
        });

        // Custom proposal section should exist
        const customTextarea = screen.getByPlaceholderText(/Write your own post text/i);
        expect(customTextarea).toBeInTheDocument();

        // Review button should be disabled when empty
        const reviewButtons = screen.getAllByRole('button', { name: /Review & Publish/i });
        const customReviewBtn = reviewButtons[reviewButtons.length - 1]; // last one is for custom
        expect(customReviewBtn).toBeDisabled();

        // Type a custom proposal
        await user.type(customTextarea, 'My custom post');
        expect(customReviewBtn).not.toBeDisabled();

        await user.click(customReviewBtn);
        expect(onSelect).toHaveBeenCalledWith(
            'My custom post',
            expect.objectContaining({ _id: 1, title: 'Article 1' })
        );
    });

    it('passes custom posting objectives from localStorage to aiService', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({ proposals: ['Test proposal'], author: null });

        // Hydrate localStorage with custom settings using the CORRECT key
        window.localStorage.setItem('raindrop_publisher_settings', JSON.stringify({
            postingObjectives: 'Custom TDD Objective: Make it go viral'
        }));

        render(<PublishPage selectedTag="test-tag" onBack={() => { }} />);

        // Wait for generation to be triggered on load
        await waitFor(() => {
            // First argument is the article object, second argument is the prompt
            expect(generateProposals).toHaveBeenCalledWith(
                expect.objectContaining({ _id: 1, title: 'Article 1' }),
                'Custom TDD Objective: Make it go viral'
            );
        });

        window.localStorage.clear();
    });
});
