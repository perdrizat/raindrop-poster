import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

// Place the caret inside a contenteditable element at a given text-offset.
const setCursorAtOffset = (el, offset) => {
    const range = document.createRange();
    let remaining = offset;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    let placed = false;
    while ((node = walker.nextNode())) {
        const len = node.textContent.length;
        if (remaining <= len) {
            range.setStart(node, remaining);
            range.setEnd(node, remaining);
            placed = true;
            break;
        }
        remaining -= len;
    }
    if (!placed) {
        range.selectNodeContents(el);
        range.collapse(false);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
};

describe('PostPage — scaffold + navigation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        window.history.replaceState(null, '', window.location.pathname);
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

    it('redirects to setup with error flag when the bookmark fetch is unauthorized (401)', async () => {
        // fetchTaggedItems throws 'unauthorized' when Raindrop returns 401 (expired/revoked token)
        fetchTaggedItems.mockRejectedValueOnce(new Error('unauthorized'));

        const originalLocation = window.location;
        delete window.location;
        window.location = { ...originalLocation, href: 'http://localhost/post', assign: vi.fn() };
        try {
            render(<PostPage selectedTag="important" />);
            await waitFor(() => {
                expect(window.location.href).toBe('/setup?error=raindrop');
            });
        } finally {
            window.location = originalLocation;
        }
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

    it('shows URL character count in parentheses next to the article link', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());
        // 'https://example.com/1' is 22 chars
        expect(screen.getByText(`(${mockArticles[0].link.length})`)).toBeInTheDocument();
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
        window.location.hash = '#2';
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article Two')).toBeInTheDocument());

        const newerButtons = screen.getAllByRole('button', { name: /newer/i });
        await userEvent.click(newerButtons[0]);

        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());
    });

    it('writes queue index to URL hash when navigating (1-indexed)', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        window.location.hash = '';
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());

        const olderButtons = screen.getAllByRole('button', { name: /older/i });
        await userEvent.click(olderButtons[0]);

        await waitFor(() => expect(window.location.hash).toBe('#2'));
    });

    it('reads queue index from URL hash on mount', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        window.location.hash = '#3';
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article Three')).toBeInTheDocument());
    });

    it('responds to external hash changes (back/forward button)', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        window.location.hash = '#1';
        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());

        window.location.hash = '#3';
        window.dispatchEvent(new HashChangeEvent('hashchange'));

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
        window.history.replaceState(null, '', window.location.pathname);
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

    it('date field is a native date input pre-filled with the ISO date from article.created', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const dateInput = await screen.findByLabelText(/date/i);
        // Native date input: value is always ISO YYYY-MM-DD regardless of browser locale
        expect(dateInput).toHaveAttribute('type', 'date');
        await waitFor(() => expect(dateInput.value).toBe('2026-01-01'));
    });

    it('initial screenshot request sends the date in ISO format, not a locale string', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/quote/i);

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/screenshot', expect.any(Object));
        });
        const calls = globalThis.fetch.mock.calls.filter(c => c[0] === '/api/screenshot');
        const body = JSON.parse(calls[0][1].body);
        expect(body.date).toBe('2026-01-01');
    });

    it('refresh screenshot button fires /api/screenshot with current author/date/domain', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const authorInput = await screen.findByLabelText(/author/i);

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/screenshot', expect.any(Object));
        });

        await userEvent.clear(authorInput);
        await userEvent.type(authorInput, 'Jane Doe');
        const dateInput = screen.getByLabelText(/date/i);
        await userEvent.clear(dateInput);
        await userEvent.type(dateInput, '2024-01-15');

        const refreshBtn = screen.getByRole('button', { name: /refresh screenshot/i });
        await userEvent.click(refreshBtn);

        const calls = globalThis.fetch.mock.calls.filter(c => c[0] === '/api/screenshot');
        const latest = JSON.parse(calls[calls.length - 1][1].body);
        expect(latest.author).toBe('Jane Doe');
        expect(latest.date).toBe('2024-01-15');
        expect(latest.domain).toBe('example.com');
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
        window.history.replaceState(null, '', window.location.pathname);
        generateProposals.mockResolvedValue({ proposals: [], author: null, scrapeData: null });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ imageData: null }),
        });
    });

    it('renders an empty post editor initially', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const editor = await screen.findByLabelText(/^post$/i);
        expect(editor.textContent).toBe('');
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
        const editor = await screen.findByLabelText(/^post$/i);

        await userEvent.type(editor, 'hello world');
        // Move cursor between hello and space
        editor.focus();
        setCursorAtOffset(editor, 5);

        await userEvent.click(screen.getByRole('button', { name: '🔥' }));
        expect(editor.textContent).toBe('hello🔥 world');
    });

    it('appends emoji at end when editor is not focused', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const editor = await screen.findByLabelText(/^post$/i);
        await userEvent.type(editor, 'hello');
        editor.blur();

        await userEvent.click(screen.getByRole('button', { name: '🤯' }));
        expect(editor.textContent).toBe('hello🤯');
    });

    it('renders an inline highlight marking chars past the strictest limit when over', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'bluesky' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const editor = await screen.findByLabelText(/^post$/i);

        await userEvent.click(editor);
        await userEvent.paste('x'.repeat(300));

        const highlighted = await screen.findByTestId('post-overage-highlight');
        // Highlight span lives inside the editor, not in a separate overlay
        expect(editor.contains(highlighted)).toBe(true);
        // highlighted segment contains only the excess x's, not the full post
        expect(highlighted.textContent.length).toBeGreaterThan(0);
        expect(highlighted.textContent.length).toBeLessThan(300);
    });

    it('does NOT render the inline highlight when post text is under the limit', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'bluesky' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const editor = await screen.findByLabelText(/^post$/i);

        await userEvent.click(editor);
        await userEvent.paste('short post');

        expect(screen.queryByTestId('post-overage-highlight')).not.toBeInTheDocument();
    });

    it('shows Bluesky character limit warning when post text (plus fixed URL) exceeds 300 chars', async () => {
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

    it('does NOT show Bluesky warning when post text (plus fixed URL) is at the 300 boundary', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'bluesky' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
 
        // 275 chars post + 2 newlines + 23 chars URL = 300
        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(275));
 
        expect(screen.queryByText(/exceeds.*bluesky/i)).not.toBeInTheDocument();
    });

    it('shows Twitter character limit warning and highlights overage when post exceeds 280 chars', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'tw1', service: 'twitter' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(350));

        await waitFor(() => {
            expect(screen.getByText(/twitter/i)).toBeInTheDocument();
            expect(screen.getByText(/280/)).toBeInTheDocument();
            expect(screen.getByTestId('post-overage-highlight')).toBeInTheDocument();
        });
    });

    it('treats Twitter URLs as a fixed 23 chars regardless of actual URL length (t.co rule)', async () => {
        // Long article URL (90 chars) would otherwise eat huge amounts of the 280 budget.
        // With the t.co 23-char rule: 255 post + 2 newlines + 23 URL = 280 exactly -> no overage.
        const longUrlArticle = [{
            _id: 99,
            title: 'Long URL',
            link: 'https://www.taurushq.com/blog/defending-cold-wallets-guidelines-for-financial-institutions',
            highlight: '',
            created: '2026-01-01',
        }];
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'tw1', service: 'twitter' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(longUrlArticle);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(255));

        // 255 + 2 + 23 = 280 -> at the boundary, no overage
        expect(screen.queryByTestId('post-overage-highlight')).not.toBeInTheDocument();
        expect(screen.queryByText(/exceeds.*twitter/i)).not.toBeInTheDocument();
    });

    it('triggers Twitter overage at 256 chars with a long URL (23-char URL budget)', async () => {
        const longUrlArticle = [{
            _id: 99,
            title: 'Long URL',
            link: 'https://www.taurushq.com/blog/defending-cold-wallets-guidelines-for-financial-institutions',
            highlight: '',
            created: '2026-01-01',
        }];
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'tw1', service: 'twitter' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(longUrlArticle);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(256));

        // 256 + 2 + 23 = 281 -> 1 char over
        await waitFor(() => {
            expect(screen.getByTestId('post-overage-highlight')).toBeInTheDocument();
        });
    });

    it('uses server bufferChannels (from /api/system/status) for char limit when localStorage has no service types', async () => {
        // localStorage has channels without service types (stale format)
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'bsky-1' }], // no service field
        });
        // Server returns the same channel with service type
        globalThis.fetch = vi.fn().mockImplementation((url) => {
            if (url === '/api/system/status') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ bufferChannels: [{ id: 'bsky-1', service: 'bluesky' }] }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({ imageData: null }) });
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(500));

        await waitFor(() => {
            expect(screen.getByTestId('post-overage-highlight')).toBeInTheDocument();
        });
    });

    it('applies strictest known limit when NO buffer channels are configured', async () => {
        // localStorage has no channels at all
        saveSettings({
            ...loadSettings(),
            bufferChannels: [],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(660));

        await waitFor(() => {
            expect(screen.getByTestId('post-overage-highlight')).toBeInTheDocument();
        });
    });

    it('applies strictest known limit when channels have no service type (stale SQLite data)', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'unknown-1' }], // no service field at all
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);

        await userEvent.click(textarea);
        await userEvent.paste('x'.repeat(500));

        await waitFor(() => {
            expect(screen.getByTestId('post-overage-highlight')).toBeInTheDocument();
        });
    });

    it('renders Post section before Quote section in the DOM', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/^post$/i);

        const postEditor = screen.getByLabelText(/^post$/i);
        const quoteEditor = screen.getByLabelText(/^quote$/i);
        expect(
            postEditor.compareDocumentPosition(quoteEditor) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    });

    it('Post box has a distinct background class not shared with the Quote box', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/^post$/i);

        const postBox = screen.getByLabelText(/^post$/i).closest('[class*="rounded-xl"]');
        const quoteBox = screen.getByLabelText(/^quote$/i).closest('[class*="rounded-xl"]');

        // Post box must carry an amber/yellow background class
        expect(postBox.className).toMatch(/bg-amber/);
        // Quote box must NOT share that amber class
        expect(quoteBox.className).not.toMatch(/bg-amber/);
    });
});

