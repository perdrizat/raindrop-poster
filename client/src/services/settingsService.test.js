import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { saveSettings, loadSettings } from './settingsService';

describe('settingsService', () => {
    beforeEach(() => {
        // Mock localStorage
        const localStorageMock = (function () {
            let store = {};
            return {
                getItem(key) {
                    return store[key] || null;
                },
                setItem(key, value) {
                    store[key] = value.toString();
                },
                removeItem(key) {
                    delete store[key];
                },
                clear() {
                    store = {};
                }
            };
        })();

        Object.defineProperty(window, 'localStorage', {
            value: localStorageMock,
            writable: true
        });

        window.localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return default settings including publishDestination and bufferChannels if localStorage is empty', () => {
        const settings = loadSettings();
        expect(settings).toEqual({
            providerConnections: {
                raindropio: false,
                twitter: false
            },
            selectedTag: '',
            postingObjectives: 'Propose engaging Twitter posts that help me increase my follower count',
            publishDestination: 'twitter',
            bufferChannels: []
        });
    });

    it('should preserve unknown properties when loading from localStorage but ensure defaults for new properties', () => {
        const legacySettings = { selectedTag: 'my-tag' };
        window.localStorage.setItem('raindrop_publisher_settings', JSON.stringify(legacySettings));

        const settings = loadSettings();

        expect(settings.selectedTag).toBe('my-tag');
        expect(settings.publishDestination).toBe('twitter'); // Fallback default
        expect(settings.bufferChannels).toEqual([]); // Fallback default
    });

    it('should save and reload specific bufferChannels array', () => {
        saveSettings({ publishDestination: 'buffer', bufferChannels: ['id1', 'id2'] });
        const settings = loadSettings();

        expect(settings.publishDestination).toBe('buffer');
        expect(settings.bufferChannels).toEqual(['id1', 'id2']);
    });

    it('should save and reload specific publishDestinations', () => {
        saveSettings({ publishDestination: 'buffer', selectedTag: 'test' });
        const settings = loadSettings();

        expect(settings.publishDestination).toBe('buffer');
        expect(settings.selectedTag).toBe('test');
    });
});
