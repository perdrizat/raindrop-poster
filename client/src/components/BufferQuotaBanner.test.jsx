import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BufferQuotaBanner from './BufferQuotaBanner';
import { getBufferQuota } from '../services/systemService';

vi.mock('../services/systemService', () => ({ getBufferQuota: vi.fn() }));

const hour = 3600000;

describe('BufferQuotaBanner', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders nothing below 80% usage', async () => {
        getBufferQuota.mockResolvedValue({ rateLimit: { limit: 100, remaining: 50, resetAt: Date.now() + hour } });
        render(<BufferQuotaBanner />);
        await waitFor(() => expect(getBufferQuota).toHaveBeenCalled());
        expect(screen.queryByTestId('buffer-quota-banner')).toBeNull();
    });

    it('shows calls-left and reset time at 80%+ usage', async () => {
        getBufferQuota.mockResolvedValue({ rateLimit: { limit: 100, remaining: 12, resetAt: Date.now() + 2 * hour } });
        render(<BufferQuotaBanner />);
        const banner = await screen.findByTestId('buffer-quota-banner');
        expect(banner).toHaveTextContent(/12 of 100 calls left/i);
        expect(banner).toHaveTextContent(/resets in/i);
    });

    it('leads with the reset time when fully blocked', async () => {
        getBufferQuota.mockResolvedValue({ rateLimit: { limit: 100, remaining: 0, resetAt: Date.now() + 3 * hour } });
        render(<BufferQuotaBanner />);
        const banner = await screen.findByTestId('buffer-quota-banner');
        expect(banner).toHaveTextContent(/limit reached/i);
        expect(banner).toHaveTextContent(/resets in/i);
    });

    it('renders nothing when Buffer has no rate-limit data yet', async () => {
        getBufferQuota.mockResolvedValue({ rateLimit: null });
        render(<BufferQuotaBanner />);
        await waitFor(() => expect(getBufferQuota).toHaveBeenCalled());
        expect(screen.queryByTestId('buffer-quota-banner')).toBeNull();
    });

    it('renders nothing once the window has reset (stale snapshot)', async () => {
        getBufferQuota.mockResolvedValue({ rateLimit: { limit: 100, remaining: 0, resetAt: Date.now() - 1000 } });
        render(<BufferQuotaBanner />);
        await waitFor(() => expect(getBufferQuota).toHaveBeenCalled());
        expect(screen.queryByTestId('buffer-quota-banner')).toBeNull();
    });
});
