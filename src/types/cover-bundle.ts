/** Cover bundle catalog entry (GET /api/cover-bundles) — visual package, not audio. */
export interface CoverBundle {
  id: number;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  artwork_url: string | null;
  player_background_url: string | null;
  category: string | null;
  tags: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}
