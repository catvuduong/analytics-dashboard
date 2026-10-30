import { test, expect, Page } from '@playwright/test';

// Reads a whole-number KPI such as "1,234". Returns 0 while the placeholder is shown.
async function readCount(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? '';
  return Number(text.replace(/[^\d]/g, '') || 0);
}

test.describe('analytics dashboard', () => {
  test('is populated on first load with KPIs, chart, funnel and top tables', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('kpi-visitors')).toHaveText(/\d/);
    await expect(page.getByTestId('kpi-delta-visitors')).toBeVisible();
    expect(await readCount(page, 'kpi-visitors')).toBeGreaterThan(0);

    await expect(page.getByTestId('traffic-chart')).toHaveAttribute('data-interval', 'day');
    await expect(page.getByTestId('top-pages').locator('tbody tr').first()).toBeVisible();
    await expect(page.getByTestId('funnel')).toContainText('Signed up');
    await expect(page.getByTestId('live-visitors')).toContainText('visitors now');
    await expect(page.getByTestId('health')).toContainText('api ok');
  });

  test('switching the date range updates the KPIs and the chart', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('kpi-visitors')).toHaveText(/\d/);
    const chart = page.getByTestId('traffic-chart');

    await page.getByTestId('range-30d').click();
    await expect(page.getByTestId('range-30d')).toHaveAttribute('aria-pressed', 'true');
    await expect(chart).toHaveAttribute('data-points', /^(30|31)$/);
    await expect.poll(() => readCount(page, 'kpi-visitors')).toBeGreaterThan(0);
    const thirtyDayVisitors = await readCount(page, 'kpi-visitors');

    await page.getByTestId('range-7d').click();
    await expect(chart).toHaveAttribute('data-points', /^(7|8)$/);
    await expect.poll(() => readCount(page, 'kpi-visitors')).toBeLessThan(thirtyDayVisitors);

    await page.getByTestId('range-24h').click();
    await expect(chart).toHaveAttribute('data-interval', 'hour');
    await expect(chart).toHaveAttribute('data-points', /^(24|25)$/);
  });

  test('exports the top pages table as CSV', async ({ page }) => {
    await page.goto('/');
    const exportButton = page.getByTestId('top-pages').getByRole('button', { name: 'Export CSV' });
    await expect(page.getByTestId('top-pages').locator('tbody tr').first()).toBeVisible();

    const download = page.waitForEvent('download');
    await exportButton.click();
    expect((await download).suggestedFilename()).toMatch(/-path-7d\.csv$/);
  });
});