describe('PostPage — AI proposals panel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        window.history.replaceState(null, '', window.location.pathname);
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

    it('passes the channel-aware character budget to generateProposals', async () => {
        // Bluesky: 300 total − 2 separator − 23 fixed URL cost = 275 for the post text
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'bluesky' }],
        });
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(generateProposals).toHaveBeenCalled());

        const budget = generateProposals.mock.calls[0][3];
        expect(budget).toBe(275);
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

        const editor = screen.getByLabelText(/^post$/i);
        expect(editor.textContent).toBe('My proposed post');
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

    it('re-fires screenshot with author when AI extraction returns a non-empty author', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: ['Post text'],
            author: 'Jane Doe',
            scrapeData: null,
        });

        const screenshotBodies = [];
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/screenshot') {
                screenshotBodies.push(JSON.parse(init.body));
            }
            return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,X' }) };
        });

        render(<PostPage selectedTag="important" />);

        // Wait for the second screenshot call (the one triggered by author discovery)
        await waitFor(() => expect(screenshotBodies.length).toBeGreaterThanOrEqual(2));
        const authoredCall = screenshotBodies.find(b => b.author === 'Jane Doe');
        expect(authoredCall).toBeTruthy();
    });

    it('author re-capture passes the scraped article HTML so the server renders locally', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: ['Post text'],
            author: 'Jane Doe',
            scrapeData: { markdown: '# Art', html: '<article>Scraped body</article>' },
        });

        const screenshotBodies = [];
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/screenshot') {
                screenshotBodies.push(JSON.parse(init.body));
            }
            return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,X' }) };
        });

        render(<PostPage selectedTag="important" />);

        await waitFor(() => expect(screenshotBodies.length).toBeGreaterThanOrEqual(2));
        const authoredCall = screenshotBodies.find(b => b.author === 'Jane Doe');
        expect(authoredCall.articleHtml).toBe('<article>Scraped body</article>');
    });

    it('refresh screenshot button passes the scraped article HTML once available', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: ['Post text'],
            author: null,
            scrapeData: { markdown: '# Art', html: '<article>Scraped body</article>' },
        });

        const screenshotBodies = [];
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/screenshot') {
                screenshotBodies.push(JSON.parse(init.body));
            }
            return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,X' }) };
        });

        render(<PostPage selectedTag="important" />);
        // Wait for proposals (and thus scrapeData) to land
        await waitFor(() => expect(generateProposals).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByRole('button', { name: /refresh screenshot/i })).toBeInTheDocument());

        await userEvent.click(screen.getByRole('button', { name: /refresh screenshot/i }));

        await waitFor(() => {
            const last = screenshotBodies[screenshotBodies.length - 1];
            expect(last.articleHtml).toBe('<article>Scraped body</article>');
        });
    });

    it('auto-recaptures with scraped HTML when the initial live capture failed (no author needed)', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        let resolveScrape;
        generateProposals.mockImplementationOnce(() => new Promise(r => { resolveScrape = r; }));

        const screenshotBodies = [];
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/screenshot') {
                screenshotBodies.push(JSON.parse(init.body));
                // Initial live-URL capture fails (e.g. popup-blocked page)
                if (screenshotBodies.length === 1) {
                    return { ok: false, json: async () => ({ error: 'Failed to capture screenshot' }) };
                }
            }
            return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,X' }) };
        });

        render(<PostPage selectedTag="important" />);

        // Initial capture fails on the live path; give the rejection a tick to settle
        await waitFor(() => expect(screenshotBodies.length).toBe(1));
        await new Promise(r => setTimeout(r, 50));

        // Proposals finish later with scraped HTML but no author
        resolveScrape({
            proposals: ['P1'],
            author: null,
            scrapeData: { markdown: '# Art', html: '<article>Scraped body</article>' },
        });

        await waitFor(() => expect(screenshotBodies.length).toBe(2));
        expect(screenshotBodies[1].articleHtml).toBe('<article>Scraped body</article>');
    });

    it('does NOT re-fire screenshot when AI returns null author', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: [],
            author: null,
            scrapeData: null,
        });

        const screenshotBodies = [];
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/screenshot') {
                screenshotBodies.push(JSON.parse(init.body));
            }
            return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,X' }) };
        });

        render(<PostPage selectedTag="important" />);

        // Wait for initial screenshot, then ensure no second call within a short window
        await waitFor(() => expect(screenshotBodies.length).toBeGreaterThanOrEqual(1));
        // Brief extra wait to catch any spurious second call
        await new Promise(r => setTimeout(r, 100));
        expect(screenshotBodies.length).toBe(1);
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
        window.history.replaceState(null, '', window.location.pathname);
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
        // A clean (first-try) generation shows no retry notice
        expect(screen.queryByTestId('ai-retry-notice')).toBeNull();
    });

    it('shows a floating notice to check logs when Venice needed blank-image retries', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        globalThis.fetch = vi.fn().mockImplementation(async (url) => {
            if (url === '/api/venice/generate-image') {
                return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,AID', attempts: 3, blankCount: 2 }) };
            }
            return { ok: true, json: async () => ({ imageData: null }) };
        });

        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/quote/i);
        await switchToImages();
        await userEvent.click(screen.getByTestId('image-option-ai'));

        const notice = await screen.findByTestId('ai-retry-notice');
        expect(notice).toHaveTextContent(/2 blank images/i);
        expect(notice).toHaveTextContent(/logs/i);
    });

    it('AI image prompt includes the Venice-provided imageContext as scene context', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: ['P1'],
            author: null,
            scrapeData: null,
            imageContext: 'a house held up by a golden Bitcoin pillar',
        });
        let generateCallBody = null;
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/venice/generate-image') {
                generateCallBody = JSON.parse(init.body);
                return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,AIDATA' }) };
            }
            return { ok: true, json: async () => ({ imageData: null }) };
        });

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(generateProposals).toHaveBeenCalled());
        await switchToImages();

        await userEvent.click(screen.getByTestId('image-option-ai'));

        await waitFor(() => expect(generateCallBody).toBeTruthy());
        expect(generateCallBody.prompt).toContain('a house held up by a golden Bitcoin pillar');
    });

    it('image context is editable and the edited value is sent in the AI image prompt', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        generateProposals.mockResolvedValueOnce({
            proposals: ['P1'],
            author: null,
            scrapeData: null,
            imageContext: 'a house held up by a golden Bitcoin pillar',
        });
        let generateCallBody = null;
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/venice/generate-image') {
                generateCallBody = JSON.parse(init.body);
                return { ok: true, json: async () => ({ imageData: 'data:image/png;base64,AIDATA' }) };
            }
            return { ok: true, json: async () => ({ imageData: null }) };
        });

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(generateProposals).toHaveBeenCalled());
        await switchToImages();

        // Field is pre-filled with the Venice-provided context and editable
        const contextInput = screen.getByLabelText(/image context/i);
        await waitFor(() => expect(contextInput.value).toBe('a house held up by a golden Bitcoin pillar'));
        await userEvent.clear(contextInput);
        await userEvent.type(contextInput, 'two robots shaking hands over a ledger');

        await userEvent.click(screen.getByTestId('image-option-ai'));

        await waitFor(() => expect(generateCallBody).toBeTruthy());
        expect(generateCallBody.prompt).toContain('two robots shaking hands over a ledger');
        expect(generateCallBody.prompt).not.toContain('golden Bitcoin pillar');
    });

    it('AI image prompt falls back to the article title for scene context when no imageContext exists', async () => {
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
        await screen.findByLabelText(/quote/i);
        await switchToImages();

        await userEvent.click(screen.getByTestId('image-option-ai'));

        await waitFor(() => expect(generateCallBody).toBeTruthy());
        expect(generateCallBody.prompt).toContain('Article One');
    });

    it('offers a Regenerate control once an AI image exists, re-requesting with the latest context', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        let callCount = 0;
        let lastBody = null;
        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url === '/api/venice/generate-image') {
                callCount += 1;
                lastBody = JSON.parse(init.body);
                return { ok: true, json: async () => ({ imageData: `data:image/png;base64,AID${callCount}` }) };
            }
            return { ok: true, json: async () => ({ imageData: null }) };
        });

        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/quote/i);
        await switchToImages();

        const aiCard = screen.getByTestId('image-option-ai');
        // No regenerate control on the AI card before any image exists
        expect(within(aiCard).queryByRole('button', { name: /regenerate/i })).toBeNull();

        // First generation via the empty AI card
        await userEvent.click(aiCard);
        await waitFor(() => expect(callCount).toBe(1));

        // Regenerate control now available; editing context then regenerating
        // re-requests with the updated scene.
        const regenBtn = await within(aiCard).findByRole('button', { name: /regenerate/i });
        const contextInput = screen.getByLabelText(/image context/i);
        await userEvent.clear(contextInput);
        await userEvent.type(contextInput, 'a totally new scene');
        await userEvent.click(regenBtn);

        await waitFor(() => expect(callCount).toBe(2));
        expect(lastBody.prompt).toContain('a totally new scene');
        // AI option stays selected after regenerating
        expect(screen.getByTestId('image-option-ai').className).toMatch(/(ring|border-blue)/);
    });

    it('keeps the AI Regenerate control reachable — hovering it does not open the enlarged preview', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(async (url) => {
            if (url === '/api/venice/generate-image') {
                callCount += 1;
                return { ok: true, json: async () => ({ imageData: `data:image/png;base64,AID${callCount}` }) };
            }
            return { ok: true, json: async () => ({ imageData: null }) };
        });

        render(<PostPage selectedTag="important" />);
        await screen.findByLabelText(/quote/i);
        await switchToImages();

        const aiCard = screen.getByTestId('image-option-ai');
        await userEvent.click(aiCard);
        await waitFor(() => expect(callCount).toBe(1));
        const regenBtn = await within(aiCard).findByRole('button', { name: /regenerate/i });

        // Hovering the control must NOT open the fullscreen preview that would cover it.
        await userEvent.hover(regenBtn);
        expect(screen.queryByTestId('image-preview-overlay')).not.toBeInTheDocument();

        // Hovering the image itself still enlarges it (feature preserved).
        await userEvent.hover(aiCard.querySelector('img'));
        await screen.findByTestId('image-preview-overlay');

        // The control is still clickable to regenerate.
        await userEvent.click(regenBtn);
        await waitFor(() => expect(callCount).toBe(2));
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

    it('shows fixed-position enlarged preview overlay when an image card is hovered', async () => {
        const articlesWithCover = [{ ...mockArticles[0], cover: 'https://img.com/cover.jpg' }];
        fetchTaggedItems.mockResolvedValueOnce(articlesWithCover);
        render(<PostPage selectedTag="important" />);
        await switchToImages();

        expect(screen.queryByTestId('image-preview-overlay')).not.toBeInTheDocument();

        const coverCard = screen.getByTestId('image-option-cover');
        await userEvent.hover(coverCard.querySelector('img'));

        const overlay = await screen.findByTestId('image-preview-overlay');
        const img = overlay.querySelector('img');
        expect(img.getAttribute('src')).toBe('https://img.com/cover.jpg');
    });

    it('updates preview overlay when hover moves between cards without closing first', async () => {
        const articlesWithCover = [{ ...mockArticles[0], cover: 'https://img.com/cover.jpg' }];
        fetchTaggedItems.mockResolvedValueOnce(articlesWithCover);
        render(<PostPage selectedTag="important" />);
        await switchToImages();

        await waitFor(() => {
            const card = screen.getByTestId('image-option-screenshot');
            expect(card.querySelector('img')).toBeTruthy();
        });

        await userEvent.hover(screen.getByTestId('image-option-cover').querySelector('img'));
        let overlay = await screen.findByTestId('image-preview-overlay');
        expect(overlay.querySelector('img').getAttribute('src')).toBe('https://img.com/cover.jpg');

        // Move hover directly to screenshot card — overlay should update, not disappear
        await userEvent.hover(screen.getByTestId('image-option-screenshot').querySelector('img'));
        overlay = screen.getByTestId('image-preview-overlay');
        expect(overlay.querySelector('img').getAttribute('src')).toContain('SCREENSHOTDATA');
    });

    it('hides preview overlay when leaving all cards', async () => {
        const articlesWithCover = [{ ...mockArticles[0], cover: 'https://img.com/cover.jpg' }];
        fetchTaggedItems.mockResolvedValueOnce(articlesWithCover);
        render(<PostPage selectedTag="important" />);
        await switchToImages();

        const coverImg = screen.getByTestId('image-option-cover').querySelector('img');
        await userEvent.hover(coverImg);
        await screen.findByTestId('image-preview-overlay');

        await userEvent.unhover(coverImg);
        await waitFor(() => expect(screen.queryByTestId('image-preview-overlay')).not.toBeInTheDocument());
    });

    it('preview overlay has pointer-events-none so cursor can reach cards underneath', async () => {
        const articlesWithCover = [{ ...mockArticles[0], cover: 'https://img.com/cover.jpg' }];
        fetchTaggedItems.mockResolvedValueOnce(articlesWithCover);
        render(<PostPage selectedTag="important" />);
        await switchToImages();

        await userEvent.hover(screen.getByTestId('image-option-cover').querySelector('img'));
        const overlay = await screen.findByTestId('image-preview-overlay');
        expect(overlay.className).toMatch(/pointer-events-none/);
    });

});

