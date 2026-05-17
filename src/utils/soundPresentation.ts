/**
 * Presentation helpers for catalog sounds (Ixora UI).
 * Uses only fields already on `Sound` / `VibeSound` — no backend changes.
 */

import type { Sound } from '@/services/sound.service';
import type { PlayMode } from '@/services/vibe-sound.service';
import { getVibeFallbackGradient } from '@/utils/artwork';
import {
  cafeOutline,
  fitnessOutline,
  flameOutline,
  leafOutline,
  moonOutline,
  musicalNotesOutline,
  rainyOutline,
  snowOutline,
  thunderstormOutline,
  waterOutline,
} from 'ionicons/icons';

/** Minimal shape for icon / mood heuristics */
export type SoundLike = Pick<Sound, 'id' | 'name' | 'category'>;

export function getSoundCategoryLabel(sound: Pick<Sound, 'category'>): string {
  const c = sound.category?.trim();
  if (c && c.length > 0) return c;
  return 'Ambient';
}

/** Stable gradient when `thumbnail_url` is missing (reuses vibe palette). */
export function getSoundFallbackGradient(sound: Pick<Sound, 'id'>, index = 0): string {
  return getVibeFallbackGradient(sound.id + index * 31);
}

export function getSoundIcon(sound: SoundLike): string {
  const blob = `${sound.name} ${sound.category}`.toLowerCase();

  if (/thunder|lightning/.test(blob)) return thunderstormOutline;
  if (/rain|drizzle/.test(blob)) return rainyOutline;
  if (/ocean|sea|wave|river|stream|water|aqua|bubble/.test(blob)) return waterOutline;
  if (/fire|flame|ember|crackle|hearth|campfire/.test(blob)) return flameOutline;
  if (/forest|bird|jungle|leaf|wood|nature|meadow/.test(blob)) return leafOutline;
  if (/sleep|dream|night|lull|bed/.test(blob)) return moonOutline;
  if (/snow|winter|ice|frost/.test(blob)) return snowOutline;
  if (/cafe|coffee|city|urban|street/.test(blob)) return cafeOutline;
  if (/focus|study|work|pomodoro|deep|concentrat/.test(blob)) return fitnessOutline;

  return musicalNotesOutline;
}

export function formatSoundDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Lightweight mood / ambience tags derived from name + category (no ML).
 * Returns 1–3 short labels for chips.
 */
export function getSoundMoodTags(sound: SoundLike): string[] {
  const tags: string[] = [];
  const blob = `${sound.name} ${sound.category}`.toLowerCase();

  const rules: [RegExp, string][] = [
    [/rain|storm|thunder|drizzle/, 'Rain'],
    [/ocean|sea|wave|river|water/, 'Water'],
    [/fire|flame|ember|crackle|hearth/, 'Fire'],
    [/forest|bird|jungle|leaf|wood|nature/, 'Forest'],
    [/focus|study|work|deep|concentrat/, 'Focus'],
    [/sleep|dream|night|lull|calm/, 'Sleep'],
    [/wind|breeze|air/, 'Wind'],
    [/cafe|coffee|urban|city/, 'City'],
    [/white noise|brown noise|pink noise/, 'Noise'],
  ];

  for (const [re, label] of rules) {
    if (re.test(blob) && !tags.includes(label)) tags.push(label);
    if (tags.length >= 3) return tags;
  }

  const cat = sound.category?.trim();
  if (
    cat
    && cat.length > 0
    && !/^other$/i.test(cat)
    && !tags.some((t) => t.toLowerCase() === cat.toLowerCase())
  ) {
    tags.push(cat);
  }

  return tags.slice(0, 3);
}

export function getPlayModeLabel(mode: PlayMode): string {
  switch (mode) {
    case 'loop':
      return 'Loop';
    case 'once':
      return 'Once';
    case 'interval':
      return 'Interval';
    default:
      return mode;
  }
}
