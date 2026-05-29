// PR c94-C-4 統合テスト: Export 経路の研修生 (trainee_count) 列追加 + daily-entries
//   の snake 修復 (latent bug) を検証する lean セット。
//
// 単独実行: npm run test:integration:c94-c-4-shift-e2e
//   - 構造 + CSV シリアライズ検証は純 (DB 不要、常時実行)
//   - DB 集計 → export SELECT 相当の検証は DATABASE_URL 設定時のみ (専用月 2099-12)
//     未設定時は skip 表示 (fail 扱いにしない) → ローカルで純テストだけ回せる
//
// 検証範囲は c94-C-4 の新規面に限定する。aggregation MAX 自体 / calculateDashboard は
//   c94-C-1 (foundation) / c94-C-3a で検証済のため、本テストでは重複させない:
//   1. columnMappings に trainee_count 列定義 (MONTHLY / DAILY 両系統)
//   2. DAILY_ENTRIES_COLUMNS が snake vehicle_count (旧 camel vehicleCount バグの回帰ガード)
//   3. rowsToCsv 実シリアライズで研修生列がヘッダ + 実値で出力される (CSV/XLSX 共通ソース)
//   4. (DB) 2099-12 集計 → export が SELECT する trainee_count に MAX が乗る (vehicle と並列)

import { Pool } from "@neondatabase/serverless";
import {
  MONTHLY_SUMMARY_COLUMNS,
  DAILY_ENTRIES_COLUMNS,
  applyRound,
} from "../app/data-io/lib/columnMappings";
import { rowsToCsv } from "../app/data-io/lib/exportToCsv";
import { aggregateMonthlySummary } from "../app/lib/monthlyAggregation";
import { ensureSchema } from "../app/lib/db";

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  ok(`${name} (= ${JSON.stringify(expected)})`, actual === expected);
  if (actual !== expected) console.log(`     got ${JSON.stringify(actual)}`);
}

// rowsToCsv の出力 (BOM + papaparse 改行) を [ヘッダ配列, データ行配列[]] に分解する。
// テスト値にカンマ・引用符を含めない前提 (quotes:false) なので単純 split で足りる。
function parseCsv(csv: string): { header: string[]; rows: string[][] } {
  const body = csv.replace(/^﻿/, "");
  const lines = body.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  const rows = lines.slice(1).map((l) => l.split(","));
  return { header, rows };
}

const TRAINEE_LABEL = "研修生（営業マン）";

