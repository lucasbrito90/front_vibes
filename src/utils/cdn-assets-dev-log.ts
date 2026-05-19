/**
 * DEV-only diagnostics for remote asset hosts (CDN vs legacy origins).
 * Never logs full URLs — hostname only — and only when `import.meta.env.DEV`.
 */
export type CdnAssetDevScope = 'sound' | 'artwork' | 'offline-download';

export function logCdnAssetDev(scope: CdnAssetDevScope, url: string | null | undefined): void {
  if (!import.meta.env.DEV) return;

  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (trimmed === '') {
    console.debug('[CDNAssets]', scope, 'host', '(empty)');

    return;
  }

  try {
    const host = new URL(trimmed).hostname;
    console.debug('[CDNAssets]', scope, 'host', host);
  } catch {
    console.debug('[CDNAssets]', scope, 'host', '(unparseable)');
  }
}
