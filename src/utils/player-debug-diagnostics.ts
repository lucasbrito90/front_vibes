/**
 * Pure helpers for the dev-only Player Debug Harness.
 * Read-only classification — no playback or cache mutation.
 */

import {
  hasValidExecutionFileUrl,
  isExecutionLayerPlayable,
  type VibeExecutionLayer,
} from '@/services/player-engine.service';

export type UrlSourceKind = 'empty' | 'https-cdn' | 'file-local' | 'other';

export function classifyUrlSource(url: string | null | undefined): UrlSourceKind {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return 'empty';
  if (trimmed.startsWith('file://')) return 'file-local';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return 'https-cdn';
    return 'other';
  } catch {
    try {
      new URL(trimmed, 'https://placeholder.invalid/');
      return 'other';
    } catch {
      return 'empty';
    }
  }
}

export function formatUrlSourceLabel(kind: UrlSourceKind): string {
  switch (kind) {
    case 'empty':
      return 'empty / invalid';
    case 'https-cdn':
      return 'HTTPS (CDN)';
    case 'file-local':
      return 'local file://';
    default:
      return 'other';
  }
}

export interface LayerPlayabilityDiag {
  soundId: number;
  soundName: string;
  validUrl: boolean;
  intervalMissingRepeat: boolean;
  playable: boolean;
}

export function getLayerPlayabilityDiag(layer: VibeExecutionLayer): LayerPlayabilityDiag {
  const validUrl = hasValidExecutionFileUrl(layer.fileUrl);
  const intervalMissingRepeat =
    layer.playMode === 'interval'
    && (layer.repeatIntervalSeconds == null || layer.repeatIntervalSeconds < 1);

  return {
    soundId: layer.soundId,
    soundName: layer.soundName,
    validUrl,
    intervalMissingRepeat,
    playable: isExecutionLayerPlayable(layer),
  };
}

export function countPlayableLayers(layers: VibeExecutionLayer[]): number {
  return layers.filter(isExecutionLayerPlayable).length;
}

/** Shorten long URLs for on-screen display; full value stays in title/tooltip. */
export function truncateForDisplay(url: string, max = 56): string {
  const t = url.trim();
  if (t.length <= max) return t || '—';
  return `${t.slice(0, max - 1)}…`;
}
