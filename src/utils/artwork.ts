/**
 * Central artwork / background helpers for vibes (Ixora).
 *
 * Keeps URL priority and gradient fallbacks consistent across Player, cards,
 * MiniPlayer, and Home. See docs/artwork-background-strategy.md.
 *
 * Image URLs are plain HTTPS strings from the API (Spaces CDN, Firebase legacy,
 * etc.). `<img>` and CSS `url(...)` accept them as-is; no host whitelist.
 */

import type { Vibe } from '@/services/vibe.service';

/** Premium dark gradients — readable white text on top; work in light/dark app chrome. */
export const VIBE_ARTWORK_GRADIENTS = [
  /* dark teal */
  'linear-gradient(155deg, #042f2e 0%, #0f766e 40%, #022c22 100%)',
  /* deep navy */
  'linear-gradient(158deg, #0f172a 0%, #1e3a5f 48%, #020617 100%)',
  /* cyan glow */
  'linear-gradient(165deg, #083344 0%, #0891b2 36%, #042f4e 100%)',
  /* subtle purple */
  'linear-gradient(160deg, #1e1035 0%, #5b21b6 45%, #0c0a1a 100%)',
  /* warm ember */
  'linear-gradient(162deg, #292524 0%, #c2410c 38%, #1c1412 100%)',
  /* night forest */
  'linear-gradient(168deg, #052e16 0%, #15803d 44%, #052012 100%)',
] as const;

/** Global CSS classes — defined in `theme/layout.css`. */
export const CLS_ARTWORK_IMG_FADE = 'app-artwork-fade-in';
export const CLS_ARTWORK_CARD_ENTER = 'app-artwork-card-enter';

export function getVibeFallbackGradient(seed: number): string {
  const n = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return VIBE_ARTWORK_GRADIENTS[n % VIBE_ARTWORK_GRADIENTS.length]!;
}

/**
 * Square artwork for notifications / MiniPlayer (MediaSession).
 * Priority: `artwork_url` → `thumbnail_url` (API may already collapse these).
 */
export function getVibeArtworkUrl(vibe: Vibe | null | undefined): string | null {
  if (!vibe) return null;
  const u = vibe.artwork_url ?? vibe.thumbnail_url;
  return u?.trim() ? u : null;
}

/**
 * Full-bleed player hero image.
 * Priority: `player_background_url` → `thumbnail_url`.
 */
export function getVibePlayerBackgroundUrl(vibe: Vibe | null | undefined): string | null {
  if (!vibe) return null;
  const u = vibe.player_background_url ?? vibe.thumbnail_url;
  return u?.trim() ? u : null;
}

/** Raw thumbnail field only (legacy / diagnostics). */
export function getVibeThumbnailUrl(vibe: Vibe | null | undefined): string | null {
  if (!vibe) return null;
  const u = vibe.thumbnail_url;
  return u?.trim() ? u : null;
}

/**
 * Card / list imagery (wide or square crop).
 * Priority: `card_image_url` → `thumbnail_url`.
 */
export function getVibeCardImageUrl(vibe: Vibe | null | undefined): string | null {
  if (!vibe) return null;
  const u = vibe.card_image_url ?? vibe.thumbnail_url;
  return u?.trim() ? u : null;
}

/** Inline styles for the full-screen player background layer. */
export function getVibePlayerBackgroundStyle(vibe: Vibe | null | undefined): Record<string, string> {
  const url = getVibePlayerBackgroundUrl(vibe);
  if (url) {
    return {
      backgroundImage:    `url('${url}')`,
      backgroundSize:     'cover',
      backgroundPosition: 'center',
      backgroundRepeat:   'no-repeat',
    };
  }
  const seed = vibe?.id ?? 0;
  return { background: getVibeFallbackGradient(seed) };
}

/**
 * Inline styles for vibe list cards (cover image or gradient).
 * `index` varies the gradient when multiple cards share an id (should not happen).
 */
export function getVibeCardBackgroundStyle(
  vibe: Vibe | null | undefined,
  index = 0,
): Record<string, string> {
  const url = getVibeCardImageUrl(vibe);
  if (url) {
    return {
      backgroundImage:    `url('${url}')`,
      backgroundSize:     'cover',
      backgroundPosition: 'center',
      backgroundRepeat:   'no-repeat',
    };
  }
  const seed = (vibe?.id ?? 0) + index * 997;
  return { background: getVibeFallbackGradient(seed) };
}
