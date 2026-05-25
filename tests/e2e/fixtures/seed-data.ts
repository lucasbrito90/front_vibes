/** Stable IDs used by Playwright player specs (API mocked — no backend seed required). */

export const SEED_VIBE_ID = 42;
export const EMPTY_VIBE_ID = 99;
export const UNPLAYABLE_VIBE_ID = 98;

export const seedVibe = {
  id: SEED_VIBE_ID,
  name: 'E2E Rain Mix',
  description: 'Seeded vibe for Playwright player UX checks.',
  thumbnail_url: null,
  card_image_url: null,
  player_background_url: null,
  artwork_url: null,
  is_active: true,
  sounds_count: 2,
  created_at: '2026-01-01T00:00:00.000000Z',
  updated_at: '2026-01-01T00:00:00.000000Z',
};

export const seedSounds = [
  {
    id: 1001,
    name: 'Soft Rain',
    file_url: 'https://cdn.example.test/sounds/soft-rain.mp3',
    thumbnail_url: null,
    category: 'nature',
    duration: 120,
    volume: 70,
    loop: true,
    sort_order: 1,
    play_mode: 'loop' as const,
    repeat_interval_seconds: null,
    start_offset_seconds: 0,
    play_duration_seconds: null,
    fade_in_seconds: 0,
    fade_out_seconds: 0,
  },
  {
    id: 1002,
    name: 'Distant Thunder',
    file_url: 'https://cdn.example.test/sounds/thunder.mp3',
    thumbnail_url: null,
    category: 'nature',
    duration: 90,
    volume: 50,
    loop: false,
    sort_order: 2,
    play_mode: 'once' as const,
    repeat_interval_seconds: null,
    start_offset_seconds: 0,
    play_duration_seconds: null,
    fade_in_seconds: 0,
    fade_out_seconds: 0,
  },
];

export const unplayableSounds = [
  {
    id: 2001,
    name: 'Broken Layer',
    file_url: '',
    thumbnail_url: null,
    category: 'nature',
    duration: 60,
    volume: 80,
    loop: true,
    sort_order: 1,
    play_mode: 'loop' as const,
    repeat_interval_seconds: null,
    start_offset_seconds: 0,
    play_duration_seconds: null,
    fade_in_seconds: 0,
    fade_out_seconds: 0,
  },
];
