import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConfirmationPage from './ConfirmationPage';
import { publishPost } from '../services/publishService';
import { loadSettings } from '../services/settingsService';
import { updateBookmarkTags } from '../services/raindropioService';

vi.mock('../services/settingsService', () => ({
    loadSettings: vi.fn()
}));

vi.mock('../services/publishService', () => ({
    publishPost: vi.fn()
}));

vi.mock('../services/raindropioService', () => ({
    updateBookmarkTags: vi.fn()
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

        // Mock the screenshot fetch
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ screenshotUrl: 'https://i.ibb.co/abc/shot.png' }),
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
        expect(screen.getByText(/Capturing screenshot/i)).toBeInTheDocument();
    });

    it('calls publishPost when the post button is clicked', async () => {
        publishPost.mockResolvedValueOnce({ success: true, url: "https://buffer.com/update/1" });

        render(<ConfirmationPage {...defaultProps} />);

        // Wait for screenshot to load
        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
        });

        const button = await screen.findByRole('button', { name: /^Drafts$/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(publishPost).toHaveBeenCalledWith(
                expect.stringContaining("This is my generated post proposal"),
                'https://example.com/hooks',
                'https://i.ibb.co/abc/shot.png',
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
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
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
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
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
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
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

    it('allows uploading a custom screenshot via file selection and delegates to imgbb', async () => {
        // Mock successful initial screenshot first
        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
        });

        // Setup the ImgBB fetch mock specifically for the upload endpoint
        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, url: 'https://i.ibb.co/custom/uploaded.png' })
        });

        // Find the "Upload Custom Image" label/input
        const fileInput = screen.getByLabelText(/Upload Custom Image/i);

        // Simulate file upload
        const file = new File(['mock-image-data'], 'custom.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        // Wait for the imgbb upload mock to be called
        await waitFor(() => {
            // Verify fetch to /api/imgbb/upload was sent
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/imgbb/upload', expect.objectContaining({
                method: 'POST'
            }));
        });

        // Verify the image source updated in the DOM
        const img = screen.getByAltText('Quote screenshot');
        expect(img.src).toBe('https://i.ibb.co/custom/uploaded.png');
    });

    it('renders all four submit buttons with correct labels', async () => {
        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
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
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ screenshotUrl: 'https://i.ibb.co/abc/shot.png' }),
            });
            publishPost.mockResolvedValueOnce({ success: true, url: 'https://buffer.com/update/1' });

            const { unmount } = render(<ConfirmationPage {...defaultProps} />);

            await waitFor(() => {
                expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
            });

            fireEvent.click(screen.getByRole('button', { name: label }));

            await waitFor(() => {
                expect(publishPost).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.any(String),
                    expect.any(String),
                    'buffer',
                    ['ch1'],
                    mode
                );
            });

            unmount();
        }
    });

    it('clears spinner after image upload fails (no infinite hang)', async () => {
        // Mock FileReader to synchronously resolve (jsdom's FileReader is incomplete)
        const origFileReader = globalThis.FileReader;
        globalThis.FileReader = class {
            readAsDataURL() {
                setTimeout(() => this.onload?.(), 0);
            }
            result = 'data:image/png;base64,fakedata';
        };

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
        });

        // Mock imgbb upload to fail
        globalThis.fetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        // Trigger upload via the file input (same code path as paste)
        const fileInput = screen.getByLabelText(/Upload Custom Image/i);
        const file = new File(['img'], 'test.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        // Spinner should appear then disappear — the old bug left it spinning forever
        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
        });
        expect(screen.getByText(/Failed to upload custom image/i)).toBeInTheDocument();

        globalThis.FileReader = origFileReader;
    });
});
