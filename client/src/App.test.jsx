import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import * as settingsService from './services/settingsService';
import { getSystemStatus } from './services/systemService';

vi.mock('./services/settingsService');
vi.mock('./services/systemService', () => ({
    getSystemStatus: vi.fn().mockResolvedValue({ isConfigured: true }),
}));
vi.mock('./pages/SetupPage', () => ({ default: () => <div data-testid="setup-page">Setup Page</div> }));
// Surface the props PostPage receives so tests can assert what App passes down
vi.mock('./pages/PostPage', () => ({
    default: (props) => (
        <div
            data-testid="publish-page"
            data-selected-tag={props.selectedTag ?? ''}
            data-posting-objectives={props.postingObjectives ?? ''}
        >
            Post Page
        </div>
    ),
}));

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // Deprecated
        removeListener: vi.fn(), // Deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

describe('App routing and navigation (Backlog Side Quests)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.history.replaceState(null, '', '/');
    });

    it('defaults to SetupPage if selectedTag is missing', async () => {
        settingsService.loadSettings.mockReturnValue({});
        render(<App />);
        await waitFor(() => {
            expect(screen.getByTestId('setup-page')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('publish-page')).not.toBeInTheDocument();
    });

    it('defaults to PostPage (Queue) if selectedTag is configured', async () => {
        settingsService.loadSettings.mockReturnValue({ selectedTag: 'important' });
        render(<App />);
        await waitFor(() => {
            expect(screen.getByTestId('publish-page')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
    });

    it('Navigation buttons should be ordered Queue (left) then Setup (right)', async () => {
        settingsService.loadSettings.mockReturnValue({});
        render(<App />);
        await waitFor(() => {
            expect(screen.getByTestId('setup-page')).toBeInTheDocument();
        });
        const navButtons = screen.getAllByRole('button').filter(b =>
            b.textContent === 'Queue' || b.textContent === 'Setup'
        );
        expect(navButtons[0]).toHaveTextContent('Queue');
        expect(navButtons[1]).toHaveTextContent('Setup');
    });

    // Workflow settings live server-side (SQLite, via /api/system/status); localStorage
    // is per-origin so it diverges between e.g. an nginx hostname and a direct IP —
    // the 2026-07-03 "queue loads forever behind the proxy" bug.
    it('passes the server selectedTag and postingObjectives to PostPage when localStorage is empty', async () => {
        settingsService.loadSettings.mockReturnValue({});
        getSystemStatus.mockResolvedValueOnce({
            isConfigured: true,
            selectedTag: 'Postit',
            postingObjectives: 'Server objectives',
        });
        window.history.replaceState(null, '', '/queue');

        render(<App />);

        const page = await screen.findByTestId('publish-page');
        expect(page).toHaveAttribute('data-selected-tag', 'Postit');
        expect(page).toHaveAttribute('data-posting-objectives', 'Server objectives');
    });

    it('prefers the server tag over a stale localStorage tag', async () => {
        settingsService.loadSettings.mockReturnValue({ selectedTag: 'stale-local' });
        getSystemStatus.mockResolvedValueOnce({ isConfigured: true, selectedTag: 'Postit' });

        render(<App />);

        const page = await screen.findByTestId('publish-page');
        expect(page).toHaveAttribute('data-selected-tag', 'Postit');
    });

    it('lands on the Queue on a fresh origin (empty localStorage, root path) when the server has a tag', async () => {
        settingsService.loadSettings.mockReturnValue({});
        getSystemStatus.mockResolvedValueOnce({ isConfigured: true, selectedTag: 'Postit' });

        render(<App />); // beforeEach puts us at '/'

        expect(await screen.findByTestId('publish-page')).toBeInTheDocument();
        expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
    });

    // BUILD_TIME is baked as ISO-8601 UTC; the badge must render it in the
    // viewer's local timezone, never show the raw UTC string (which reads as
    // a wrong wall-clock time to anyone outside UTC).
    it('renders the Built: tooltip in the viewer-local timezone, not raw UTC', async () => {
        vi.stubEnv('VITE_APP_VERSION', '9.9.9');
        vi.stubEnv('VITE_BUILD_TIME', '2026-07-03T17:25:00Z');
        settingsService.loadSettings.mockReturnValue({});
        try {
            render(<App />);
            const badge = await screen.findByText('v9.9.9');
            const expectedLocal = new Date('2026-07-03T17:25:00Z').toLocaleString();
            expect(badge).toHaveAttribute('title', `Built: ${expectedLocal}`);
            expect(badge.getAttribute('title')).not.toContain('17:25:00Z');
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it('Clicking the "Raindrop Poster" header should navigate to Queue', async () => {
        settingsService.loadSettings.mockReturnValue({});
        const user = userEvent.setup();
        render(<App />);

        // Wait for async initialization to complete
        await waitFor(() => {
            expect(screen.getByTestId('setup-page')).toBeInTheDocument();
        });

        // Click header
        await user.click(screen.getByText('Raindrop Poster'));

        // Should now be on Publish/Queue page
        expect(screen.getByTestId('publish-page')).toBeInTheDocument();
    });
});
