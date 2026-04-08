import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { DailyEntry } from "./calculations";

let _sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _sql = neon(url);
  return _sql;
}

let schemaReady: Promise<void> | null = null;

/** 初回呼び出し時にテーブルを作成(idempotent) */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getSql()`
        CREATE TABLE IF NOT EXISTS entries (
          area_id TEXT NOT NULL,
          entry_date DATE NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (area_id, entry_date)
        )
      `;
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/** 指定エリア・指定月の入力データを取得 */
export async function listEntries(
  areaId: string,
  year: number,
  month: number
): Promise<DailyEntry[]> {
  await ensureSchema();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  // 月初〜翌月初未満
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const rows = (await getSql()`
    SELECT data FROM entries
    WHERE area_id = ${areaId} AND entry_date >= ${start} AND entry_date < ${end}
    ORDER BY entry_date ASC
  `) as { data: DailyEntry }[];

  return rows.map((r) => r.data);
}

/** 入力データを upsert */
export async function upsertEntry(
  areaId: string,
  entry: DailyEntry
): Promise<void> {
  await ensureSchema();
  await getSql()`
    INSERT INTO entries (area_id, entry_date, data, updated_at)
    VALUES (${areaId}, ${entry.date}, ${JSON.stringify(entry)}::jsonb, NOW())
    ON CONFLICT (area_id, entry_date)
    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
}
