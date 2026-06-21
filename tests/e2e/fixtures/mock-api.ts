import type { Page } from '@playwright/test';

import {
  EMPTY_VIBE_ID,
  SEED_VIBE_ID,
  UNPLAYABLE_VIBE_ID,
  seedSounds,
  seedVibe,
  unplayableSounds,
} from './seed-data';

function vibeDetail(id: number) {
  if (id === SEED_VIBE_ID) return seedVibe;
  if (id === EMPTY_VIBE_ID) {
    return { ...seedVibe, id: EMPTY_VIBE_ID, name: 'Empty Test Vibe', sounds_count: 0 };
  }
  if (id === UNPLAYABLE_VIBE_ID) {
    return { ...seedVibe, id: UNPLAYABLE_VIBE_ID, name: 'Unplayable Test Vibe', sounds_count: 1 };
  }
  return null;
}

function soundsForVibe(id: number) {
  if (id === SEED_VIBE_ID) return seedSounds;
  if (id === EMPTY_VIBE_ID) return [];
  if (id === UNPLAYABLE_VIBE_ID) return unplayableSounds;
  return null;
}

/** Mock Laravel API responses for player page flows (no real backend). */
export async function installPlayerApiMocks(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    const vibeMatch = pathname.match(/\/api\/vibes\/(\d+)$/);
    if (request.method() === 'GET' && vibeMatch) {
      const id = Number(vibeMatch[1]);
      const vibe = vibeDetail(id);
      if (vibe) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: vibe }),
        });
        return;
      }
    }

    const soundsMatch = pathname.match(/\/api\/vibes\/(\d+)\/sounds$/);
    if (request.method() === 'GET' && soundsMatch) {
      const id = Number(soundsMatch[1]);
      const sounds = soundsForVibe(id);
      if (sounds !== null) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: sounds }),
        });
        return;
      }
    }

    if (pathname.endsWith('/api/auth/sync') && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 1,
            firebase_uid: 'e2e-user',
            name: 'E2E User',
            email: 'e2e@example.test',
            avatar_url: null,
            role: 'user',
            admin_access_status: 'none',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: `Unmocked E2E route: ${request.method()} ${pathname}` }),
    });
  });
}
