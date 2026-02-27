const SETTINGS_KEY = 'raindrop_publisher_settings';

export const saveSettings = (settings) => {
    try {
        const serialized = JSON.stringify(settings);
        localStorage.setItem(SETTINGS_KEY, serialized);
        return true;
    } catch (error) {
        console.error("Failed to save settings to localStorage:", error);
        return false;
    }
};

export const loadSettings = () => {
    try {
        const serialized = localStorage.getItem(SETTINGS_KEY);
        if (serialized === null) {
            return {
                providerConnections: {
                    raindropio: false,
                    twitter: false
                },
                selectedTag: '',
                postingObjectives: 'Propose engaging Twitter posts that help me increase my follower count',
                publishDestination: 'twitter',
                bufferChannels: []
            };
        }
        const parsed = JSON.parse(serialized);

        // Ensure defaults for any new properties not present in old saves
        if (parsed && !parsed.publishDestination) {
            parsed.publishDestination = 'twitter';
        }
        if (parsed && !parsed.bufferChannels) {
            parsed.bufferChannels = [];
        }

        return parsed;
    } catch (error) {
        console.error("Failed to load settings from localStorage:", error);
        return {
            providerConnections: {
                raindropio: false,
                twitter: false
            },
            selectedTag: '',
            postingObjectives: 'Propose engaging Twitter posts that help me increase my follower count',
            publishDestination: 'twitter',
            bufferChannels: []
        };
    }
};
