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
