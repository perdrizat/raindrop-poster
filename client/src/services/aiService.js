export const generateProposals = async (article, customPrompt) => {
    try {
        if (!article || !article.link) {
            throw new Error("Invalid article provided");
        }

        // 1. Scrape the article text (now returns markdown + html)
        let articleText = '';
        let scrapeData = { markdown: '', html: '' };

        const scrapeRes = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: article.link })
        });

        if (scrapeRes.ok) {
            const data = await scrapeRes.json();
            articleText = data.markdown || data.text || '';
            scrapeData = {
                markdown: data.markdown || '',
                html: data.html || ''
            };
        } else {
            console.warn("Scraping failed, falling back to metadata only", await scrapeRes.text());
        }

        // 2. Generate proposals (send markdown to Venice for richer context)
        const generateRes = await fetch('/api/venice/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articleText: articleText || 'Text unavailable. Please generate based solely on title and highlights.',
                prompt: customPrompt,
                metadata: {
                    title: article.title,
                    url: article.link,
                    highlight: article.highlight
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
            author: data.author || null,
            scrapeData
        };

    } catch (error) {
        console.error("aiService generateProposals error:", error);
        throw error;
    }
};
