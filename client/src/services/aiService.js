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
        return {
            proposals: data.proposals || [],
            author: data.author || null
        };

    } catch (error) {
        console.error("aiService generateProposals error:", error);
        throw error;
    }
};

export const selectEngagingHighlight = async (postingObjectives, article, highlights) => {
    try {
        const prompt = `Given the article at ${article.link} and my objective to '${postingObjectives}', which of the following highlights is the most engaging for a tweet? Return only the text of the single best highlight.
Highlights:
${highlights.map(h => h.text).join('\n')}`;

        const generateRes = await fetch('/api/venice/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articleText: 'N/A', // Not needed for highlight selection, metadata contains highlights
                prompt: prompt,
                metadata: {
                    title: article.title,
                    url: article.link,
                    isHighlightSelection: true
                }
            })
        });

        if (!generateRes.ok) {
            // Note: Our test expects the error message to be thrown, let's extract it
            const errorData = await generateRes.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to select highlight');
        }

        const data = await generateRes.json();
        return data.highlight;

    } catch (error) {
        console.error("aiService selectEngagingHighlight error:", error);
        throw error;
    }
};
