import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: [
            ...configDefaults.exclude,
            '**/*.e2e.test.*',      // E2E tests requiring real APIs & Puppeteer
            '**/*-e2e.test.*',
        ],
        coverage: {
            // Floors set ~2-3 points below measured coverage (2026-06-12: 79.8/72.7/71.4/81.8)
            // to lock in the level without making every small change a threshold fight.
            thresholds: {
                statements: 77,
                branches: 70,
                functions: 69,
                lines: 79,
            },
            exclude: ['scripts/**', 'eslint.config.js', '**/*.test.js'],
        },
    }
});
