import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConfirmationPage from './ConfirmationPage';
import { publishPost } from '../services/publishService';
import { loadSettings } from '../services/settingsService';
import { updateBookmarkTags } from '../services/raindropioService';
import { resizeImage } from '../utils/imageUtils';

vi.mock('../services/settingsService', () => ({
    loadSettings: vi.fn()
}));

vi.mock('../services/publishService', () => ({
    publishPost: vi.fn()
}));

vi.mock('../services/raindropioService', () => ({
    updateBookmarkTags: vi.fn()
}));

vi.mock('../utils/imageUtils', () => ({
    resizeImage: vi.fn((dataUrl) => Promise.resolve(dataUrl))
}));

describe('ConfirmationPage', () => {
    const defaultProps = {
        proposal: "This is my generated post proposal that I want to publish.",
        article: {
            _id: 12345,
            title: "Testing React Hooks",
            link: "https://example.com/hooks",
            tags: ["to-tweet", "react", "hooks"]
        },
        selectedHighlight: "Important quote text",
        onBack: vi.fn(),
        onNextPost: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        loadSettings.mockReturnValue({ publishDestination: 'buffer', bufferChannels: ['linkedin-1'], selectedTag: 'to-tweet' });
        updateBookmarkTags.mockResolvedValue(true);

        // Mock fetch for screenshot and AI image generation
        globalThis.fetch = vi.fn().mockImplementation((url) => {
            if (url === '/api/screenshot') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ imageData: 'data:image/png;base64,fakescreenshot' }),
                });
            }
            if (url === '/api/venice/generate-image') {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ imageData: 'data:image/png;base64,fakeaiimage' }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });
    });

    it('renders the selected proposal as editable post content', () => {
        render(<ConfirmationPage {...defaultProps} />);
        const textarea = screen.getByPlaceholderText(/Post content/i);
        expect(textarea.value).toBe("This is my generated post proposal that I want to publish.");
    });

    it('renders the article URL as a clickable link that opens in a new tab', () => {
        render(<ConfirmationPage {...defaultProps} />);
        const link = screen.getByRole('link', { name: /https:\/\/example.com\/hooks/ });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', 'https://example.com/hooks');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });

    it('shows screenshot loading state initially', () => {
        render(<ConfirmationPage {...defaultProps} />);
        const screenshotCard = screen.getByTestId('image-option-screenshot');
        expect(screenshotCard.textContent).toMatch(/Loading/i);
    });

    it('calls publishPost when the post button is clicked', async () => {
        publishPost.mockResolvedValueOnce({ success: true, url: "https://buffer.com/update/1" });

        render(<ConfirmationPage {...defaultProps} />);

        // Wait for screenshot to load
        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        const button = await screen.findByRole('button', { name: /^Drafts$/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(publishPost).toHaveBeenCalledWith(
                expect.stringContaining("This is my generated post proposal"),
                'https://example.com/hooks',
                { imageData: 'data:image/png;base64,fakescreenshot', coverUrl: null },
                'buffer',
                ['linkedin-1'],
                'draft'
            );
        });

        await waitFor(() => {
            expect(screen.getByText(/View on Buffer/i)).toBeInTheDocument();
        });
    });

    it('updates bookmark tags on successful publish and shows next post button', async () => {
        publishPost.mockResolvedValueOnce({ success: true, url: "https://buffer.com/update/1" });

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        const button = await screen.findByRole('button', { name: /^Drafts$/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText(/Post Published!/i)).toBeInTheDocument();
        });

        expect(updateBookmarkTags).toHaveBeenCalledWith(12345, ["react", "hooks", "to-tweet_posted"]);

        const nextBtn = screen.getByRole('button', { name: /Publish next post/i });
        fireEvent.click(nextBtn);
        expect(defaultProps.onNextPost).toHaveBeenCalled();
    });

    it('shows a warning message if updating bookmark tags fails after successful publish', async () => {
        publishPost.mockResolvedValueOnce({ success: true, url: "https://buffer.com/update/1" });
        updateBookmarkTags.mockResolvedValueOnce(false);

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        const button = await screen.findByRole('button', { name: /^Drafts$/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText(/Warning: Could not update tags in Raindrop.io/i)).toBeInTheDocument();
        });
    });

    it('sends articleHtml in screenshot request when scrapeData is available', async () => {
        const articleWithScrapeData = {
            ...defaultProps.article,
            highlight: 'Some quote',
            scrapeData: { markdown: '# Article', html: '<h1>Article</h1><p>Content</p>' }
        };

        render(<ConfirmationPage {...defaultProps} article={articleWithScrapeData} />);

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/screenshot', expect.objectContaining({
                body: expect.stringContaining('"articleHtml":"<h1>Article</h1><p>Content</p>"')
            }));
        });
    });

    it('allows editing the quote and triggers a new screenshot capture on regenerate click', async () => {
        render(<ConfirmationPage {...defaultProps} article={{ ...defaultProps.article, highlight: 'Initial quote' }} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        expect(globalThis.fetch).toHaveBeenCalledWith('/api/screenshot', expect.objectContaining({
            body: expect.stringContaining('Initial quote')
        }));

        const quoteTextarea = screen.getByLabelText(/Quote \(Highlight\)/i);
        expect(quoteTextarea.value).toBe('Initial quote');

        fireEvent.change(quoteTextarea, { target: { value: 'Updated quote text' } });
        fireEvent.blur(quoteTextarea);

        const regenerateBtn = screen.getByRole('button', { name: /Regenerate Screenshot/i });
        fireEvent.click(regenerateBtn);

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/screenshot', expect.objectContaining({
                body: expect.stringContaining('Updated quote text')
            }));
        });
    });

    it('allows uploading a custom screenshot via file selection (local base64, no server upload)', async () => {
        // Mock FileReader for jsdom
        const origFileReader = globalThis.FileReader;
        globalThis.FileReader = class {
            readAsDataURL() {
                setTimeout(() => this.onload?.(), 0);
            }
            result = 'data:image/png;base64,customupload';
        };

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            const screenshotCard = screen.getByTestId('image-option-screenshot');
            expect(screenshotCard.textContent).not.toMatch(/Loading/i);
        });

        const fileInput = screen.getByLabelText(/Upload Custom Image/i);
        const file = new File(['mock-image-data'], 'custom.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        // Should NOT call any upload endpoint — image stays local as base64
        await waitFor(() => {
            const img = screen.getByAltText('Custom');
            expect(img.src).toContain('data:image/png;base64,customupload');
        });

        // Verify no upload calls were made (only screenshot + AI generation)
        const uploadCalls = globalThis.fetch.mock.calls.filter(
            ([url]) => url !== '/api/screenshot' && url !== '/api/venice/generate-image'
        );
        expect(uploadCalls).toHaveLength(0);

        globalThis.FileReader = origFileReader;
    });

    it('renders all four submit buttons with correct labels', async () => {
        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        expect(screen.getByRole('button', { name: /^Now$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Prioritize$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Next Available$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Drafts$/i })).toBeInTheDocument();
        expect(screen.getByText(/Save to Buffer:/i)).toBeInTheDocument();
    });

    it('passes correct bufferMode for each submit button', async () => {
        const modes = [
            { label: /^Now$/i, mode: 'now' },
            { label: /^Prioritize$/i, mode: 'prioritize' },
            { label: /^Next Available$/i, mode: 'next' },
            { label: /^Drafts$/i, mode: 'draft' },
        ];

        for (const { label, mode } of modes) {
            vi.clearAllMocks();
            loadSettings.mockReturnValue({ publishDestination: 'buffer', bufferChannels: ['ch1'], selectedTag: 'to-tweet' });
            updateBookmarkTags.mockResolvedValue(true);
            globalThis.fetch = vi.fn().mockImplementation((url) => {
                if (url === '/api/screenshot') {
                    return Promise.resolve({ ok: true, json: async () => ({ imageData: 'data:image/png;base64,fakescreenshot' }) });
                }
                if (url === '/api/venice/generate-image') {
                    return Promise.resolve({ ok: true, json: async () => ({ imageData: 'data:image/png;base64,fakeaiimage' }) });
                }
                return Promise.resolve({ ok: true, json: async () => ({}) });
            });
            publishPost.mockResolvedValueOnce({ success: true, url: 'https://buffer.com/update/1' });

            const { unmount } = render(<ConfirmationPage {...defaultProps} />);

            await waitFor(() => {
                expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
            });

            fireEvent.click(screen.getByRole('button', { name: label }));

            await waitFor(() => {
                expect(publishPost).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.any(String),
                    expect.objectContaining({}),
                    'buffer',
                    ['ch1'],
                    mode
                );
            });

            unmount();
        }
    });

    it('clears spinner after image upload fails (no infinite hang)', async () => {
        // Mock FileReader to fail
        const origFileReader = globalThis.FileReader;
        globalThis.FileReader = class {
            readAsDataURL() {
                setTimeout(() => this.onerror?.(new Error('Read failed')), 0);
            }
        };

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        // Trigger upload via the file input (same code path as paste)
        const fileInput = screen.getByLabelText(/Upload Custom Image/i);
        const file = new File(['img'], 'test.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        // Spinner should appear then disappear — the old bug left it spinning forever
        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });
        expect(screen.getByText(/Failed to read file/i)).toBeInTheDocument();

        globalThis.FileReader = origFileReader;
    });

    // --- Image Selection 2x2 Grid Tests ---

    it('renders four image option cards in a 2x2 grid', async () => {
        render(<ConfirmationPage {...defaultProps} article={{ ...defaultProps.article, cover: 'https://example.com/cover.jpg' }} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-cover')).toBeInTheDocument();
            expect(screen.getByTestId('image-option-screenshot')).toBeInTheDocument();
            expect(screen.getByTestId('image-option-ai')).toBeInTheDocument();
            expect(screen.getByTestId('image-option-custom')).toBeInTheDocument();
        });
    });

    it('shows cover image when article.cover is available', async () => {
        render(<ConfirmationPage {...defaultProps} article={{ ...defaultProps.article, cover: 'https://example.com/cover.jpg' }} />);

        await waitFor(() => {
            const coverImg = screen.getByAltText('Cover');
            expect(coverImg.src).toBe('https://example.com/cover.jpg');
        });
    });

    it('shows "No cover available" when article.cover is missing', async () => {
        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByText(/No cover available/i)).toBeInTheDocument();
        });
    });

    it('selects screenshot option by default and shows selected ring', async () => {
        render(<ConfirmationPage {...defaultProps} article={{ ...defaultProps.article, cover: 'https://example.com/cover.jpg' }} />);

        await waitFor(() => {
            const screenshotCard = screen.getByTestId('image-option-screenshot');
            expect(screenshotCard.className).toMatch(/ring-blue/);
        });
    });

    it('clicking AI image card selects it', async () => {
        render(<ConfirmationPage {...defaultProps} article={{ ...defaultProps.article, cover: 'https://example.com/cover.jpg' }} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-ai')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('image-option-ai'));

        expect(screen.getByTestId('image-option-ai').className).toMatch(/ring-blue/);
        expect(screen.getByTestId('image-option-screenshot').className).not.toMatch(/ring-blue/);
    });

    it('publishes with coverUrl when cover option is selected', async () => {
        publishPost.mockResolvedValueOnce({ success: true, url: 'https://buffer.com/1' });

        render(<ConfirmationPage {...defaultProps} article={{ ...defaultProps.article, cover: 'https://example.com/cover.jpg' }} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-cover')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('image-option-cover'));
        fireEvent.click(screen.getByRole('button', { name: /^Drafts$/i }));

        await waitFor(() => {
            expect(publishPost).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                { imageData: null, coverUrl: 'https://example.com/cover.jpg' },
                'buffer',
                ['linkedin-1'],
                'draft'
            );
        });
    });

    it('publishes with AI imageData when AI option is selected', async () => {
        publishPost.mockResolvedValueOnce({ success: true, url: 'https://buffer.com/1' });

        render(<ConfirmationPage {...defaultProps} />);

        // Click AI card to trigger on-demand generation
        fireEvent.click(screen.getByTestId('image-option-ai'));

        // Wait for AI image to load
        await waitFor(() => {
            const aiImg = screen.getByAltText('AI Generated');
            expect(aiImg).toBeInTheDocument();
        });

        // Wait for screenshot to finish too (unblocks publish)
        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        fireEvent.click(screen.getByRole('button', { name: /^Drafts$/i }));

        await waitFor(() => {
            expect(publishPost).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                { imageData: 'data:image/png;base64,fakeaiimage', coverUrl: null },
                'buffer',
                ['linkedin-1'],
                'draft'
            );
        });
    });

    it('publishes with custom imageData when custom image is uploaded', async () => {
        publishPost.mockResolvedValueOnce({ success: true, url: 'https://buffer.com/1' });

        const origFileReader = globalThis.FileReader;
        globalThis.FileReader = class {
            readAsDataURL() {
                setTimeout(() => this.onload?.(), 0);
            }
            result = 'data:image/png;base64,customupload';
        };

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-custom')).toBeInTheDocument();
        });

        const fileInput = screen.getByLabelText(/Upload Custom Image/i);
        const file = new File(['img'], 'test.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => {
            const customImg = screen.getByAltText('Custom');
            expect(customImg).toBeInTheDocument();
        });

        // Custom should be auto-selected
        expect(screen.getByTestId('image-option-custom').className).toMatch(/ring-blue/);

        fireEvent.click(screen.getByRole('button', { name: /^Drafts$/i }));

        await waitFor(() => {
            expect(publishPost).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                { imageData: 'data:image/png;base64,customupload', coverUrl: null },
                'buffer',
                ['linkedin-1'],
                'draft'
            );
        });

        globalThis.FileReader = origFileReader;
    });

    it('calls resizeImage when uploading a custom image', async () => {
        const origFileReader = globalThis.FileReader;
        globalThis.FileReader = class {
            readAsDataURL() {
                setTimeout(() => this.onload?.(), 0);
            }
            result = 'data:image/png;base64,largeimage';
        };

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-custom')).toBeInTheDocument();
        });

        const fileInput = screen.getByLabelText(/Upload Custom Image/i);
        const file = new File(['img'], 'big.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => {
            expect(resizeImage).toHaveBeenCalledWith('data:image/png;base64,largeimage');
        });

        globalThis.FileReader = origFileReader;
    });

    it('shows error and retry on AI card when AI generation fails', async () => {
        globalThis.fetch = vi.fn().mockImplementation((url) => {
            if (url === '/api/screenshot') {
                return Promise.resolve({ ok: true, json: async () => ({ imageData: 'data:image/png;base64,ss' }) });
            }
            if (url === '/api/venice/generate-image') {
                return Promise.resolve({ ok: false, json: async () => ({ error: 'AI failed' }) });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        render(<ConfirmationPage {...defaultProps} />);

        // Click AI card to trigger on-demand generation
        fireEvent.click(screen.getByTestId('image-option-ai'));

        await waitFor(() => {
            const aiCard = screen.getByTestId('image-option-ai');
            expect(aiCard.textContent).toMatch(/could not generate/i);
        });

        // Retry button should be present
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('all four cards have square aspect ratio (no layout shift)', () => {
        render(<ConfirmationPage {...defaultProps} />);

        const cards = [
            screen.getByTestId('image-option-cover'),
            screen.getByTestId('image-option-screenshot'),
            screen.getByTestId('image-option-ai'),
            screen.getByTestId('image-option-custom'),
        ];

        cards.forEach(card => {
            expect(card.className).toMatch(/aspect-square/);
        });
    });

    // --- Lazy AI Image Generation Tests ---

    it('does not call Venice API on mount', async () => {
        render(<ConfirmationPage {...defaultProps} />);

        // Wait for screenshot to finish (which does auto-fire on mount)
        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        // Venice API should NOT have been called
        const veniceCalls = globalThis.fetch.mock.calls.filter(([url]) => url === '/api/venice/generate-image');
        expect(veniceCalls).toHaveLength(0);
    });

    it('AI card shows "Click to generate" placeholder initially', () => {
        render(<ConfirmationPage {...defaultProps} />);

        const aiCard = screen.getByTestId('image-option-ai');
        expect(aiCard.textContent).toMatch(/Click to generate/i);
    });

    it('clicking AI card triggers generation, shows spinner, then image', async () => {
        render(<ConfirmationPage {...defaultProps} />);

        // AI card should show placeholder
        const aiCard = screen.getByTestId('image-option-ai');
        expect(aiCard.textContent).toMatch(/Click to generate/i);

        // Click to trigger generation
        fireEvent.click(aiCard);

        // Should show spinner
        await waitFor(() => {
            expect(screen.getByTestId('image-option-ai').textContent).toMatch(/Loading/i);
        });

        // Should resolve to generated image
        await waitFor(() => {
            const aiImg = screen.getByAltText('AI Generated');
            expect(aiImg.src).toContain('data:image/png;base64,fakeaiimage');
        });
    });

    it('clicking AI card auto-selects the AI option', async () => {
        render(<ConfirmationPage {...defaultProps} />);

        // Screenshot is selected by default
        expect(screen.getByTestId('image-option-screenshot').className).toMatch(/ring-blue/);

        // Click AI card
        fireEvent.click(screen.getByTestId('image-option-ai'));

        // AI should now be selected
        expect(screen.getByTestId('image-option-ai').className).toMatch(/ring-blue/);
        expect(screen.getByTestId('image-option-screenshot').className).not.toMatch(/ring-blue/);
    });

    it('publish buttons are not blocked when AI generation has not been triggered', async () => {
        render(<ConfirmationPage {...defaultProps} />);

        // Wait for screenshot to load
        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        // Publish buttons should be enabled even though AI image was never generated
        const draftsBtn = screen.getByRole('button', { name: /^Drafts$/i });
        expect(draftsBtn).not.toBeDisabled();
    });

    it('custom card shows "Paste or upload" placeholder initially', () => {
        render(<ConfirmationPage {...defaultProps} />);

        const customCard = screen.getByTestId('image-option-custom');
        expect(customCard.textContent).toMatch(/Paste or upload/i);
    });

    // --- Character limit warning tests ---

    it('shows Bluesky character limit warning when post text exceeds 300 chars', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [{ id: 'bsky-1', service: 'bluesky', name: 'my-handle' }],
            selectedTag: 'to-tweet',
        });

        const longProposal = 'A'.repeat(301);
        render(<ConfirmationPage {...defaultProps} proposal={longProposal} />);

        await waitFor(() => {
            expect(screen.getByText(/exceeds Bluesky.*300/i)).toBeInTheDocument();
        });
    });

    it('shows Mastodon character limit warning when post text exceeds 500 chars', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [{ id: 'masto-1', service: 'mastodon', name: 'my-instance' }],
            selectedTag: 'to-tweet',
        });

        const longProposal = 'A'.repeat(501);
        render(<ConfirmationPage {...defaultProps} proposal={longProposal} />);

        await waitFor(() => {
            expect(screen.getByText(/exceeds Mastodon.*500/i)).toBeInTheDocument();
        });
    });

    it('shows both warnings when both platforms are selected and text is long enough', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [
                { id: 'bsky-1', service: 'bluesky', name: 'my-handle' },
                { id: 'masto-1', service: 'mastodon', name: 'my-instance' },
            ],
            selectedTag: 'to-tweet',
        });

        const longProposal = 'A'.repeat(501);
        render(<ConfirmationPage {...defaultProps} proposal={longProposal} />);

        await waitFor(() => {
            expect(screen.getByText(/exceeds Bluesky.*300/i)).toBeInTheDocument();
            expect(screen.getByText(/exceeds Mastodon.*500/i)).toBeInTheDocument();
        });
    });

    it('disables publish buttons when post text exceeds Bluesky limit', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [{ id: 'bsky-1', service: 'bluesky', name: 'my-handle' }],
            selectedTag: 'to-tweet',
        });

        const longProposal = 'A'.repeat(301);
        render(<ConfirmationPage {...defaultProps} proposal={longProposal} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        expect(screen.getByRole('button', { name: /^Now$/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^Drafts$/i })).toBeDisabled();
    });

    it('enables publish buttons when text is edited below limit', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [{ id: 'bsky-1', service: 'bluesky', name: 'my-handle' }],
            selectedTag: 'to-tweet',
        });

        const longProposal = 'A'.repeat(301);
        render(<ConfirmationPage {...defaultProps} proposal={longProposal} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        // Buttons should be disabled
        expect(screen.getByRole('button', { name: /^Now$/i })).toBeDisabled();

        // Edit text to be within limit
        const textarea = screen.getByPlaceholderText(/Post content/i);
        fireEvent.change(textarea, { target: { value: 'Short post' } });

        // Buttons should be enabled
        expect(screen.getByRole('button', { name: /^Now$/i })).not.toBeDisabled();
    });

    it('does not show character limit warning when full text is within limits', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [
                { id: 'bsky-1', service: 'bluesky', name: 'my-handle' },
            ],
            selectedTag: 'to-tweet',
        });

        // postContent=250 + "\n\n" + "https://example.com/hooks"(27) = 279 < 300
        const shortProposal = 'A'.repeat(250);
        render(<ConfirmationPage {...defaultProps} proposal={shortProposal} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        expect(screen.queryByText(/exceeds/i)).not.toBeInTheDocument();
    });

    it('Bluesky char limit excludes article URL (275 chars text should pass)', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [{ id: 'bsky-1', service: 'bluesky', name: 'my-handle' }],
            selectedTag: 'to-tweet',
        });

        // postContent=275 chars, under 300. Bluesky counts URLs separately, so this should pass.
        const proposal = 'A'.repeat(275);
        render(<ConfirmationPage {...defaultProps} proposal={proposal} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        // Should NOT show warning — Bluesky doesn't count the URL
        expect(screen.queryByText(/exceeds Bluesky.*300/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Now$/i })).not.toBeDisabled();
    });

    it('Mastodon char limit still includes article URL', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [{ id: 'masto-1', service: 'mastodon', name: 'my-instance' }],
            selectedTag: 'to-tweet',
        });

        // postContent=475 chars, under 500. But fullText = 475 + "\n\n" + URL(27) = 504 > 500
        const proposal = 'A'.repeat(475);
        render(<ConfirmationPage {...defaultProps} proposal={proposal} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        // Should show warning — Mastodon counts everything including URLs
        expect(screen.getByText(/exceeds Mastodon.*500/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Now$/i })).toBeDisabled();
    });

    it('shows partial failure warning when publish returns partialErrors', async () => {
        publishPost.mockResolvedValueOnce({
            success: true,
            url: 'https://publish.buffer.com/all-channels',
            message: 'Published to 1 channel(s)',
            partialErrors: ['Channel bsky-1: Bluesky posts cannot exceed 300 characters.'],
        });

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        fireEvent.click(screen.getByRole('button', { name: /^Drafts$/i }));

        await waitFor(() => {
            expect(screen.getByText(/Post Published!/i)).toBeInTheDocument();
        });

        // Should show partial error warning
        expect(screen.getByText(/Bluesky posts cannot exceed 300 characters/i)).toBeInTheDocument();
    });

    it('extracts channel IDs from channel objects when publishing', async () => {
        loadSettings.mockReturnValue({
            publishDestination: 'buffer',
            bufferChannels: [{ id: 'bsky-1', service: 'bluesky', name: 'my-handle' }],
            selectedTag: 'to-tweet',
        });
        publishPost.mockResolvedValueOnce({ success: true, url: 'https://buffer.com/1' });

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        fireEvent.click(screen.getByRole('button', { name: /^Drafts$/i }));

        await waitFor(() => {
            expect(publishPost).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.any(Object),
                'buffer',
                ['bsky-1'],
                'draft'
            );
        });
    });

    it('pasting an image populates the Custom card, not the screenshot card', async () => {
        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByTestId('image-option-screenshot').textContent).not.toMatch(/Loading/i);
        });

        // Simulate paste event with an image file
        const file = new File(['img'], 'pasted.png', { type: 'image/png' });
        const pasteEvent = new Event('paste', { bubbles: true });
        Object.defineProperty(pasteEvent, 'clipboardData', {
            value: {
                items: [{
                    type: 'image/png',
                    getAsFile: () => file,
                }],
            },
        });

        // Mock FileReader
        const origFileReader = globalThis.FileReader;
        globalThis.FileReader = class {
            readAsDataURL() {
                setTimeout(() => this.onload?.(), 0);
            }
            result = 'data:image/png;base64,pastedimage';
        };

        window.dispatchEvent(pasteEvent);

        await waitFor(() => {
            const customImg = screen.getByAltText('Custom');
            expect(customImg.src).toContain('data:image/png;base64,pastedimage');
        });

        // Custom should be auto-selected
        expect(screen.getByTestId('image-option-custom').className).toMatch(/ring-blue/);

        globalThis.FileReader = origFileReader;
    });

    it('shows error on screenshot card when screenshot fails; other cards still work', async () => {
        globalThis.fetch = vi.fn().mockImplementation((url) => {
            if (url === '/api/screenshot') {
                return Promise.resolve({ ok: false, json: async () => ({ error: 'Screenshot failed' }) });
            }
            if (url === '/api/venice/generate-image') {
                return Promise.resolve({ ok: true, json: async () => ({ imageData: 'data:image/png;base64,aiok' }) });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        render(<ConfirmationPage {...defaultProps} article={{ ...defaultProps.article, cover: 'https://example.com/cover.jpg' }} />);

        // Screenshot card shows error
        await waitFor(() => {
            const ssCard = screen.getByTestId('image-option-screenshot');
            expect(ssCard.textContent).toMatch(/could not capture/i);
        });

        // AI card shows placeholder (not auto-generated)
        const aiCard = screen.getByTestId('image-option-ai');
        expect(aiCard.textContent).toMatch(/Click to generate/i);

        // Cover card still shows its image
        const coverImg = screen.getByAltText('Cover');
        expect(coverImg.src).toBe('https://example.com/cover.jpg');

        // Cover card is still selectable
        fireEvent.click(screen.getByTestId('image-option-cover'));
        expect(screen.getByTestId('image-option-cover').className).toMatch(/ring-blue/);
    });
});
