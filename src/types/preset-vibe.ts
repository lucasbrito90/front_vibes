/** Nested cover bundle on PresetVibe API responses. */
export interface PresetCoverBundle {
  id: number;
  name: string;
  thumbnail_url: string | null;
  artwork_url: string | null;
  player_background_url: string | null;
}

/** Normalized preset sound layer (API key `sounds`). */
export interface PresetVibeSoundLayer {
  id: number;
  sound_id: number;
  soundName?: string;
  volume: number;
  play_mode: string;
  sort_order: number;
}

/** Admin template row from GET /api/preset-vibes (active-only for mobile). */
export interface PresetVibe {
  id: number;
  name: string;
  description: string | null;
  cover_bundle_id: number | null;
  cover_bundle: PresetCoverBundle | null;
  category: string | null;
  tags: string[];
  is_active: boolean;
  layers: PresetVibeSoundLayer[];
}
