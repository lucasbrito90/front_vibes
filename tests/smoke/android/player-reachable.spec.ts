/**
 * Android smoke — app shell + player route reachable.
 *
 * Does NOT tap play, assert NativeAudio, or validate offline filesystem.
 * Requires a debug APK built with VITE_E2E_MOCK_AUTH=true (see docs/android-smoke-tests.md).
 */
import { expect } from '@wdio/globals';

import { navigateAppRoute, playerRoute, switchToWebView } from './helpers/webview.js';

const SMOKE_VIBE_ID = process.env.SMOKE_PLAYER_VIBE_ID ?? '42';

describe('Android smoke — player reachable', () => {
  it('launches the app shell and opens the player screen', async () => {
    await switchToWebView();

    // App shell: Ionic root mounted in the WebView.
    await expect($('ion-app')).toExist();

    // No Android deep link is configured yet — navigate via WebView URL (same as in-app router).
    await navigateAppRoute(playerRoute(SMOKE_VIBE_ID));

    const playerPage = $('[data-testid="player-page"]');
    await expect(playerPage).toBeDisplayed();

    // Stable player chrome (label is uppercase via CSS text-transform).
    await expect($('.player-label')).toHaveText('AMBIENT MIX');
    await expect($('[data-testid="player-play-button"]')).toBeDisplayed();
  });
});
