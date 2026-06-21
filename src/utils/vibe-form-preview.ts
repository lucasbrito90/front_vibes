import type { Vibe } from '@/services/vibe.service';

/** Minimal vibe-shaped object for artwork helpers while editing (draft id 0). */
export function vibePreviewFromImageFields(fields: {
  thumbnail_url: string;
  artwork_url: string;
  player_background_url: string;
}): Vibe {
  return {
    id: 0,
    name: '',
    description: null,
    thumbnail_url: fields.thumbnail_url.trim() || null,
    card_image_url: null,
    player_background_url: fields.player_background_url.trim() || null,
    artwork_url: fields.artwork_url.trim() || null,
    is_active: true,
    created_at: '',
    updated_at: '',
  };
}
