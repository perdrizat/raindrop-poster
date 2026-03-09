const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const getSystemStatus = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/system/status`);
        if (!response.ok) throw new Error('Failed to fetch system status');
        return await response.json();
    } catch (error) {
        console.error('Error fetching system status:', error);
        throw error;
    }
};

export const configureSystem = async (config) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/system/configure`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
        });
        if (!response.ok) throw new Error('Failed to configure system');
        return await response.json();
    } catch (error) {
        console.error('Error saving system configuration:', error);
        throw error;
    }
};
