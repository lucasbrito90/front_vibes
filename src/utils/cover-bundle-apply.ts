/**
 * Merge bundle imagery into vibe form fields: only non-empty bundle URLs overwrite;
 * missing bundle URLs leave existing values unchanged.
 */
import type { CoverBundle } from '@/types/cover-bundle';

export function applyCoverBundleToFormFields(
  form: {
    thumbnail_url: string;
    artwork_url: string;
    player_background_url: string;
  },
  bundle: CoverBundle,
): void {
  const t = bundle.thumbnail_url?.trim();
  if (t) form.thumbnail_url = t;
  const a = bundle.artwork_url?.trim();
  if (a) form.artwork_url = a;
  const p = bundle.player_background_url?.trim();
  if (p) form.player_background_url = p;
}
