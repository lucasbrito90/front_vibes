import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import {
  SCHEDULES_MIRROR_SCHEMA,
  type ScheduleMirrorDbAdapter,
  type ScheduleMirrorRow,
} from './schedule-mirror-db.adapter';

const DB_NAME = 'ixora_schedules_v1';
const DB_VERSION = 1;

const UPSERT_SQL = `
INSERT OR REPLACE INTO schedules_mirror (
  id, vibe_id, name, timezone, start_time, recurrence_type, recurrence_config,
  is_enabled, next_run_at, last_run_at, created_at, updated_at, synced_at, raw_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

/** Native SQLite adapter for Android (and other Capacitor native targets). */
export class CapacitorScheduleMirrorDbAdapter implements ScheduleMirrorDbAdapter {
  private connection: SQLiteDBConnection | null = null;
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);

  private async getDb(): Promise<SQLiteDBConnection> {
    if (this.connection) {
      return this.connection;
    }

    const consistency = await this.sqlite.checkConnectionsConsistency();
    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;
    if (consistency.result && isConn) {
      this.connection = await this.sqlite.retrieveConnection(DB_NAME, false);
    } else {
      this.connection = await this.sqlite.createConnection(
        DB_NAME,
        false,
        'no-encryption',
        DB_VERSION,
        false,
      );
    }

    await this.connection.open();
    return this.connection;
  }

  async initialize(): Promise<void> {
    const db = await this.getDb();
    const result = await db.execute(SCHEDULES_MIRROR_SCHEMA);
    if (result.changes?.changes !== undefined && result.changes.changes < 0) {
      throw new Error('Failed to initialize schedules mirror schema');
    }
  }

  async getMeta(key: string): Promise<string | null> {
    const db = await this.getDb();
    const result = await db.query('SELECT value FROM mirror_meta WHERE key = ? LIMIT 1;', [key]);
    const value = result.values?.[0]?.value;
    return typeof value === 'string' ? value : null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    const db = await this.getDb();
    await db.run(
      'INSERT OR REPLACE INTO mirror_meta (key, value) VALUES (?, ?);',
      [key, value],
      false,
    );
  }

  async removeMeta(key: string): Promise<void> {
    const db = await this.getDb();
    await db.run('DELETE FROM mirror_meta WHERE key = ?;', [key], false);
  }

  async upsertSchedule(row: ScheduleMirrorRow): Promise<void> {
    const db = await this.getDb();
    await db.run(UPSERT_SQL, rowToBindValues(row), false);
  }

  async replaceAllSchedules(rows: ScheduleMirrorRow[]): Promise<void> {
    const db = await this.getDb();
    await db.execute('BEGIN TRANSACTION;');
    try {
      await db.run('DELETE FROM schedules_mirror;', [], false);
      for (const row of rows) {
        await db.run(UPSERT_SQL, rowToBindValues(row), false);
      }
      await db.execute('COMMIT;');
    } catch (err) {
      await db.execute('ROLLBACK;');
      throw err;
    }
  }

  async listSchedules(): Promise<ScheduleMirrorRow[]> {
    const db = await this.getDb();
    const result = await db.query(
      'SELECT * FROM schedules_mirror ORDER BY id DESC;',
      [],
    );
    return (result.values ?? []).map(rowFromQuery);
  }

  async getSchedule(id: number): Promise<ScheduleMirrorRow | null> {
    const db = await this.getDb();
    const result = await db.query(
      'SELECT * FROM schedules_mirror WHERE id = ? LIMIT 1;',
      [id],
    );
    const row = result.values?.[0];
    return row ? rowFromQuery(row) : null;
  }

  async deleteSchedule(id: number): Promise<void> {
    const db = await this.getDb();
    await db.run('DELETE FROM schedules_mirror WHERE id = ?;', [id], false);
  }

  async clearAllSchedules(): Promise<void> {
    const db = await this.getDb();
    await db.run('DELETE FROM schedules_mirror;', [], false);
    await db.run('DELETE FROM mirror_meta;', [], false);
  }
}

function rowToBindValues(row: ScheduleMirrorRow): (string | number | null)[] {
  return [
    row.id,
    row.vibe_id,
    row.name,
    row.timezone,
    row.start_time,
    row.recurrence_type,
    row.recurrence_config,
    row.is_enabled,
    row.next_run_at,
    row.last_run_at,
    row.created_at,
    row.updated_at,
    row.synced_at,
    row.raw_json,
  ];
}

function rowFromQuery(value: Record<string, unknown>): ScheduleMirrorRow {
  return {
    id: Number(value.id),
    vibe_id: Number(value.vibe_id),
    name: String(value.name),
    timezone: String(value.timezone),
    start_time: String(value.start_time),
    recurrence_type: String(value.recurrence_type),
    recurrence_config:
      value.recurrence_config == null ? null : String(value.recurrence_config),
    is_enabled: Number(value.is_enabled),
    next_run_at: value.next_run_at == null ? null : String(value.next_run_at),
    last_run_at: value.last_run_at == null ? null : String(value.last_run_at),
    created_at: value.created_at == null ? null : String(value.created_at),
    updated_at: value.updated_at == null ? null : String(value.updated_at),
    synced_at: String(value.synced_at),
    raw_json: String(value.raw_json),
  };
}
