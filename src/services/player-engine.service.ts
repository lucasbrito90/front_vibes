/**
 * player-engine.service.ts
 *
 * Pure functions that transform a vibe's sound configuration into an
 * ordered execution plan. This is interpretation-only — no audio is
 * loaded or played here.
 */

import type { PlayMode, VibeSound } from './vibe-sound.service';

import { logCdnAssetDev } from '@/utils/cdn-assets-dev-log';

// ── Output types ──────────────────────────────────────────────────────────────

export interface VibeExecutionLayer {
  /** Internal sound id from the catalog. */
  soundId: number;
  soundName: string;
  fileUrl: string;
  volume: number;
  playMode: PlayMode;

  /** Seconds from the start of the vibe before this layer begins. */
  startsAtSeconds: number;

  /**
   * Absolute second within the vibe at which this layer stops.
   * Null means "no explicit end" (loop runs until the vibe is stopped).
   */
  endsAtSeconds: number | null;

  /** Same as play_duration_seconds from config. */
  durationSeconds: number | null;

  /**
   * Only set for interval mode. Null for loop and once.
   * Represents the pause in seconds between each repetition.
   */
  repeatIntervalSeconds: number | null;

  fadeInSeconds: number;
  fadeOutSeconds: number;
  sortOrder: number;

  /** One-liner description of what this layer will do. */
  humanReadableSummary: string;
}

/** Empty / whitespace-only URLs cannot be played. */
export function hasValidExecutionFileUrl(fileUrl: string): boolean {
  const t = typeof fileUrl === 'string' ? fileUrl.trim() : '';
  if (!t) return false;
  try {
    new URL(t);
    return true;
  } catch {
    try {
      new URL(t, 'https://placeholder.invalid/');
      return true;
    } catch {
      return false;
    }
  }
}

/** Layers the runtime will attach (valid URL + interval rules). */
export function isExecutionLayerPlayable(layer: VibeExecutionLayer): boolean {
  if (!hasValidExecutionFileUrl(layer.fileUrl)) return false;
  if (layer.playMode === 'interval') {
    const ri = layer.repeatIntervalSeconds;
    return ri != null && ri >= 1;
  }
  return true;
}

// ── Time formatting helper ────────────────────────────────────────────────────

/**
 * Converts a raw second count to a compact human-readable string.
 * Examples: 30 → "30s", 1800 → "30min", 3600 → "1h", 5400 → "1h 30min"
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}min`);
  if (s && !h) parts.push(`${s}s`); // skip leftover seconds when hours are shown

  return parts.join(' ');
}

// ── Summary builder ───────────────────────────────────────────────────────────

function buildSummary(layer: Omit<VibeExecutionLayer, 'humanReadableSummary'>): string {
  const parts: string[] = [layer.soundName];

  switch (layer.playMode) {
    case 'loop':
      parts.push('Loop');
      break;
    case 'once':
      parts.push('Plays once');
      break;
    case 'interval':
      parts.push(
        layer.repeatIntervalSeconds
          ? `Every ${formatDuration(layer.repeatIntervalSeconds)}`
          : 'Interval',
      );
      break;
  }

  if (layer.startsAtSeconds > 0) {
    parts.push(`Starts after ${formatDuration(layer.startsAtSeconds)}`);
  }

  if (layer.durationSeconds != null) {
    parts.push(`Plays for ${formatDuration(layer.durationSeconds)}`);
  }

  parts.push(`${layer.volume}%`);

  return parts.join(' • ');
}

// ── Core planner ──────────────────────────────────────────────────────────────

/**
 * Transforms a list of configured vibe sounds into an ordered execution plan.
 *
 * Rules applied:
 *  - Layers are sorted by `sort_order` (ascending).
 *  - `start_offset_seconds` defaults to 0 when absent.
 *  - `endsAtSeconds = startsAtSeconds + durationSeconds` when duration exists.
 *  - `repeatIntervalSeconds` is only preserved for interval mode; null otherwise.
 *  - `fadeInSeconds` / `fadeOutSeconds` default to 0 when absent.
 *
 * This function is pure aside from **DEV-only** `[CDNAssets]` hostname logs.
 */
export function buildVibeExecutionPlan(vibeSounds: VibeSound[]): VibeExecutionLayer[] {
  const result = [...vibeSounds]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((vs): VibeExecutionLayer => {
      const startsAt  = vs.start_offset_seconds ?? 0;
      const duration  = vs.play_duration_seconds ?? null;
      const endsAt    = duration != null ? startsAt + duration : null;

      // repeat_interval_seconds is only meaningful for interval mode
      const repeatInterval =
        vs.play_mode === 'interval' ? (vs.repeat_interval_seconds ?? null) : null;

      const layer: Omit<VibeExecutionLayer, 'humanReadableSummary'> = {
        soundId:                vs.id,
        soundName:              vs.name,
        fileUrl:                vs.file_url,
        volume:                 vs.volume,
        playMode:               vs.play_mode,
        startsAtSeconds:        startsAt,
        endsAtSeconds:          endsAt,
        durationSeconds:        duration,
        repeatIntervalSeconds:  repeatInterval,
        fadeInSeconds:          vs.fade_in_seconds  ?? 0,
        fadeOutSeconds:         vs.fade_out_seconds ?? 0,
        sortOrder:              vs.sort_order,
      };

      return { ...layer, humanReadableSummary: buildSummary(layer) };
    });

  if (import.meta.env.DEV) {
    const seen = new Set<string>();
    for (const layer of result) {
      const u = layer.fileUrl.trim();
      if (u !== '' && !seen.has(u)) {
        seen.add(u);
        logCdnAssetDev('sound', u);
      }
    }
  }

  return result;
}
