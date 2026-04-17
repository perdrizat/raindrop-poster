import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostPage from './PostPage';
import { fetchTaggedItems, updateBookmarkTags } from '../services/raindropioService';
import { generateProposals } from '../services/aiService';
import { publishPost } from '../services/publishService';
import { saveSettings, loadSettings } from '../services/settingsService';

vi.mock('../services/raindropioService', () => ({
    fetchTaggedItems: vi.fn(),
    updateBookmarkTags: vi.fn(),
}));

vi.mock('../services/aiService', () => ({
    generateProposals: vi.fn(),
}));

vi.mock('../services/publishService', () => ({
    publishPost: vi.fn(),
}));

const mockArticles = [
    { _id: 1, title: 'Article One', link: 'https://example.com/1', highlight: 'Highlight 1', created: '2026-01-01' },
    { _id: 2, title: 'Article Two', link: 'https://example.com/2', highlight: 'Highlight 2', created: '2026-01-02' },
    { _id: 3, title: 'Article Three', link: 'https://example.com/3', highlight: 'Highlight 3', created: '2026-01-03' },
];

describe('PostPage — scaffold + navigation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        // Default: generateProposals returns empty so nothing else fires
        generateProposals.mockResolvedValue({ proposals: [], author: null, scrapeData: null });
        // Screenshot fetch default
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ imageData: null }),
        });
    });

    it('renders loading state while fetching articles', async () => {
        fetchTaggedItems.mockResolvedValueOnce([]);
        render(<PostPage selectedTag="important" />);
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    });

    it('shows empty queue message when no articles found', async () => {
        fetchTaggedItems.mockResolvedValueOnce([]);
        render(<PostPage selectedTag="empty" />);
        await waitFor(() => expect(screen.getByText(/empty queue/i)).toBeInTheDocument());
    });

    it('renders first article title and URL', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());
        const link = screen.getByRole('link', { name: 'https://example.com/1' });
        expect(link).toHaveAttribute('href', 'https://example.com/1');
        expect(link).toHaveAttribute('target', '_blank');
    });

    it('shows queue position and total count', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        // 2 BookmarkNav instances (top + bottom) both show "1 of 3"
        await waitFor(() => {
            const labels = screen.getAllByText(/1 of 3/);
            expect(labels.length).toBeGreaterThanOrEqual(2);
        });
    });

    it('renders BookmarkNav at both top and bottom', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await waitFor(() => {
            const newerButtons = screen.getAllByRole('button', { name: /newer/i });
            const olderButtons = screen.getAllByRole('button', { name: /older/i });
            expect(newerButtons.length).toBe(2);
            expect(olderButtons.length).toBe(2);
        });
    });

    it('advances to next article when Older is clicked', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());

        const olderButtons = screen.getAllByRole('button', { name: /older/i });
        await userEvent.click(olderButtons[0]);

        await waitFor(() => expect(screen.getByText('Article Two')).toBeInTheDocument());
    });

    it('goes back to previous article when Newer is clicked', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        window.localStorage.setItem('raindrop_queue_index', '1');
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article Two')).toBeInTheDocument());

        const newerButtons = screen.getAllByRole('button', { name: /newer/i });
        await userEvent.click(newerButtons[0]);

        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());
    });

    it('persists queue index in localStorage', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());

        const olderButtons = screen.getAllByRole('button', { name: /older/i });
        await userEvent.click(olderButtons[0]);

        await waitFor(() => {
            expect(window.localStorage.getItem('raindrop_queue_index')).toBe('1');
        });
    });

    it('restores saved queue index on mount', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        window.localStorage.setItem('raindrop_queue_index', '2');
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article Three')).toBeInTheDocument());
    });

    it('triggers generateProposals automatically on article change', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(generateProposals).toHaveBeenCalled());
        expect(generateProposals.mock.calls[0][0].title).toBe('Article One');
    });
});

