import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from './ThemeToggle';

const mockMatchMedia = (prefersDark) => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: prefersDark });
};

describe('ThemeToggle', () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.documentElement.classList.remove('dark');
        mockMatchMedia(false);
    });

    it('starts light when no saved theme and OS prefers light', () => {
        render(<ThemeToggle />);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('starts dark when OS prefers dark and nothing is saved', () => {
        mockMatchMedia(true);
        render(<ThemeToggle />);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('saved theme wins over OS preference', () => {
        mockMatchMedia(true);
        window.localStorage.setItem('theme', 'light');
        render(<ThemeToggle />);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('toggling to dark adds the class and persists the choice', async () => {
        render(<ThemeToggle />);
        await userEvent.click(screen.getByRole('button', { name: /toggle dark mode/i }));

        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(window.localStorage.getItem('theme')).toBe('dark');
    });

    it('toggling back to light removes the class and persists the choice', async () => {
        window.localStorage.setItem('theme', 'dark');
        render(<ThemeToggle />);
        await userEvent.click(screen.getByRole('button', { name: /toggle dark mode/i }));

        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(window.localStorage.getItem('theme')).toBe('light');
    });
});
