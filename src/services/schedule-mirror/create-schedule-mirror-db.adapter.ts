import { Capacitor } from '@capacitor/core';

import { CapacitorScheduleMirrorDbAdapter } from './capacitor-schedule-mirror-db.adapter';
import { InMemoryScheduleMirrorDbAdapter } from './in-memory-schedule-mirror-db.adapter';
import type { ScheduleMirrorDbAdapter } from './schedule-mirror-db.adapter';

/** Picks native SQLite on device; in-memory elsewhere (browser, Vitest). */
export function createScheduleMirrorDbAdapter(): ScheduleMirrorDbAdapter {
  if (Capacitor.isNativePlatform()) {
    return new CapacitorScheduleMirrorDbAdapter();
  }
  return new InMemoryScheduleMirrorDbAdapter();
}
