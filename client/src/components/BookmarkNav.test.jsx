import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookmarkNav from './BookmarkNav';

describe('BookmarkNav', () => {
    const defaultProps = {
        currentIndex: 2,
        totalCount: 15,
        onNewer: vi.fn(),
        onOlder: vi.fn(),
        onRegenerate: vi.fn(),
    };

    it('renders Newer, Regenerate Proposals, and Older buttons', () => {
        render(<BookmarkNav {...defaultProps} />);
        expect(screen.getByRole('button', { name: /newer/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /regenerate proposals/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /older/i })).toBeInTheDocument();
    });

    it('shows current position (1-indexed) and total count', () => {
        render(<BookmarkNav {...defaultProps} />);
        expect(screen.getByText(/3 of 15/i)).toBeInTheDocument();
    });

    it('calls onNewer when Newer is clicked', async () => {
        const onNewer = vi.fn();
        render(<BookmarkNav {...defaultProps} onNewer={onNewer} />);
        await userEvent.click(screen.getByRole('button', { name: /newer/i }));
        expect(onNewer).toHaveBeenCalledOnce();
    });

    it('calls onOlder when Older is clicked', async () => {
        const onOlder = vi.fn();
        render(<BookmarkNav {...defaultProps} onOlder={onOlder} />);
        await userEvent.click(screen.getByRole('button', { name: /older/i }));
        expect(onOlder).toHaveBeenCalledOnce();
    });

    it('calls onRegenerate when Regenerate Proposals is clicked', async () => {
        const onRegenerate = vi.fn();
        render(<BookmarkNav {...defaultProps} onRegenerate={onRegenerate} />);
        await userEvent.click(screen.getByRole('button', { name: /regenerate proposals/i }));
        expect(onRegenerate).toHaveBeenCalledOnce();
    });

    it('disables Newer button at first position', () => {
        render(<BookmarkNav {...defaultProps} currentIndex={0} />);
        expect(screen.getByRole('button', { name: /newer/i })).toBeDisabled();
    });

    it('disables Older button at last position', () => {
        render(<BookmarkNav {...defaultProps} currentIndex={14} totalCount={15} />);
        expect(screen.getByRole('button', { name: /older/i })).toBeDisabled();
    });

    it('can be disabled via regenerateDisabled prop', () => {
        render(<BookmarkNav {...defaultProps} regenerateDisabled={true} />);
        expect(screen.getByRole('button', { name: /regenerate proposals/i })).toBeDisabled();
    });

    it('renders nothing (or falsy-safe) when totalCount is 0', () => {
        render(<BookmarkNav {...defaultProps} currentIndex={0} totalCount={0} />);
        expect(screen.queryByText(/of 0/i)).not.toBeInTheDocument();
    });
});
