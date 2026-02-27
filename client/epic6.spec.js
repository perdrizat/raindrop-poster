import { test, expect } from '@playwright/test';

test('epic 6: buffer, queue persistence, and settings categories', async ({ page }) => {
    // Setup mocks
    await page.route('**/api/auth/status', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                twitter: true,
                raindropio: true,
                venice: true,
                buffer: true
            })
        });
    });

    await page.route('**/api/raindropio/tags', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(['AI', 'Startups', 'Tech'])
        });
    });

    await page.route('**/api/raindropio/items*', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { _id: '1', title: 'First Article', link: 'https://example.com/1', excerpt: 'mock excerpt 1' },
                { _id: '2', title: 'Second Article', link: 'https://example.com/2', excerpt: 'mock excerpt 2' },
                { _id: '3', title: 'Third Article', link: 'https://example.com/3', excerpt: 'mock excerpt 3' }
            ])
        });
    });

    await page.route('**/api/venice/generate', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                proposals: ['Proposal 1', 'Proposal 2', 'Proposal 3'],
                author: 'Test Author'
            })
        });
    });

    // Navigate to Setup
    await page.goto('http://localhost:5175/setup');
    await page.waitForTimeout(1000); // Wait for animations

    // 1. Verify Categorized Layout
    await expect(page.getByRole('heading', { name: '1. Bookmarks' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '2. AI Copywriter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '3. Publishing' })).toBeVisible();

    // 2. Setup Options 
    await page.locator('#tag-select').selectOption('Tech');
    await page.locator('#destination-select').selectOption('buffer');
    await page.locator('#objectives-input').fill('Custom objective for AI');

    // Verify UI swaps dynamically to Buffer
    await expect(page.getByText('Log in with Buffer.com')).toBeVisible() || expect(page.getByText('Connected to Buffer.com')).toBeVisible();

    await page.getByRole('button', { name: 'Save Configuration' }).click();
    await page.waitForTimeout(1000); // Wait for toast

    // Go to Queue
    await page.getByRole('link', { name: 'Queue' }).click();
    await page.waitForTimeout(2000); // Wait for items and AI

    // 3. Verify Queue persistence (Click Next, Reload, Verify we are still on item #2)
    await expect(page.getByText('First Article')).toBeVisible();
    await expect(page.getByText('Proposal 1')).toBeVisible();

    await page.getByRole('button', { name: 'Next >' }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('Second Article')).toBeVisible();

    // Simulate refresh
    await page.reload();
    await page.waitForTimeout(2000);

    // Expect Queue to remember we were on Second Article due to localStorage
    await expect(page.getByText('Second Article')).toBeVisible();

});
