/**
 * Sound playback URL normalization for API payloads.
 *
 * `file_url` is canonical. `audio_url` is an optional legacy alias if older
 * payloads or proxies still emit it — never prefer it when `file_url` is set.
 */
export function normalizeSoundFileUrlFromApi(row: {
  file_url?: unknown;
  audio_url?: unknown;
}): string {
  const primary = typeof row.file_url === 'string' ? row.file_url.trim() : '';
  if (primary !== '') return primary;
  const legacy = typeof row.audio_url === 'string' ? row.audio_url.trim() : '';

  return legacy;
}
