import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConfirmationPage from './ConfirmationPage';
import { publishPost } from '../services/twitterService';
import { loadSettings } from '../services/settingsService';
import { updateBookmarkTags } from '../services/raindropioService';

vi.mock('../services/settingsService', () => ({
    loadSettings: vi.fn()
}));

vi.mock('../services/twitterService', () => ({
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
        loadSettings.mockReturnValue({ publishDestination: 'twitter', selectedTag: 'to-tweet' });
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
        publishPost.mockResolvedValueOnce({ success: true, url: "https://twitter.com/post/1" });

        render(<ConfirmationPage {...defaultProps} />);

        // Wait for screenshot to load
        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
        });

        const button = await screen.findByRole('button', { name: /Post to X \(Twitter\)/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(publishPost).toHaveBeenCalledWith(
                expect.stringContaining("This is my generated post proposal"),
                'https://example.com/hooks',
                'https://i.ibb.co/abc/shot.png',
                'twitter',
                []
            );
        });

        await waitFor(() => {
            expect(screen.getByText(/View on X \(Twitter\)/i)).toBeInTheDocument();
        });
    });

    it('calls publishPost with buffer destination when set in settings', async () => {
        loadSettings.mockReturnValue({ publishDestination: 'buffer', bufferChannels: ['linkedin-1'] });

        publishPost.mockResolvedValueOnce({ success: true, url: "https://buffer.com/update/1" });

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
        });

        const button = await screen.findByRole('button', { name: /Post to Buffer/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(publishPost).toHaveBeenCalledWith(
                expect.stringContaining("This is my generated post proposal"),
                'https://example.com/hooks',
                'https://i.ibb.co/abc/shot.png',
                'buffer',
                ['linkedin-1']
            );
        });

        await waitFor(() => {
            expect(screen.getByText(/View on Buffer/i)).toBeInTheDocument();
        });
    });

    it('updates bookmark tags on successful publish and shows next post button', async () => {
        publishPost.mockResolvedValueOnce({ success: true, url: "https://twitter.com/post/1" });

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
        });

        const button = await screen.findByRole('button', { name: /Post to X \(Twitter\)/i });
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
        publishPost.mockResolvedValueOnce({ success: true, url: "https://twitter.com/post/1" });
        updateBookmarkTags.mockResolvedValueOnce(false);

        render(<ConfirmationPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.queryByText(/Capturing screenshot/i)).not.toBeInTheDocument();
        });

        const button = await screen.findByRole('button', { name: /Post to X \(Twitter\)/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText(/Warning: Could not update tags in Raindrop.io/i)).toBeInTheDocument();
        });
    });
});
