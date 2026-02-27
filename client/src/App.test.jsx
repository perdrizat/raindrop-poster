import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import * as settingsService from './services/settingsService';

vi.mock('./services/settingsService');
vi.mock('./pages/SetupPage', () => ({ default: () => <div data-testid="setup-page">Setup Page</div> }));
vi.mock('./pages/PublishPage', () => ({ default: () => <div data-testid="publish-page">Publish Page</div> }));
vi.mock('./pages/ConfirmationPage', () => ({ default: () => <div data-testid="confirmation-page">Confirmation Page</div> }));

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

    it('defaults to SetupPage if selectedTag is missing', () => {
        settingsService.loadSettings.mockReturnValue({});
        render(<App />);
        expect(screen.getByTestId('setup-page')).toBeInTheDocument();
        expect(screen.queryByTestId('publish-page')).not.toBeInTheDocument();
    });

    it('defaults to PublishPage (Queue) if selectedTag is configured', () => {
        settingsService.loadSettings.mockReturnValue({ selectedTag: 'important' });
        render(<App />);
        expect(screen.getByTestId('publish-page')).toBeInTheDocument();
        expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
    });

    it('Navigation buttons should be ordered Queue (left) then Settings (right)', () => {
        settingsService.loadSettings.mockReturnValue({});
        render(<App />);
        const navButtons = screen.getAllByRole('button').filter(b =>
            b.textContent === 'Queue' || b.textContent === 'Settings'
        );
        expect(navButtons[0]).toHaveTextContent('Queue');
        expect(navButtons[1]).toHaveTextContent('Settings');
    });

    it('Clicking the "Raindrop Poster" header should navigate to Queue', async () => {
        settingsService.loadSettings.mockReturnValue({});
        const user = userEvent.setup();
        render(<App />);

        // Starts on setup because no tag
        expect(screen.getByTestId('setup-page')).toBeInTheDocument();

        // Click header
        await user.click(screen.getByText('Raindrop Poster'));

        // Should now be on Publish/Queue page
        expect(screen.getByTestId('publish-page')).toBeInTheDocument();
    });
});
