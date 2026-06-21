import type {
  ScheduleMirrorDbAdapter,
  ScheduleMirrorRow,
} from './schedule-mirror-db.adapter';

/** In-memory adapter for Vitest and non-native (browser) builds. */
export class InMemoryScheduleMirrorDbAdapter implements ScheduleMirrorDbAdapter {
  private meta = new Map<string, string>();
  private schedules = new Map<number, ScheduleMirrorRow>();
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  async removeMeta(key: string): Promise<void> {
    this.meta.delete(key);
  }

  async upsertSchedule(row: ScheduleMirrorRow): Promise<void> {
    this.schedules.set(row.id, { ...row });
  }

  async replaceAllSchedules(rows: ScheduleMirrorRow[]): Promise<void> {
    this.schedules.clear();
    for (const row of rows) {
      this.schedules.set(row.id, { ...row });
    }
  }

  async listSchedules(): Promise<ScheduleMirrorRow[]> {
    return [...this.schedules.values()].sort((a, b) => b.id - a.id);
  }

  async getSchedule(id: number): Promise<ScheduleMirrorRow | null> {
    return this.schedules.get(id) ?? null;
  }

  async deleteSchedule(id: number): Promise<void> {
    this.schedules.delete(id);
  }

  async clearAllSchedules(): Promise<void> {
    this.schedules.clear();
    this.meta.clear();
  }

  /** Test helper — whether initialize() has been called. */
  isInitialized(): boolean {
    return this.initialized;
  }
}
