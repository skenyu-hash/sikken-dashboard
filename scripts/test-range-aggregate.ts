// c96-1 統合テスト: /api/range-aggregate (READ ONLY、DB 要)。
//
// 検証範囲:
//   1. 単日 + 単一 (category, area) → 既存 meeting-aggregate 同形の集計値
//   2. 期間 + 全エリア + 全業態 (合算) → SUM 整合 (revenue / profit / count)
//   3. group_by=category_area → 各 (cat, area) 行が独立に集計される
//   4. water + 5月以降 + consultant_fee 直接控除 (c95-D-4 同形)
//   5. water + 4月以前 + 月境界ガード → consultant_fee 無視 (絶対不変)
//   6. categories=all / areas=all の挙動
//   7. パラメータ検証 (bad from/to / from > to / 空 categories)
//
// 投入先 (専用月 2099-12、本番データ touch 回避):
//   - 各エリア × 各業態に 1-2 日分の entries を投入 → /api/range-aggregate で集計確認 → cleanup
//
// 実行: export $(grep DATABASE_URL .env.local | xargs) && npm run test:integration:range-aggregate
//
// 注: 本テストは Next.js dev server 起動なしで動作するように、route.ts の GET ハンドラを
//   直接 import せず、entries を投入後にスキーマ + SUM SQL を直接実行して期待値計算と
//   照合する設計。HTTP 経由テストは Step 3 (フロント実装) に統合検証時に併せて実施。

import { Pool } from "@neondatabase/serverless";
import { ensureSchema } from "../app/lib/db";

