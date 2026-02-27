import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConfirmationPage from './ConfirmationPage';
import { selectEngagingHighlight } from '../services/aiService';
import { publishThread } from '../services/twitterService';
import { loadSettings } from '../services/settingsService';

vi.mock('../services/aiService', () => ({
    selectEngagingHighlight: vi.fn()
}));

vi.mock('../services/settingsService', () => ({
    loadSettings: vi.fn()
}));

vi.mock('../services/twitterService', () => ({
    publishThread: vi.fn()
}));

describe('ConfirmationPage', () => {
    const defaultProps = {
        proposal: "This is my generated tweet proposal that I want to publish.",
        article: {
            title: "Testing React Hooks",
            link: "https://example.com/hooks"
        },
        onBack: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        loadSettings.mockReturnValue({ publishDestination: 'twitter' });
    });

    it('renders the selected proposal as Tweet 1', () => {
        render(<ConfirmationPage {...defaultProps} />);
        expect(screen.getByText("This is my generated tweet proposal that I want to publish.")).toBeInTheDocument();
    });

    it('renders Tweet 2 with the article title if there are no highlights', () => {
        render(<ConfirmationPage {...defaultProps} />);
        expect(screen.getByText(/Testing React Hooks/)).toBeInTheDocument();
        expect(screen.getByText(/https:\/\/example.com\/hooks/)).toBeInTheDocument();
    });

    it('displays loading state and fetches the best highlight if there are multiple highlights', async () => {
        selectEngagingHighlight.mockResolvedValueOnce("Selected Highlight text");

        render(
            <ConfirmationPage
                {...defaultProps}
                article={{
                    ...defaultProps.article,
                    highlights: [{ text: "Highlight 1" }, { text: "Highlight 2" }]
                }}
                objectives="Make it engaging"
            />
        );

        // Should initially show a loading indicator for the second tweet
        expect(screen.getByText(/Loading highlight/i)).toBeInTheDocument();

        // Wait for the highlight to load
        await waitFor(() => {
            expect(selectEngagingHighlight).toHaveBeenCalledWith("Make it engaging", expect.any(Object), expect.any(Array));
        });

        // The chosen highlight should appear
        await waitFor(() => {
            expect(screen.getByText(/Selected Highlight text/)).toBeInTheDocument();
        });
    });

    it('calls publishThread when the post button is clicked', async () => {
        publishThread.mockResolvedValueOnce({ success: true, url: "https://twitter.com/post/1" });

        render(<ConfirmationPage {...defaultProps} />);

        // Wait for the UI to settle (highlight check finished)
        const button = await screen.findByRole('button', { name: /Post to X \(Twitter\)/i });
        fireEvent.click(button);

        expect(publishThread).toHaveBeenCalledWith(
            expect.stringContaining("This is my generated tweet proposal"),
            expect.stringContaining("Testing React Hooks"),
            'twitter'
        );

        // Wait for success message
        await waitFor(() => {
            expect(screen.getByText(/View on X \(Twitter\)/i)).toBeInTheDocument();
        });
    });

    it('calls publishThread with buffer destination when set in settings', async () => {
        loadSettings.mockReturnValue({ publishDestination: 'buffer' });

        publishThread.mockResolvedValueOnce({ success: true, url: "https://buffer.com/update/1" });

        render(<ConfirmationPage {...defaultProps} />);

        const button = await screen.findByRole('button', { name: /Post to Buffer/i });
        fireEvent.click(button);

        expect(publishThread).toHaveBeenCalledWith(
            expect.stringContaining("This is my generated tweet proposal"),
            expect.stringContaining("Testing React Hooks"),
            'buffer'
        );

        await waitFor(() => {
            expect(screen.getByText(/View on Buffer/i)).toBeInTheDocument();
        });
    });
});
