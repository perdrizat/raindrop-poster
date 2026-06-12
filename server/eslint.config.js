import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    {
        files: ['**/*.js', '**/*.mjs'],
        extends: [js.configs.recommended],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            // caughtErrors none + allowEmptyCatch: `catch (e) {}` is deliberate idiom here —
            // best-effort popup dismissal / cleanup paths that must never throw.
            'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    {
        // Code evaluated inside the browser page context (page.evaluate, evaluateOnNewDocument)
        files: ['services/highlighter.js', 'services/screenshotService.js', 'services/scraperService.js', 'scripts/*.mjs'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
    },
]);
