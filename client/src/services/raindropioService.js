export const fetchTags = async () => {
    try {
        console.log("Fetching tags from real backend...");
        const response = await fetch('/api/raindropio/tags');
        const data = await response.json();

        if (!data.tags) return [];

        // Raindrop API returns tags as objects with an _id property: { _id: "tag-name", count: 10 }
        // We only need an array of string tag names for our UI dropdown
        return data.tags.map(tag => typeof tag === 'object' ? tag._id : tag);
    } catch (err) {
        console.error("Error fetching Raindrop tags:", err);
        return [];
    }
};

export const fetchTaggedItems = async (tag) => {
    try {
        console.log(`Fetching items for tag "${tag}" from backend...`);
        // The API expects URL encoded JSON search string
        const searchString = encodeURIComponent(`[{"key":"tag","val":"${tag}"}]`);
        const response = await fetch(`/api/raindropio/raindrops/0?search=${searchString}`);

        if (response.status === 401) {
            throw new Error('unauthorized');
        }

        const data = await response.json();

        if (!response.ok || !data.success || !data.items) {
            console.error("fetchTaggedItems failed:", data.error || 'Unknown error');
            return [];
        }

        return data.items.map(item => {
            if ((!item.highlights || item.highlights.length === 0) && item.note) {
                return {
                    ...item,
                    highlights: [{ text: item.note }]
                };
            }
            return item;
        });
    } catch (err) {
        console.error("Error fetching tagged items:", err);
        if (err.message === 'unauthorized') {
            throw err;
        }
        return [];
    }
};

export const updateBookmarkTags = async (bookmarkId, tags) => {
    try {
        const response = await fetch(`/api/raindropio/bookmark/${bookmarkId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tags }),
        });

        if (!response.ok) {
            console.error(`Failed to update tags for bookmark ${bookmarkId}`);
            return false;
        }

        const data = await response.json();
        return data.success === true;
    } catch (err) {
        console.error("Error updating formatting bookmark tags:", err);
        return false;
    }
};

