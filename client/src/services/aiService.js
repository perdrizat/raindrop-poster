export const generateProposals = async (article, customPrompt) => {
    try {
        if (!article || !article.link) {
            throw new Error("Invalid article provided");
        }

        // 1. Scrape the article text
        const scrapeRes = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: article.link })
        });

        let articleText = '';
        if (scrapeRes.ok) {
            const scrapeData = await scrapeRes.json();
            articleText = scrapeData.text;
        } else {
            console.warn("Scraping failed, falling back to metadata only", await scrapeRes.text());
        }

        // 2. Generate proposals
        const generateRes = await fetch('/api/venice/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articleText: articleText || 'Text unavailable. Please generate based solely on title and highlights.',
                prompt: customPrompt,
                metadata: {
                    title: article.title,
                    url: article.link,
                    highlights: article.highlights
                }
            })
        });

        if (!generateRes.ok) {
            const errorData = await generateRes.json();
            throw new Error(errorData.error || 'Failed to generate proposals');
        }

        const data = await generateRes.json();
        return data.proposals || [];

    } catch (error) {
        console.error("aiService generateProposals error:", error);
        throw error;
    }
};
