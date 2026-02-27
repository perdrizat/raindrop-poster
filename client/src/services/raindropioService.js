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