describe('PostPage — publishing + overlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        window.history.replaceState(null, '', window.location.pathname);
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

    it('keeps publish buttons enabled when screenshot is still loading but a different image option is selected', async () => {
        // Screenshot fetch never resolves — simulates a stuck Puppeteer / dismissPopups timeout.
        let resolveScreenshot;
        const screenshotPromise = new Promise(resolve => { resolveScreenshot = resolve; });
        globalThis.fetch = vi.fn().mockImplementation((url) => {
            if (url === '/api/screenshot') return screenshotPromise;
            return Promise.resolve({ ok: true, json: async () => ({ imageData: null }) });
        });

        const articlesWithCover = [{ ...mockArticles[0], cover: 'https://img.com/cover.jpg' }];
        fetchTaggedItems.mockResolvedValueOnce(articlesWithCover);
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });

        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'Hello');

        // While screenshot is in flight, switch the selected image to Cover.
        const coverCard = await screen.findByTestId('image-option-cover');
        await userEvent.click(coverCard);

        // Drafts must be enabled even though isCapturing is still true.
        const draftsBtn = screen.getByRole('button', { name: /drafts/i });
        expect(draftsBtn).toBeEnabled();

        // Don't leave the promise dangling — resolve so React can clean up.
        resolveScreenshot({ ok: true, json: async () => ({ imageData: null }) });
    });

    it('keeps publish buttons disabled when screenshot is still loading and screenshot is the selected image', async () => {
        let resolveScreenshot;
        const screenshotPromise = new Promise(resolve => { resolveScreenshot = resolve; });
        globalThis.fetch = vi.fn().mockImplementation((url) => {
            if (url === '/api/screenshot') return screenshotPromise;
            return Promise.resolve({ ok: true, json: async () => ({ imageData: null }) });
        });

        fetchTaggedItems.mockResolvedValueOnce(mockArticles);
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });

        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'Hello');

        // Default selectedImageOption is 'screenshot' — which is still loading.
        const draftsBtn = screen.getByRole('button', { name: /drafts/i });
        expect(draftsBtn).toBeDisabled();

        resolveScreenshot({ ok: true, json: async () => ({ imageData: null }) });
    });

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

    it('constructs full text without attribution even when no image is selected', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        const articleWithAuthor = [{ ...mockArticles[0] }];
        fetchTaggedItems.mockResolvedValueOnce(articleWithAuthor);
        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'Check this out');
 
        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));
 
        await waitFor(() => expect(publishPost).toHaveBeenCalled());
        const [fullText] = publishPost.mock.calls[0];
        // Strictly post + URL
        expect(fullText).toBe('Check this out\n\nhttps://example.com/1');
        expect(fullText).not.toContain('via');
        expect(fullText).not.toContain('Says');
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

    it('dismissing the success overlay re-fetches articles and advances the queue', async () => {
        saveSettings({
            ...loadSettings(),
            selectedTag: 'important',
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        // First load returns all three articles; after dismiss, re-fetch returns only two (first was posted)
        fetchTaggedItems
            .mockResolvedValueOnce(mockArticles)
            .mockResolvedValueOnce([mockArticles[1], mockArticles[2]]);

        render(<PostPage selectedTag="important" />);
        await waitFor(() => expect(screen.getByText('Article One')).toBeInTheDocument());
        const textarea = screen.getByLabelText(/^post$/i);
        await userEvent.type(textarea, 'X');

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        const dismissBtn = await screen.findByRole('button', { name: /dismiss/i });
        await userEvent.click(dismissBtn);

        // Overlay dismissed
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        // Queue re-fetched — now shows article two as the first item
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

    it('dismissing a success overlay reloads the articles list at the same queue position', async () => {
        saveSettings({
            ...loadSettings(),
            selectedTag: 'important',
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValue(mockArticles);

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        const initialFetches = fetchTaggedItems.mock.calls.length;

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));
        const dismissBtn = await screen.findByRole('button', { name: /dismiss/i });
        await userEvent.click(dismissBtn);

        await waitFor(() => {
            expect(fetchTaggedItems.mock.calls.length).toBe(initialFetches + 1);
        });
    });

    it('does NOT reload articles when dismissing an error overlay', async () => {
        saveSettings({
            ...loadSettings(),
            bufferChannels: [{ id: 'c1', service: 'linkedin' }],
        });
        fetchTaggedItems.mockResolvedValue(mockArticles);
        publishPost.mockRejectedValueOnce(new Error('boom'));

        render(<PostPage selectedTag="important" />);
        await fillPostAndSwitchToImages();

        const initialFetches = fetchTaggedItems.mock.calls.length;

        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));
        const dismissBtn = await screen.findByRole('button', { name: /dismiss/i });
        await userEvent.click(dismissBtn);

        // Wait a beat to let any erroneous reload fire
        await new Promise(r => setTimeout(r, 30));
        expect(fetchTaggedItems.mock.calls.length).toBe(initialFetches);
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

// Settings arrive as props from the server (via App); localStorage is per-origin
// and must not be authoritative — accessing the app through a reverse proxy is a
// different origin with empty localStorage (2026-07-03 nginx queue bug).
describe('PostPage — server-backed settings & empty-tag state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        window.history.replaceState(null, '', window.location.pathname);
        generateProposals.mockResolvedValue({ proposals: [], author: null, scrapeData: null });
        updateBookmarkTags.mockResolvedValue(true);
        publishPost.mockResolvedValue({ success: true, url: 'https://buffer.com/abc' });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ imageData: null }),
        });
    });

    it('shows an explicit no-tag state (not eternal loading) when selectedTag is empty', async () => {
        render(<PostPage selectedTag="" />);

        expect(await screen.findByText(/no tag selected/i)).toBeInTheDocument();
        // A way out: link to Setup where the tag is chosen
        expect(screen.getByRole('link', { name: /setup/i })).toHaveAttribute('href', '/setup');
        // The old failure mode: stuck on the loading spinner with no fetch in flight
        expect(screen.queryByText(/loading articles/i)).not.toBeInTheDocument();
        expect(fetchTaggedItems).not.toHaveBeenCalled();
    });

    it('generates proposals with the postingObjectives prop even when localStorage is empty', async () => {
        fetchTaggedItems.mockResolvedValueOnce(mockArticles);

        render(<PostPage selectedTag="important" postingObjectives="Speak like a pirate" />);

        await waitFor(() => expect(generateProposals).toHaveBeenCalled());
        expect(generateProposals.mock.calls[0][1]).toBe('Speak like a pirate');
    });

    it('retags the bookmark <tag>_posted after publish using the selectedTag prop, not localStorage', async () => {
        const article = { ...mockArticles[0], tags: ['important', 'keep'] };
        fetchTaggedItems.mockResolvedValueOnce([article]);

        render(<PostPage selectedTag="important" />);
        const textarea = await screen.findByLabelText(/^post$/i);
        await userEvent.type(textarea, 'Hello');
        await userEvent.click(screen.getByRole('button', { name: /drafts/i }));

        // localStorage is empty — the prop must drive the rename or bookmarks
        // silently stay in the queue after publishing (the worse half of the bug).
        await waitFor(() =>
            expect(updateBookmarkTags).toHaveBeenCalledWith(1, ['keep', 'important_posted']));
    });
});
