import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: [
            ...configDefaults.exclude,
            '**/*.e2e.test.*',      // E2E tests requiring real APIs & Puppeteer
            '**/*-e2e.test.*',
        ]
    }
});
