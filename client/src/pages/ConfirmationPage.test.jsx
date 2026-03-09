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

    it('renders the article URL', () => {
        render(<ConfirmationPage {...defaultProps} />);
        expect(screen.getByText(/https:\/\/example.com\/hooks/)).toBeInTheDocument();
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

        const button = await screen.findByRole('button', { name: /Save to Buffer Drafts/i });
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

        const button = await screen.findByRole('button', { name: /Save to Buffer Drafts/i });
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

        const button = await screen.findByRole('button', { name: /Save to Buffer Drafts/i });
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
});
