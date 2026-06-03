import { expect, type Page } from '@playwright/test';

const TITLE_PLACEHOLDER = '…';

/**
 * Opens the player route and waits until route data is ready:
 * - full-page loading spinner hidden
 * - vibe title hydrated (not placeholder ellipsis)
 * - optional exact title assertion when `expectedTitle` is provided
 */
export async function openPlayer(
  page: Page,
  vibeId: number,
  expectedTitle?: string,
): Promise<void> {
  await page.goto(`/vibes/${vibeId}/player`);
  await expect(page.getByTestId('player-page')).toBeVisible();
  await expect(page.getByText('Loading vibe…')).toBeHidden({ timeout: 15_000 });

  const titleEl = page.getByTestId('player-vibe-title');
  await expect(titleEl).not.toHaveText(TITLE_PLACEHOLDER, { timeout: 10_000 });

  if (expectedTitle != null) {
    await expect(titleEl).toHaveText(expectedTitle, { timeout: 5_000 });
  } else {
    await expect(titleEl).not.toBeEmpty();
  }
}
