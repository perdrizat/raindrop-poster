import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { setSetting, getSetting } from './db.js';

// Unit tests must never touch the developer database (raindrop.sqlite in the
// server working directory). Route tests write settings through the default
// getDb(), which falls back to process.cwd() when DATA_DIR is unset — on
// 2026-07-03 that blanked the real VENICE_API_KEY in a dev checkout. The vitest
// config points DATA_DIR at a temp directory; this test fails loudly if that
// guard is ever removed.
describe('test database isolation', () => {
    it('routes default-path writes to DATA_DIR outside the repo, leaving the dev database untouched', async () => {
        const devDb = path.join(process.cwd(), 'raindrop.sqlite');
        const devDbMtimeBefore = fs.existsSync(devDb) ? fs.statSync(devDb).mtimeMs : null;

        expect(process.env.DATA_DIR).toBeTruthy();
        expect(path.resolve(process.env.DATA_DIR)).not.toBe(path.resolve(process.cwd()));

        // A write through the default db handle — the exact pattern route tests use
        await setSetting('ISOLATION_PROBE', 'probe-value');
        expect(await getSetting('ISOLATION_PROBE')).toBe('probe-value');

        const devDbMtimeAfter = fs.existsSync(devDb) ? fs.statSync(devDb).mtimeMs : null;
        expect(devDbMtimeAfter).toBe(devDbMtimeBefore);
    });
});
