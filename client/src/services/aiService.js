export const generateProposals = async (article, customPrompt, signal, charBudget) => {
    try {
        if (!article || !article.link) {
            throw new Error("Invalid article provided");
        }

        let articleText = '';
        let scrapeData = { markdown: '', html: '' };

        const scrapeRes = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: article.link }),
            signal,
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

        const generateRes = await fetch('/api/venice/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articleText: articleText || 'Text unavailable. Please generate based solely on title and highlights.',
                prompt: customPrompt,
                charBudget,
                metadata: {
                    title: article.title,
                    url: article.link,
                    highlight: article.highlight
                }
            }),
            signal,
        });

        if (!generateRes.ok) {
            const errorData = await generateRes.json();
            throw new Error(errorData.error || 'Failed to generate proposals');
        }

        const data = await generateRes.json();
        return {
            proposals: data.proposals || [],
            author: data.author || null,
            imageContext: data.imageContext || null,
            scrapeData
        };

    } catch (error) {
        if (error?.name === 'AbortError') {
            throw error;
        }
        console.error("aiService generateProposals error:", error);
        throw error;
    }
};