function runPureTests() {
  // ── 1. columnMappings 構造 ──────────────────────────────
  console.log("📋 1. columnMappings に trainee_count 列定義");
  const monthlyTrainee = MONTHLY_SUMMARY_COLUMNS.find((c) => c.key === "trainee_count");
  ok("MONTHLY_SUMMARY_COLUMNS に trainee_count あり", !!monthlyTrainee);
  eq("  └ label", monthlyTrainee?.label, TRAINEE_LABEL);

  const dailyTrainee = DAILY_ENTRIES_COLUMNS.find((c) => c.key === "trainee_count");
  ok("DAILY_ENTRIES_COLUMNS に trainee_count あり", !!dailyTrainee);

  // ── 2. daily-entries の snake 修復 (回帰ガード) ───────────
  console.log("\n📋 2. daily-entries vehicle_count snake 化 (latent bug 回帰ガード)");
  ok(
    "DAILY_ENTRIES_COLUMNS に snake vehicle_count あり",
    DAILY_ENTRIES_COLUMNS.some((c) => c.key === "vehicle_count"),
  );
  ok(
    "DAILY_ENTRIES_COLUMNS に旧 camel vehicleCount は無い (空列バグ修復)",
    !DAILY_ENTRIES_COLUMNS.some((c) => c.key === "vehicleCount"),
  );

  // ── 3. rowsToCsv 実シリアライズ ─────────────────────────
  console.log("\n📋 3. rowsToCsv で研修生列がヘッダ + 実値出力");
  // monthly-summary: route の SELECT が返す行を模擬 (snake)
  const msCsv = rowsToCsv(
    [{ year: 2099, month: 12, area_name: "関西", vehicle_count: 3, trainee_count: 7 }],
    MONTHLY_SUMMARY_COLUMNS,
  );
  const ms = parseCsv(msCsv);
  const msIdx = ms.header.indexOf(TRAINEE_LABEL);
  ok("monthly CSV ヘッダに研修生列あり", msIdx >= 0);
  eq("monthly CSV 研修生セル", ms.rows[0]?.[msIdx], "7");

  // daily-entries: route の FLAT_FIELDS が snake で展開した行を模擬
  //   (snake key で値が乗る = latent bug 修復の証明。旧 camel なら空だった)
  const deCsv = rowsToCsv(
    [{ entry_date: "2099-12-25", area_name: "関西", vehicle_count: 3, trainee_count: 7 }],
    DAILY_ENTRIES_COLUMNS,
  );
  const de = parseCsv(deCsv);
  const deTraineeIdx = de.header.indexOf(TRAINEE_LABEL);
  const deVehicleIdx = de.header.indexOf("車両数");
  ok("daily CSV ヘッダに研修生列あり", deTraineeIdx >= 0);
  eq("daily CSV 研修生セル", de.rows[0]?.[deTraineeIdx], "7");
  eq("daily CSV 車両数セル (snake 直読で実値)", de.rows[0]?.[deVehicleIdx], "3");

  // applyRound 整合 (件数は整数化)
  eq("applyRound intCount", applyRound(7, "intCount"), 7);
}

async function runDbTest() {
  const AREA = "kansai";
  const CATEGORY = "water" as const;
  const YEAR = 2099;
  const MONTH = 12;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const start = `${YEAR}-12-01`;
  const end = `${YEAR}-12-31`;

  const cleanup = async () => {
    await client.query(
      `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date >= $3 AND entry_date <= $4`,
      [AREA, CATEGORY, start, end],
    );
    await client.query(
      `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [AREA, CATEGORY, YEAR, MONTH],
    );
  };

  const insert = async (day: number, vehicle: number, trainee: number) => {
    const date = `${YEAR}-12-${String(day).padStart(2, "0")}`;
    const data = { date, vehicle_count: vehicle, trainee_count: trainee };
    await client.query(
      `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [AREA, CATEGORY, date, JSON.stringify(data)],
    );
  };

  try {
    console.log("\n📋 4. (DB) 2099-12 集計 → export SELECT 相当に trainee_count = MAX");
    await ensureSchema();
    await cleanup();
    await insert(5, 2, 3);
    await insert(15, 6, 9); // vehicle MAX=6, trainee MAX=9
    await insert(25, 4, 5);
    await aggregateMonthlySummary(AREA, CATEGORY, YEAR, MONTH);

    // export route (monthly-summary) と同じ列を SELECT
    const { rows } = await client.query(
      `SELECT vehicle_count, trainee_count FROM monthly_summaries
       WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [AREA, CATEGORY, YEAR, MONTH],
    );
    eq("export SELECT trainee_count = 9 (MAX)", Number(rows[0]?.trainee_count), 9);
    eq("export SELECT vehicle_count = 6 (MAX、並列確認)", Number(rows[0]?.vehicle_count), 6);

    await cleanup();
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  console.log("🧪 PR c94-C-4: Export 研修生列 + daily-entries snake 修復 検証 (lean)\n");
  runPureTests();

  if (process.env.DATABASE_URL) {
    await runDbTest();
  } else {
    console.log("\n⏭️  4. (DB) skip: DATABASE_URL 未設定 (CI / 反さん環境で実行)");
    console.log("     export $(grep DATABASE_URL .env.local | xargs) で有効化");
    skipped += 2;
  }

  console.log(
    `\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed` +
      (skipped > 0 ? ` (${skipped} skipped: DB)` : ""),
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
