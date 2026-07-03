import { defineConfig, configDefaults } from 'vitest/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Tests write settings through the default getDb(), which falls back to
// process.cwd() when DATA_DIR is unset — clobbering the developer's
// server/raindrop.sqlite. Point it at a throwaway temp dir instead (guarded by
// services/db-isolation.test.js), and remove it when the run's process exits so
// these don't accumulate in the OS temp dir across runs.
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raindrop-vitest-'));
process.on('exit', () => {
    try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

export default defineConfig({
    test: {
        env: {
            DATA_DIR: testDataDir,
        },
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