describe('PostPage — quote section', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        generateProposals.mockResolvedValue({ proposals: [], author: null, scrapeData: null });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ imageData: null }),
        });
    });

    it('renders editable quote textarea pre-filled from article.highlight', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/quote/i);
        await waitFor(() => expect(textarea.value).toBe('Highlight 1'));
    });

    it('allows editing the quote', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/quote/i);
        // Wait for the article-driven pre-fill before editing
        await waitFor(() => expect(textarea.value).toBe('Highlight 1'));
        await userEvent.clear(textarea);
        await userEvent.type(textarea, 'New quote text');
        expect(textarea.value).toBe('New quote text');
    });

    it('renders author, date, and publication (domain) fields', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/quote/i);
        expect(screen.getByLabelText(/author/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/publication|domain/i)).toBeInTheDocument();
    });

    it('pre-fills domain from article URL', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/quote/i);
        const domainInput = screen.getByLabelText(/publication|domain/i);
        await waitFor(() => expect(domainInput.value).toBe('example.com'));
    });

    it('allows editing the author field', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const authorInput = await screen.findByLabelText(/author/i);
        await userEvent.clear(authorInput);
        await userEvent.type(authorInput, 'Jane Doe');
        expect(authorInput.value).toBe('Jane Doe');
    });

    it('does NOT trigger a screenshot fetch when quote is edited', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/quote/i);

        // Initial screenshot fetch on article load
        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/screenshot', expect.any(Object));
        });
        const beforeEdit = globalThis.fetch.mock.calls.filter(c => c[0] === '/api/screenshot').length;

        // Edit quote & blur
        await userEvent.clear(textarea);
        await userEvent.type(textarea, 'Edited quote');
        textarea.blur();

        // Give any erroneous effect a chance to fire
        await new Promise(r => setTimeout(r, 50));

        const afterEdit = globalThis.fetch.mock.calls.filter(c => c[0] === '/api/screenshot').length;
        expect(afterEdit).toBe(beforeEdit);
    });
});

describe('PostPage — post section + emojis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        generateProposals.mockResolvedValue({ proposals: [], author: null, scrapeData: null });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ imageData: null }),
        });
    });

    it('renders an empty post textarea initially', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        expect(textarea.value).toBe('');
    });

    it('updates character count as user types', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'Hello');
        expect(screen.getByText(/5 characters/i)).toBeInTheDocument();
    });

    it('renders three emoji buttons', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/^post$/i);
        expect(screen.getByRole('button', { name: '🔥' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '🤯' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '🤡' })).toBeInTheDocument();
    });

    it('inserts emoji at cursor position when button is clicked', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        await userEvent.type(textarea, 'hello world');
        // Move cursor between hello and space
        textarea.focus();
        textarea.setSelectionRange(5, 5);

        await userEvent.click(screen.getByRole('button', { name: '🔥' }));
        expect(textarea.value).toBe('hello🔥 world');
    });

    it('appends emoji at end when textarea is not focused', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'hello');
        textarea.blur();

        await userEvent.click(screen.getByRole('button', { name: '🤯' }));
        expect(textarea.value).toBe('hello🤯');
    });

    it('shows Bluesky character limit warning when post text exceeds 300 chars', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'bluesky' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        const longText = 'x'.repeat(301);
        await userEvent.click(textarea);
        // Paste instead of typing char-by-char for speed
        await userEvent.paste(longText);

        expect(screen.getByText(/bluesky/i)).toBeInTheDocument();
        expect(screen.getByText(/300/)).toBeInTheDocument();
    });

    it('does NOT show Mastodon warning when only Bluesky is configured', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'bluesky' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/^post$/i);
        expect(screen.queryByText(/mastodon/i)).not.toBeInTheDocument();
    });

    it('does NOT show Bluesky warning at exactly 300 chars', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'bluesky' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(300));

        expect(screen.queryByText(/exceeds.*bluesky/i)).not.toBeInTheDocument();
    });
});

