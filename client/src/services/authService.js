export const login = (provider) => {
    console.log(`Initiating login for ${provider}`);
    window.location.href = `/api/auth/${provider}`;
};

export const testConnection = async (provider) => {
    try {
        let endpoint = '';
        if (provider === 'raindropio') endpoint = '/api/raindropio/test';
        if (provider === 'venice') endpoint = '/api/venice/test';
        if (provider === 'buffer') endpoint = '/api/auth/buffer/test';
        if (provider === 'imgbb') endpoint = '/api/auth/imgbb/test';

        const response = await fetch(endpoint, {
            credentials: 'include'
        });
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
        const response = await fetch('/api/auth/status', {
            credentials: 'include'
        });
        return await response.json();
    } catch (err) {
        console.error("Status check error:", err);
        return { raindropio: false, venice: false, buffer: false, imgbb: false };
    }
};
