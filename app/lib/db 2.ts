import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { DailyEntry, FixedCosts } from "./calculations";

export type Targets = {
  targetSales: number;
  targetProfit: number;
  targetCount: number;
  cpaTarget: number;
};

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
      await getSql()`
        CREATE TABLE IF NOT EXISTS fixed_costs (
          area_id TEXT NOT NULL,
          year INT NOT NULL,
          month INT NOT NULL,
          labor_cost BIGINT NOT NULL DEFAULT 0,
          rent BIGINT NOT NULL DEFAULT 0,
          other BIGINT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (area_id, year, month)
        )
      `;
      await getSql()`
        CREATE TABLE IF NOT EXISTS targets (
          area_id TEXT NOT NULL,
          year INT NOT NULL,
          month INT NOT NULL,
          target_sales BIGINT NOT NULL DEFAULT 0,
          target_profit BIGINT NOT NULL DEFAULT 0,
          target_count INT NOT NULL DEFAULT 0,
          cpa_target INT NOT NULL DEFAULT 0,
          PRIMARY KEY (area_id, year, month)
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

export async function getFixedCosts(
  areaId: string, year: number, month: number
): Promise<FixedCosts> {
  await ensureSchema();
  const rows = (await getSql()`
    SELECT labor_cost, rent, other FROM fixed_costs
    WHERE area_id = ${areaId} AND year = ${year} AND month = ${month}
  `) as { labor_cost: string | number; rent: string | number; other: string | number }[];
  if (!rows[0]) return { laborCost: 0, rent: 0, other: 0 };
  return {
    laborCost: Number(rows[0].labor_cost),
    rent: Number(rows[0].rent),
    other: Number(rows[0].other),
  };
}

export async function upsertFixedCosts(
  areaId: string, year: number, month: number, fc: FixedCosts
): Promise<void> {
  await ensureSchema();
  await getSql()`
    INSERT INTO fixed_costs (area_id, year, month, labor_cost, rent, other)
    VALUES (${areaId}, ${year}, ${month}, ${fc.laborCost}, ${fc.rent}, ${fc.other})
    ON CONFLICT (area_id, year, month) DO UPDATE
    SET labor_cost = EXCLUDED.labor_cost, rent = EXCLUDED.rent, other = EXCLUDED.other
  `;
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