describe('PostPage — AI proposals panel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ imageData: null }),
        });
    });

    it('shows loading spinner while generating proposals', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        // Pending promise to keep isGenerating=true
        let resolveProposals;
        generateProposals.mockReturnValueOnce(new Promise(res => { resolveProposals = res; }));

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText(/generating proposals/i)).toBeInTheDocument());

        resolveProposals({ proposals: [], author: null, scrapeData: null });
    });

    it('renders proposal cards once generation completes', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: ['Proposal one', 'Proposal two', 'Proposal three'],
            author: null,
            scrapeData: null,
        });

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Proposal one')).toBeInTheDocument());
        expect(screen.getByText('Proposal two')).toBeInTheDocument();
        expect(screen.getByText('Proposal three')).toBeInTheDocument();
    });

    it('shows error state with retry when generation fails', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockRejectedValueOnce(new Error('API down'));

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText(/api down/i)).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('clicking a proposal fills post textarea', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: ['My proposed post'],
            author: null,
            scrapeData: null,
        });

        render(<PostPage selectedTag="important" />);
        const proposalBtn = await screen.findByRole('button', { name: /select this proposal/i });
        await userEvent.click(proposalBtn);

        const textarea = screen.getByLabelText(/^post$/i);
        expect(textarea.value).toBe('My proposed post');
    });

    it('clicking a proposal switches carousel to image options panel', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: ['My proposed post'],
            author: null,
            scrapeData: null,
        });

        render(<PostPage selectedTag="important" />);
        const proposalBtn = await screen.findByRole('button', { name: /select this proposal/i });

        // AI Proposals panel should be visible initially
        expect(screen.getByTestId('ai-proposals-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('image-options-panel')).not.toBeInTheDocument();

        await userEvent.click(proposalBtn);

        expect(screen.queryByTestId('ai-proposals-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('image-options-panel')).toBeInTheDocument();
    });

    it('typing in post textarea switches carousel to image options panel', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: [],
            author: null,
            scrapeData: null,
        });

        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        expect(screen.getByTestId('ai-proposals-panel')).toBeInTheDocument();

        await userEvent.type(textarea, 'H');

        expect(screen.getByTestId('image-options-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('ai-proposals-panel')).not.toBeInTheDocument();
    });

    it('regenerate button switches carousel back to proposals', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValue({
            proposals: ['A'],
            author: null,
            scrapeData: null,
        });

        render(<PostPage selectedTag="important" />);
        const proposalBtn = await screen.findByRole('button', { name: /select this proposal/i });
        await userEvent.click(proposalBtn);
        expect(screen.getByTestId('image-options-panel')).toBeInTheDocument();

        // Click Regenerate (there are two BookmarkNav instances; use the first)
        const regenerateButtons = screen.getAllByRole('button', { name: /regenerate proposals/i });
        await userEvent.click(regenerateButtons[0]);

        await waitFor(() => expect(screen.getByTestId('ai-proposals-panel')).toBeInTheDocument());
    });

    it('carousel resets to proposals panel when navigating to next bookmark', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValue({
            proposals: ['Proposal X'],
            author: null,
            scrapeData: null,
        });

        render(<PostPage selectedTag="important" />);
        // Switch to images panel by selecting a proposal
        const proposalBtn = await screen.findByRole('button', { name: /select this proposal/i });
        await userEvent.click(proposalBtn);
        expect(screen.getByTestId('image-options-panel')).toBeInTheDocument();

        // Navigate to next bookmark
        const olderButtons = screen.getAllByRole('button', { name: /older/i });
        await userEvent.click(olderButtons[0]);

        // Should reset to proposals panel for the new bookmark
        await waitFor(() => expect(screen.getByTestId('ai-proposals-panel')).toBeInTheDocument());
        expect(screen.queryByTestId('image-options-panel')).not.toBeInTheDocument();
    });

    it('cancels in-flight proposals when navigating to next bookmark', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);

        // Capture the signal used on first call
        let firstSignal = null;
        generateProposals.mockImplementation((article, prompt, signal) => {
            if (!firstSignal) firstSignal = signal;
            return new Promise(() => { /* never resolves */ });
        });

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(generateProposals).toHaveBeenCalled());

        const olderButtons = screen.getAllByRole('button', { name: /older/i });
        await userEvent.click(olderButtons[0]);

        await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    });
});

