import { describe, expect, it } from 'vitest';

import {
  compareOfflineSnapshotSounds,
  comparePlanUrlsToManifest,
  deriveOfflineHealthStatus,
  offlineHealthNeedsUpdate,
} from '@/services/offline-playback-status';
import type { VibeSound } from '@/services/vibe-sound.service';

function sound(overrides: Partial<VibeSound> & Pick<VibeSound, 'id' | 'name'>): VibeSound {
  return {
    file_url: 'https://cdn.example.com/a.mp3',
    thumbnail_url: null,
    category: 'ambient',
    duration: 60,
    volume: 80,
    loop: true,
    sort_order: 0,
    play_mode: 'loop',
    repeat_interval_seconds: null,
    start_offset_seconds: null,
    play_duration_seconds: null,
    fade_in_seconds: null,
    fade_out_seconds: null,
    ...overrides,
  };
}

describe('compareOfflineSnapshotSounds', () => {
  it('reports in sync when snapshot matches current API sounds', () => {
    const base = sound({ id: 1, name: 'Rain' });
    const result = compareOfflineSnapshotSounds([base], [base]);
    expect(result.inSync).toBe(true);
    expect(result.diffs).toHaveLength(0);
  });

  it('detects URL changes on the same sound id', () => {
    const snap = sound({ id: 2, name: 'Wind', file_url: 'https://cdn.example.com/old.mp3' });
    const current = sound({ id: 2, name: 'Wind', file_url: 'https://cdn.example.com/new.mp3' });
    const result = compareOfflineSnapshotSounds([snap], [current]);
    expect(result.inSync).toBe(false);
    expect(result.diffs[0]?.kind).toBe('url_changed');
  });

  it('detects added and removed layers', () => {
    const snap = [sound({ id: 1, name: 'A' }), sound({ id: 2, name: 'B' })];
    const current = [sound({ id: 1, name: 'A' }), sound({ id: 3, name: 'C' })];
    const result = compareOfflineSnapshotSounds(snap, current);
    expect(result.diffs.map((d) => d.kind).sort()).toEqual(['added', 'removed']);
  });
});

describe('comparePlanUrlsToManifest', () => {
  it('requires exact trimmed URL equality for manifest match', () => {
    const planUrl = 'https://cdn.example.com/track.mp3';
    const checks = comparePlanUrlsToManifest(
      [{
        soundId: 5,
        soundName: 'Track',
        fileUrl: planUrl,
        volume: 100,
        playMode: 'loop',
        startsAtSeconds: 0,
        endsAtSeconds: null,
        durationSeconds: null,
        repeatIntervalSeconds: null,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        sortOrder: 0,
        humanReadableSummary: '',
      }],
      { 5: planUrl },
    );
    expect(checks[0]?.matches).toBe(true);
  });

  it('flags mismatch when manifest URL differs', () => {
    const checks = comparePlanUrlsToManifest(
      [{
        soundId: 5,
        soundName: 'Track',
        fileUrl: 'https://cdn.example.com/v2.mp3',
        volume: 100,
        playMode: 'loop',
        startsAtSeconds: 0,
        endsAtSeconds: null,
        durationSeconds: null,
        repeatIntervalSeconds: null,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        sortOrder: 0,
        humanReadableSummary: '',
      }],
      { 5: 'https://cdn.example.com/v1.mp3' },
    );
    expect(checks[0]?.matches).toBe(false);
  });
});

describe('deriveOfflineHealthStatus', () => {
  it('returns partial_audio when manifest exists without snapshot', () => {
    expect(
      deriveOfflineHealthStatus({
        hasSnapshot: false,
        hasOrphanAudioManifest: true,
        snapshotInSync: true,
        allManifestUrlsMatch: true,
        allLocalFilesPresent: true,
      }),
    ).toBe('partial_audio');
  });

  it('returns ready when snapshot, URLs, and files align', () => {
    expect(
      deriveOfflineHealthStatus({
        hasSnapshot: true,
        hasOrphanAudioManifest: false,
        snapshotInSync: true,
        allManifestUrlsMatch: true,
        allLocalFilesPresent: true,
      }),
    ).toBe('ready');
  });

  it('returns stale_urls when manifest URLs no longer match plan', () => {
    expect(
      deriveOfflineHealthStatus({
        hasSnapshot: true,
        hasOrphanAudioManifest: false,
        snapshotInSync: true,
        allManifestUrlsMatch: false,
        allLocalFilesPresent: true,
      }),
    ).toBe('stale_urls');
  });
});

describe('offlineHealthNeedsUpdate', () => {
  it('requires update for stale and broken states only', () => {
    expect(offlineHealthNeedsUpdate('ready')).toBe(false);
    expect(offlineHealthNeedsUpdate('not_downloaded')).toBe(false);
    expect(offlineHealthNeedsUpdate('stale_urls')).toBe(true);
    expect(offlineHealthNeedsUpdate('partial_audio')).toBe(true);
  });
});
