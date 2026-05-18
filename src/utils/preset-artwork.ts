import type { Vibe } from '@/services/vibe.service';
import type { PresetVibe } from '@/types/preset-vibe';

/**
 * Build a minimal {@link Vibe}-shaped object so {@link getVibeCardBackgroundStyle}
 * can render preset list cards from the linked cover bundle thumbnails.
 */
export function presetForCardArtwork(preset: PresetVibe): Vibe {
  const b = preset.cover_bundle;
  const thumb = b?.thumbnail_url?.trim() ? b.thumbnail_url : null;

  return {
    id:             preset.id,
    name:           preset.name,
    description:    preset.description,
    thumbnail_url:        thumb,
    card_image_url:       thumb,
    player_background_url:
      b?.player_background_url?.trim() ? b.player_background_url : null,
    artwork_url:          b?.artwork_url?.trim() ? b.artwork_url : null,
    is_active:      true,
    sounds_count:   preset.layers.length,
    created_at:     '',
    updated_at:     '',
  };
}