describe('PostPage — image options panel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        generateProposals.mockResolvedValue({ proposals: [], author: null, scrapeData: null });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ imageData: 'data:image/png;base64,SCREENSHOTDATA' }),
        });
    });

    const switchToImages = async () => {
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'x');
    };

    it('renders four image option cards: cover, screenshot, ai, custom', async () => {
        const articlesWithCover = [{ ...mockArticles[0], cover: 'https://img.com/cover.jpg' }];
        fetchTaggedItems.mockResolvedValueOnce(articlesWithCover);
        render(<PostPage selectedTag="important" />);
        await switchToImages();

        expect(screen.getByTestId('image-option-cover')).toBeInTheDocument();
        expect(screen.getByTestId('image-option-screenshot')).toBeInTheDocument();
        expect(screen.getByTestId('image-option-ai')).toBeInTheDocument();
        expect(screen.getByTestId('image-option-custom')).toBeInTheDocument();
    });

    it('displays screenshot image after capture completes', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await switchToImages();

        await waitFor(() => {
            const card = screen.getByTestId('image-option-screenshot');
            const img = card.querySelector('img');
            expect(img).toBeTruthy();
            expect(img.getAttribute('src')).toContain('SCREENSHOTDATA');
        });
    });

    it('clicking AI card when no image exists triggers generation with current quote', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        let generateCallBody = null;
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/venice/generate-image') {
                generateCallBody = JSON.parse(init.body);
                return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,AIDATA' }) };
            }
            return { ok: true, json: async () => ({ imageData: null }) };
        });

        render(<PostPage selectedTag="important" />);
        const quoteTa = await screen.findByLabelText(/quote/i);
        await waitFor(() => expect(quoteTa.value).toBe('Highlight 1'));
        // Edit quote to new text
        await userEvent.clear(quoteTa);
        await userEvent.type(quoteTa, 'EDITED QUOTE');

        await switchToImages();

        const aiCard = screen.getByTestId('image-option-ai');
        await userEvent.click(aiCard);

        await waitFor(() => expect(generateCallBody).toBeTruthy());
        // The prompt should include the edited quote
        expect(generateCallBody.prompt).toContain('EDITED QUOTE');
    });

    it('selects an image option when clicked (if image exists)', async () => {
        const articlesWithCover = [{ ...mockArticles[0], cover: 'https://img.com/cover.jpg' }];
        fetchTaggedItems.mockResolvedValueOnce(articlesWithCover);
        render(<PostPage selectedTag="important" />);
        await switchToImages();

        const coverCard = screen.getByTestId('image-option-cover');
        await userEvent.click(coverCard);
        // Visual selection: the selected card has ring-blue-500 or similar; we use aria-pressed / class match
        expect(coverCard.className).toMatch(/(ring|border-blue)/);
    });
});

