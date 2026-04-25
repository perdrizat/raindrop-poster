import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PublishOverlay from './PublishOverlay';

describe('PublishOverlay', () => {
    it('renders success message', () => {
        render(<PublishOverlay type="success" message="Post Published!" onDismiss={() => { }} />);
        expect(screen.getByText(/post published/i)).toBeInTheDocument();
    });

    it('renders error message', () => {
        render(<PublishOverlay type="error" message="Failed to publish" onDismiss={() => { }} />);
        expect(screen.getByText(/failed to publish/i)).toBeInTheDocument();
    });

    it('renders a link when url is provided', () => {
        render(
            <PublishOverlay
                type="success"
                message="Post Published!"
                url="https://buffer.com/post/123"
                onDismiss={() => { }}
            />
        );
        const link = screen.getByRole('link', { name: /view on buffer/i });
        expect(link).toHaveAttribute('href', 'https://buffer.com/post/123');
    });

    it('renders partial errors when provided', () => {
        render(
            <PublishOverlay
                type="success"
                message="Post Published!"
                partialErrors={['Bluesky: rejected', 'Mastodon: timeout']}
                onDismiss={() => { }}
            />
        );
        expect(screen.getByText(/some channels failed/i)).toBeInTheDocument();
        expect(screen.getByText(/bluesky: rejected/i)).toBeInTheDocument();
        expect(screen.getByText(/mastodon: timeout/i)).toBeInTheDocument();
    });

    it('renders tag warning when provided', () => {
        render(
            <PublishOverlay
                type="success"
                message="Post Published!"
                tagWarning="Could not update tags"
                onDismiss={() => { }}
            />
        );
        expect(screen.getByText(/could not update tags/i)).toBeInTheDocument();
    });

    it('calls onDismiss when Dismiss is clicked', async () => {
        const onDismiss = vi.fn();
        render(<PublishOverlay type="success" message="Post Published!" onDismiss={onDismiss} />);
        await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
        expect(onDismiss).toHaveBeenCalledOnce();
    });

    it('never renders a Next Post button', () => {
        render(<PublishOverlay type="success" message="Post Published!" onDismiss={() => { }} />);
        expect(screen.queryByRole('button', { name: /next post/i })).not.toBeInTheDocument();
    });

    it('positions overlay fixed in top-right corner', () => {
        const { container } = render(
            <PublishOverlay type="success" message="Post Published!" onDismiss={() => { }} />
        );
        const overlay = container.firstChild;
        expect(overlay.className).toMatch(/fixed/);
        expect(overlay.className).toMatch(/top-4/);
        expect(overlay.className).toMatch(/right-4/);
    });
});
