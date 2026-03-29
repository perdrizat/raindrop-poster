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

        await waitFor(() => {
            expect(screen.getByTestId('image-option-ai')).toBeInTheDocument();
        });

        // Wait for AI image to load
        await waitFor(() => {
            const aiImg = screen.getByAltText('AI Generated');
            expect(aiImg).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('image-option-ai'));
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

    it('custom card shows "Paste or upload" placeholder initially', () => {
        render(<ConfirmationPage {...defaultProps} />);

        const customCard = screen.getByTestId('image-option-custom');
        expect(customCard.textContent).toMatch(/Paste or upload/i);
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

        // AI card still loads successfully
        await waitFor(() => {
            const aiImg = screen.getByAltText('AI Generated');
            expect(aiImg).toBeInTheDocument();
        });

        // Cover card still shows its image
        const coverImg = screen.getByAltText('Cover');
        expect(coverImg.src).toBe('https://example.com/cover.jpg');

        // Cover card is still selectable
        fireEvent.click(screen.getByTestId('image-option-cover'));
        expect(screen.getByTestId('image-option-cover').className).toMatch(/ring-blue/);
    });
});