describe('PostPage — publishing + overlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        generateProposals.mockResolvedValue({ proposals: ['Hello world'], author: null, scrapeData: null });
        updateBookmarkTags.mockResolvedValue(true);
        publishPost.mockResolvedValue({ success: true, url: 'https://buffer.com/abc' });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ imageData: null }),
        });
    });

    const fillPostAndSwitchToImages = async () => {
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'My post text');
        return textarea;
    };

    it('renders four publish buttons (Now, Prioritize, Next Available, Drafts)', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/^post$/i);

        expect(screen.getByRole('button', { name: /^now$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /prioritize/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /next available/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /drafts/i })).toBeInTheDocument();
    });

    it('clicking Drafts calls publishPost with bufferMode=draft', async () => {
        saveSettings({
            ...loadSettings(),
            selectedTag: 'important',
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        await waitFor(() => expect(publishPost).toHaveBeenCalled());
        const [fullText, articleUrl, imageInfo, destination, channels, mode] = publishPost.mock.calls[0];
        expect(fullText).toContain('My post text');
        expect(articleUrl).toBe('https://example.com/1');
        expect(destination).toBe('buffer');
        expect(channels).toEqual(['c1']);
        expect(mode).toBe('draft');
        expect(imageInfo).toBeTruthy();
    });

    it('constructs full text with attribution when no image is selected', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        const articleWithAuthor = [{ ...mockArticles[0] }];
        fetchTaggedItems.mockResolvedValueOnce(articleWithAuthor);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'Check this out');

        // Leave selectedImageOption as 'screenshot' but screenshot has no image → no image path
        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        await waitFor(() => expect(publishPost).toHaveBeenCalled());
        const [fullText] = publishPost.mock.calls[0];
        // With no image: include attribution + via URL
        expect(fullText).toContain('Check this out');
        expect(fullText).toContain('via https://example.com/1');
    });

    it('shows success overlay with URL after successful publish', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        publishPost.mockResolvedValueOnce({ success: true, url: 'https://buffer.com/posts/xyz' });

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        await waitFor(() => {
            expect(screen.getByRole('status')).toBeInTheDocument();
        });
        const link = screen.getByRole('link', { name: /view on buffer/i });
        expect(link).toHaveAttribute('href', 'https://buffer.com/posts/xyz');
    });

    it('shows error overlay when publish fails', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        publishPost.mockRejectedValueOnce(new Error('Server exploded'));

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        await waitFor(() => expect(screen.getByText(/server exploded/i)).toBeInTheDocument());
    });

    it('renders partial errors from publish success response', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        publishPost.mockResolvedValueOnce({
            success: true,
            url: 'https://buffer.com/x',
            partialErrors: ['Mastodon rate-limited', 'LinkedIn auth expired'],
        });

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        await waitFor(() => expect(screen.getByText(/some channels failed/i)).toBeInTheDocument());
        expect(screen.getByText(/mastodon rate-limited/i)).toBeInTheDocument();
        expect(screen.getByText(/linkedin auth expired/i)).toBeInTheDocument();
    });

    it('updates bookmark tags after successful publish', async () => {
        saveSettings({
            ...loadSettings(),
            selectedTag: 'important',
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        const articleWithTags = [{ ...mockArticles[0], tags: ['important', 'tech'] }];
        fetchTaggedItems.mockResolvedValueOnce(articleWithTags);

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        await waitFor(() => expect(updateBookmarkTags).toHaveBeenCalled());
        const [bookmarkId, newTags] = updateBookmarkTags.mock.calls[0];
        expect(bookmarkId).toBe(1);
        expect(newTags).toContain('tech');
        expect(newTags).toContain('important_posted');
        expect(newTags).not.toContain('important');
    });

    it('shows tag warning when updateBookmarkTags fails', async () => {
        saveSettings({
            ...loadSettings(),
            selectedTag: 'important',
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        const articleWithTags = [{ ...mockArticles[0], tags: ['important'] }];
        fetchTaggedItems.mockResolvedValueOnce(articleWithTags);
        updateBookmarkTags.mockResolvedValueOnce(false);

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        await waitFor(() => expect(screen.getByText(/could not update tags/i)).toBeInTheDocument());
    });

    it('Next Post button advances to next bookmark and dismisses overlay', async () => {
        saveSettings({
            ...loadSettings(),
            selectedTag: 'important',
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());
        const textarea = screen.getByLabelText(/^post$/i);
        await userEvent.type(textarea, 'X');

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        const nextBtn = await screen.findByRole('button', { name: /next post/i });
        await userEvent.click(nextBtn);

        // Overlay dismissed
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        // Advanced to article two
        await waitFor(() => expect(screen.getByText('Article Two')).toBeInTheDocument());
    });

    it('dismiss button on overlay closes the overlay', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        const dismissBtn = await screen.findByRole('button', { name: /dismiss/i });
        await userEvent.click(dismissBtn);

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('disables publish buttons while publishing is in flight', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        let resolvePublish;
        publishPost.mockReturnValueOnce(new Promise(res => { resolvePublish = res; }));

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        const draftsBtn = screen.getByRole('button', { name: /drafts/i });
        await userEvent.click(draftsBtn);

        await waitFor(() => expect(draftsBtn).toBeDisabled());

        resolvePublish({ success: true, url: 'https://buffer.com/x' });
    });

    it('disables publish buttons when Bluesky char limit is exceeded', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'bluesky' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);

        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(301));

        expect(screen.getByRole('button', { name: /drafts/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^now$/i })).toBeDisabled();
    });
});
