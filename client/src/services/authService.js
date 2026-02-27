export const login = (provider) => {
    console.log(`Initiating login for ${provider}`);
    window.location.href = `/api/auth/${provider}`;
};

export const testConnection = async (provider) => {
    try {
        let endpoint = '';
        if (provider === 'twitter') endpoint = '/api/auth/twitter/test';
        if (provider === 'raindropio') endpoint = '/api/raindropio/test';
        if (provider === 'venice') endpoint = '/api/venice/test';
        if (provider === 'buffer') endpoint = '/api/auth/buffer/test';

        const response = await fetch(endpoint);
        const data = await response.json();

        if (!response.ok) {
            return { error: data.error || 'Failed to connect' };
        }
        return data;
    } catch (err) {
        console.error("Test connection error:", err);
        return { error: 'Network error connecting to backend' };
    }
};

export const checkAuthStatus = async () => {
    try {
        const response = await fetch('/api/auth/status');
        return await response.json();
    } catch (err) {
        console.error("Status check error:", err);
        return { twitter: false, raindropio: false, venice: false };
    }
};