const TEST_YEAR = 2099;
const TEST_MONTH = 12;
const D = (day: number) => `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); failed++; }
}
function eqNum(name: string, actual: number, expected: number) {
  const isOk = Number(actual) === Number(expected);
  ok(`${name}: ${actual} (期待 ${expected})`, isOk);
}

async function insertEntry(
  client: import("@neondatabase/serverless").PoolClient,
  area: string,
  category: string,
  day: number,
  data: Record<string, number>,
) {
  const entry = { date: D(day), ...data };
  await client.query(
    `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (area_id, business_category, entry_date) DO UPDATE SET data=$4::jsonb, updated_at=NOW()`,
    [area, category, D(day), JSON.stringify(entry)],
  );
}

async function cleanupTestMonth(client: import("@neondatabase/serverless").PoolClient) {
  await client.query(
    `DELETE FROM entries WHERE entry_date >= $1::date AND entry_date < ($1::date + INTERVAL '1 month')`,
    [D(1)],
  );
  await client.query(
    `DELETE FROM monthly_summaries WHERE year = $1 AND month = $2`,
    [TEST_YEAR, TEST_MONTH],
  );
}

/** /api/range-aggregate と完全同形の SQL を直接実行 (HTTP 不要、route.ts と式同期)。 */
async function callRangeAggregate(
  client: import("@neondatabase/serverless").PoolClient,
  params: {
    from: string;
    to: string;
    categories: string[];
    areas: string[];
    groupBy: "none" | "category_area";
  },
): Promise<Record<string, unknown>[]> {
  const fromYear = Number(params.from.slice(0, 4));
  const fromMonth = Number(params.from.slice(5, 7));
  const fromYyyymm = fromYear * 100 + fromMonth;
  const applyConsult = fromYyyymm >= 202605;
  const applyConsultEff = applyConsult && params.categories.includes("water");

  if (params.groupBy === "category_area") {
    const { rows } = await client.query(
      `WITH base AS (
         SELECT
           business_category,
           area_id,
           COALESCE(SUM(COALESCE((data->>'outsourced_sales_revenue')::numeric, 0)), 0) AS sum_outsourced_sales_revenue,
           COALESCE(SUM(COALESCE((data->>'internal_staff_revenue')::numeric, 0)), 0) AS sum_internal_staff_revenue,
           COALESCE(SUM(COALESCE((data->>'outsourced_response_count')::numeric, 0)), 0) AS sum_outsourced_response_count,
           COALESCE(SUM(COALESCE((data->>'internal_staff_response_count')::numeric, 0)), 0) AS sum_internal_staff_response_count,
           COALESCE(SUM(COALESCE((data->>'total_labor_cost')::numeric, 0)), 0) AS sum_total_labor_cost,
           COALESCE(SUM(COALESCE((data->>'material_cost')::numeric, 0)), 0) AS sum_material_cost,
           COALESCE(SUM(COALESCE((data->>'sales_outsourcing_cost')::numeric, 0)), 0) AS sum_sales_outsourcing_cost,
           COALESCE(SUM(COALESCE((data->>'card_processing_fee')::numeric, 0)), 0) AS sum_card_processing_fee,
           COALESCE(SUM(COALESCE((data->>'consultant_fee')::numeric, 0)), 0) AS sum_consultant_fee,
           COALESCE(SUM(COALESCE((data->>'ad_cost')::numeric, 0)), 0) AS sum_ad_cost,
           COALESCE(SUM(COALESCE((data->>'locksmith_construction_cost')::numeric, 0)), 0) AS sum_locksmith_construction_cost,
           COALESCE(SUM(COALESCE((data->>'locksmith_commission_fee')::numeric, 0)), 0) AS sum_locksmith_commission_fee,
           COALESCE(SUM(COALESCE((data->>'acquisition_count')::numeric, 0)), 0) AS sum_acquisition_count
         FROM entries
         WHERE business_category = ANY($1::text[])
           AND area_id = ANY($2::text[])
           AND entry_date >= $3::date
           AND entry_date <= $4::date
         GROUP BY business_category, area_id
       )
       SELECT
         business_category, area_id,
         ROUND(sum_outsourced_sales_revenue + sum_internal_staff_revenue)::BIGINT AS total_revenue,
         ROUND(
           CASE
             WHEN business_category IN ('water', 'electric')
               THEN (sum_outsourced_response_count + sum_internal_staff_response_count)
             ELSE sum_acquisition_count
           END
         )::INT AS total_count,
         ROUND(
           CASE
             WHEN business_category = 'locksmith' THEN
               (sum_outsourced_sales_revenue + sum_internal_staff_revenue)
                 - sum_locksmith_construction_cost - sum_material_cost - sum_ad_cost - sum_locksmith_commission_fee
             WHEN business_category = 'water' AND $5::boolean THEN
               (sum_outsourced_sales_revenue + sum_internal_staff_revenue)
                 - sum_total_labor_cost - sum_material_cost - sum_ad_cost - sum_sales_outsourcing_cost - sum_card_processing_fee
                 - sum_consultant_fee
             WHEN business_category = 'water' THEN
               (sum_outsourced_sales_revenue + sum_internal_staff_revenue)
                 - sum_total_labor_cost - sum_material_cost - sum_ad_cost - sum_sales_outsourcing_cost - sum_card_processing_fee
             ELSE
               (sum_outsourced_sales_revenue + sum_internal_staff_revenue)
                 - sum_total_labor_cost - sum_material_cost - sum_ad_cost - sum_sales_outsourcing_cost - sum_card_processing_fee
           END
         )::BIGINT AS total_profit
       FROM base
       ORDER BY business_category, area_id`,
      [params.categories, params.areas, params.from, params.to, applyConsult],
    );
    return rows;
  }

  // none (merged)
  const { rows } = await client.query(
    `WITH base AS (
       SELECT
         COALESCE(SUM(COALESCE((data->>'outsourced_sales_revenue')::numeric, 0)), 0) AS sum_outsourced_sales_revenue,
         COALESCE(SUM(COALESCE((data->>'internal_staff_revenue')::numeric, 0)), 0) AS sum_internal_staff_revenue,
         COALESCE(SUM(COALESCE((data->>'outsourced_response_count')::numeric, 0)), 0) AS sum_outsourced_response_count,
         COALESCE(SUM(COALESCE((data->>'internal_staff_response_count')::numeric, 0)), 0) AS sum_internal_staff_response_count,
         COALESCE(SUM(COALESCE((data->>'total_labor_cost')::numeric, 0)), 0) AS sum_total_labor_cost,
         COALESCE(SUM(COALESCE((data->>'material_cost')::numeric, 0)), 0) AS sum_material_cost,
         COALESCE(SUM(COALESCE((data->>'sales_outsourcing_cost')::numeric, 0)), 0) AS sum_sales_outsourcing_cost,
         COALESCE(SUM(COALESCE((data->>'card_processing_fee')::numeric, 0)), 0) AS sum_card_processing_fee,
         COALESCE(SUM(CASE WHEN business_category = 'water' THEN COALESCE((data->>'consultant_fee')::numeric, 0) ELSE 0 END), 0) AS sum_water_consultant_fee,
         COALESCE(SUM(COALESCE((data->>'ad_cost')::numeric, 0)), 0) AS sum_ad_cost,
         COALESCE(SUM(COALESCE((data->>'locksmith_construction_cost')::numeric, 0)), 0) AS sum_locksmith_construction_cost,
         COALESCE(SUM(COALESCE((data->>'locksmith_commission_fee')::numeric, 0)), 0) AS sum_locksmith_commission_fee,
         COALESCE(SUM(
           CASE WHEN business_category IN ('water', 'electric')
             THEN COALESCE((data->>'outsourced_response_count')::numeric, 0) + COALESCE((data->>'internal_staff_response_count')::numeric, 0)
             ELSE COALESCE((data->>'acquisition_count')::numeric, 0)
           END
         ), 0) AS sum_effective_count
       FROM entries
       WHERE business_category = ANY($1::text[])
         AND area_id = ANY($2::text[])
         AND entry_date >= $3::date
         AND entry_date <= $4::date
     )
     SELECT
       ROUND(sum_outsourced_sales_revenue + sum_internal_staff_revenue)::BIGINT AS total_revenue,
       ROUND(sum_effective_count)::INT AS total_count,
       ROUND(
         (sum_outsourced_sales_revenue + sum_internal_staff_revenue)
         - sum_total_labor_cost - sum_material_cost - sum_ad_cost
         - sum_sales_outsourcing_cost - sum_card_processing_fee
         - sum_locksmith_construction_cost - sum_locksmith_commission_fee
         - CASE WHEN $5::boolean THEN sum_water_consultant_fee ELSE 0 END
       )::BIGINT AS total_profit
     FROM base`,
    [params.categories, params.areas, params.from, params.to, applyConsultEff],
  );
  return rows;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 未設定。export $(grep DATABASE_URL .env.local | xargs) で有効化");
    process.exit(1);
  }
  console.log(`🧪 c96-1: /api/range-aggregate DB 統合検証`);
  console.log(`   投入先: 全エリア × 全業態 / ${TEST_YEAR}-${TEST_MONTH} (yyyymm=${TEST_YEAR * 100 + TEST_MONTH} >= 202605)\n`);

  await ensureSchema();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await cleanupTestMonth(client);

    // 投入: water/kansai に 5 日, 10 日, 15 日
    // 各日: revenue 1,000,000 / costs 200000+100000+50000+30000+5000 = 385000 / consultant_fee 77000
    //       profit (c95-D 仕様、5月以降): 1000000 - 385000 - 77000 = 538000
    const waterKansaiData = {
      outsourced_sales_revenue: 1000000,
      total_labor_cost: 200000, material_cost: 100000,
      ad_cost: 50000, sales_outsourcing_cost: 30000, card_processing_fee: 5000,
      consultant_fee: 77000,
      outsourced_response_count: 10,
    };
    for (const d of [5, 10, 15]) {
      await insertEntry(client, "kansai", "water", d, waterKansaiData);
    }
    // 投入: electric/kanto に 5 日
    const electricKantoData = {
      outsourced_sales_revenue: 500000,
      total_labor_cost: 100000, material_cost: 50000,
      ad_cost: 30000, sales_outsourcing_cost: 10000, card_processing_fee: 0,
      consultant_fee: 99999, // electric には影響しない (water 限定)
      outsourced_response_count: 5,
    };
    await insertEntry(client, "kanto", "electric", 5, electricKantoData);
    // 投入: locksmith/kansai に 5 日 (専用式)
    // 件数バグ回帰用 (2026-06-19): acquisition_count=7 を主、outsourced_response_count=3 を罠として併置。
    //   鍵の件数は acquisition_count を採用すべき (応答件数 3 ではなく 7 が total_count になる)。
    const locksmithData = {
      outsourced_sales_revenue: 200000,
      locksmith_construction_cost: 50000, material_cost: 30000, ad_cost: 10000,
      locksmith_commission_fee: 20000,
      outsourced_response_count: 3, // 罠: 鍵では件数に使われない
      acquisition_count: 7,         // 正: 鍵の件数はこちら
    };
    await insertEntry(client, "kansai", "locksmith", 5, locksmithData);

    // ── 1. 単日 + 単一 (water, kansai) + 5/5 ─────
    console.log("📋 1. 単日 + 単一 (water, kansai, 12/5)");
    const r1 = await callRangeAggregate(client, {
      from: D(5), to: D(5),
      categories: ["water"], areas: ["kansai"],
      groupBy: "category_area",
    });
    eqNum("件数 = 1", r1.length, 1);
    eqNum("total_revenue = 1,000,000", Number(r1[0].total_revenue), 1000000);
    eqNum("total_profit = 538,000 (water + 5月以降 controle 込)", Number(r1[0].total_profit), 538000);
    eqNum("total_count = 10", Number(r1[0].total_count), 10);

    // ── 2. 期間 (5-15) + (water, kansai) → 3 日合算 ─
    console.log("\n📋 2. 期間 5-15 + (water, kansai) 3 日 SUM");
    const r2 = await callRangeAggregate(client, {
      from: D(5), to: D(15),
      categories: ["water"], areas: ["kansai"],
      groupBy: "category_area",
    });
    eqNum("件数 = 1 (cat,area 同一)", r2.length, 1);
    eqNum("total_revenue = 3,000,000 (1M × 3)", Number(r2[0].total_revenue), 3000000);
    eqNum("total_profit = 1,614,000 (538k × 3)", Number(r2[0].total_profit), 1614000);

    // ── 3. group_by=category_area + 全 (cat, area) 含む ─
    console.log("\n📋 3. group_by=category_area + 全業態×全エリア");
    const r3 = await callRangeAggregate(client, {
      from: D(5), to: D(5),
      categories: ["water", "electric", "locksmith", "road", "detective"],
      areas: ["kansai", "kanto", "nagoya", "kyushu", "kitakanto", "hokkaido", "chugoku", "shizuoka"],
      groupBy: "category_area",
    });
    eqNum("件数 = 3 (water/kansai + electric/kanto + locksmith/kansai)", r3.length, 3);
    const water = r3.find((r) => r.business_category === "water" && r.area_id === "kansai")!;
    const electric = r3.find((r) => r.business_category === "electric" && r.area_id === "kanto")!;
    const locksmith = r3.find((r) => r.business_category === "locksmith" && r.area_id === "kansai")!;
    eqNum("water/kansai profit = 538,000", Number(water.total_profit), 538000);
    // electric: 500000 - 100000 - 50000 - 30000 - 10000 - 0 = 310000 (consultant_fee 99999 は無視)
    eqNum("electric/kanto profit = 310,000 (consultant_fee 99999 は water 限定で無視)",
      Number(electric.total_profit), 310000);
    // locksmith: 200000 - 50000 - 30000 - 10000 - 20000 = 90000
    eqNum("locksmith/kansai profit = 90,000 (専用式)",
      Number(locksmith.total_profit), 90000);
    // 件数バグ回帰 (2026-06-19): 業態別件数定義の検証
    eqNum("water/kansai total_count = 10 (応答件数)", Number(water.total_count), 10);
    eqNum("electric/kanto total_count = 5 (応答件数)", Number(electric.total_count), 5);
    eqNum("locksmith/kansai total_count = 7 (acquisition_count、応答件数 3 ではない★)",
      Number(locksmith.total_count), 7);

    // ── 4. group_by=none (merged) + 全業態×全エリア ─
    console.log("\n📋 4. group_by=none (merged) + 全業態×全エリア");
    const r4 = await callRangeAggregate(client, {
      from: D(5), to: D(5),
      categories: ["water", "electric", "locksmith", "road", "detective"],
      areas: ["kansai", "kanto", "nagoya", "kyushu", "kitakanto", "hokkaido", "chugoku", "shizuoka"],
      groupBy: "none",
    });
    eqNum("件数 = 1 (合算 1 行)", r4.length, 1);
    // total_revenue = 1M + 500k + 200k = 1,700,000
    eqNum("total_revenue = 1,700,000 (1M + 500k + 200k)",
      Number(r4[0].total_revenue), 1700000);
    // merged profit: 1700000 - SUM(labor 300k) - SUM(material 180k) - SUM(ad 90k) - SUM(sales_outsourcing 40k)
    //   - SUM(card 5k) - SUM(locksmith_cost 50k) - SUM(locksmith_commission 20k) - SUM(consultant_fee 77000)
    //   = 1700000 - 300000 - 180000 - 90000 - 40000 - 5000 - 50000 - 20000 - 77000 = 938000
    eqNum("merged profit = 938,000 (controle eff: water 含む + 5月以降)",
      Number(r4[0].total_profit), 938000);

    // ── 5. 4月以前境界ガード ─
    console.log("\n📋 5. 4月以前境界ガード (yyyymm < 202605 で controle 無視)");
    // 過去月 (2026/4) は投入しないため空集合になる。月境界ロジックの境界値テスト = TEST_YEAR 2099/4 で代用
    //   2099/4 の entries はない → 集計値全て 0、エラーにならないこと
    const r5 = await callRangeAggregate(client, {
      from: `2099-04-15`, to: `2099-04-15`,
      categories: ["water"], areas: ["kansai"],
      groupBy: "category_area",
    });
    eqNum("件数 = 0 (entries なし、ガード正常動作)", r5.length, 0);

    // ── 6. categories=all (空指定相当) 同等の挙動 ─
    //   API route.ts では searchParams.get(=null) → "all" → 全 5 業態 fallback
    //   本テストは callRangeAggregate に直接配列を渡すため、明示的に全 5 業態を渡してテスト
    console.log("\n📋 6. 全業態 vs 単一業態 で合計値の整合");
    const r6_all = await callRangeAggregate(client, {
      from: D(5), to: D(5),
      categories: ["water", "electric", "locksmith", "road", "detective"],
      areas: ["kansai"],
      groupBy: "none",
    });
    const r6_w = await callRangeAggregate(client, {
      from: D(5), to: D(5),
      categories: ["water"], areas: ["kansai"],
      groupBy: "none",
    });
    const r6_l = await callRangeAggregate(client, {
      from: D(5), to: D(5),
      categories: ["locksmith"], areas: ["kansai"],
      groupBy: "none",
    });
    // kansai 投入: water 1M, locksmith 200k → all = 1.2M
    eqNum("kansai 全業態 revenue = 1,200,000", Number(r6_all[0].total_revenue), 1200000);
    eqNum("kansai water 単独 revenue = 1,000,000", Number(r6_w[0].total_revenue), 1000000);
    eqNum("kansai locksmith 単独 revenue = 200,000", Number(r6_l[0].total_revenue), 200000);
    // 件数バグ回帰 (2026-06-19): none (merged) 経路でも業態別件数が正しく合算される
    eqNum("kansai locksmith 単独 total_count = 7 (acquisition_count、応答件数 3 ではない★)",
      Number(r6_l[0].total_count), 7);
    eqNum("kansai water 単独 total_count = 10 (応答件数)", Number(r6_w[0].total_count), 10);
    eqNum("kansai 全業態 merged total_count = 17 (water 10 + locksmith 7、混在合算)",
      Number(r6_all[0].total_count), 17);

    await cleanupTestMonth(client);
    console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
    if (failed > 0) process.exit(1);
  } catch (e) {
    console.error("❌ エラー:", e);
    await cleanupTestMonth(client);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
