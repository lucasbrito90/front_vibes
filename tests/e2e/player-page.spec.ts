import { expect, test } from '@playwright/test';

import { installPlayerApiMocks } from './fixtures/mock-api';
import { openPlayer } from './fixtures/player-helpers';
import { EMPTY_VIBE_ID, SEED_VIBE_ID, UNPLAYABLE_VIBE_ID } from './fixtures/seed-data';

test.beforeEach(async ({ page }) => {
  await installPlayerApiMocks(page);
});

test.describe('Vibe player page (web UX)', () => {
  test('opens app and renders the seeded player route', async ({ page }) => {
    await openPlayer(page, SEED_VIBE_ID, 'E2E Rain Mix');

    await expect(page.getByTestId('player-vibe-title')).toHaveText('E2E Rain Mix');
    await expect(page.getByTestId('player-play-button')).toBeVisible();
    await expect(page.getByText('2 sounds • Soft Rain • Distant Thunder')).toBeVisible();
  });

  test('keeps Player Debug Harness collapsed by default in dev', async ({ page }) => {
    await openPlayer(page, SEED_VIBE_ID);

    const toggle = page.getByTestId('player-debug-harness-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('player-debug-harness-body')).toHaveCount(0);
  });

  test('renders the Sound layers section for a seeded vibe', async ({ page }) => {
    await openPlayer(page, SEED_VIBE_ID);

    const layers = page.getByTestId('player-layers-section');
    await expect(layers).toBeVisible();
    await expect(layers.getByRole('heading', { name: 'Sound layers' })).toBeVisible();
    await expect(layers.getByText('Soft Rain')).toBeVisible();
    await expect(layers.getByText('Distant Thunder')).toBeVisible();
  });

  test('shows a stable empty-state warning when the vibe has no sounds', async ({ page }) => {
    await openPlayer(page, EMPTY_VIBE_ID, 'Empty Test Vibe');

    await expect(page.getByTestId('player-warning-banner')).toHaveText('No sounds configured');
    await expect(page.getByTestId('player-layers-section')).toHaveCount(0);
    await expect(page.getByText('No sounds configured').first()).toBeVisible();
  });

  test('shows a stable warning when layers are not playable', async ({ page }) => {
    await openPlayer(page, UNPLAYABLE_VIBE_ID, 'Unplayable Test Vibe');

    await expect(page.getByTestId('player-warning-banner')).toHaveText(
      'No playable sounds for this phase',
    );
    await expect(page.getByTestId('player-layers-section')).toBeVisible();
    await expect(page.getByTestId('player-layers-section').getByText('Broken Layer')).toBeVisible();
    await expect(page.getByTestId('player-play-button')).toBeDisabled();
  });
});
