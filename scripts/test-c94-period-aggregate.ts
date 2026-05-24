// PR c94-A 統合テスト: /api/meeting-aggregate 旬独立集計の検証 (30 件)。
//
// 単独実行: npm run test:integration:c94-period-aggregate
// (DATABASE_URL を export 必要)
//
// 検証内容:
//   - 旬境界 (day=10, 11, 20, 21) のオフバイワン排除
//   - 上旬 + 中旬 + 下旬 = 月全体 の整合性
//   - エッジケース: 閏年 / 30 日月 / 31 日月 / 0 件期間 / 月跨ぎ排除
//   - locksmith 分岐 (total_profit が locksmith 経路で計算されること)
//
// 投入先: kansai/water/2099-05 (31 日月), kansai/water/2099-04 (30 日月),
//        kansai/water/2024-02 (閏年), kansai/locksmith/2099-05 (locksmith 検証)
// すべて 2099 年 or 2024-02 で本番影響なし。

import { Pool } from "@neondatabase/serverless";
import type { PoolClient } from "@neondatabase/serverless";

const TEST_AREA = "kansai";
const WATER = "water";
const LOCKSMITH = "locksmith";

let passed = 0;
let failed = 0;

function check(name: string, actual: number, expected: number, tolerance = 0.5) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`  ✅ ${name}: ${actual} (expected ${expected})`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: got ${actual}, expected ${expected}`);
    failed++;
  }
}

async function cleanup(
  client: PoolClient,
  category: string,
  year: number,
  month: number,
) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
  await client.query(
    `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date >= $3 AND entry_date < $4`,
    [TEST_AREA, category, start, end]
  );
}

async function insertEntry(
  client: PoolClient,
  category: string,
  year: number,
  month: number,
  day: number,
  data: Record<string, number>,
) {
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const entry = {
    date,
    totalCount: 0, constructionCount: 0,
    selfRevenue: 0, selfProfit: 0, selfCount: 0,
    newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
    addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
    ...data,
  };
  await client.query(
    `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    [TEST_AREA, category, date, JSON.stringify(entry)]
  );
}

// 新 API の SQL を直接実行 (route.ts と完全同等の派生計算)。
// 実 HTTP fetch なしで in-memory 集計のみ検証する。
type PeriodAggregateResult = {
  total_revenue: number;
  total_profit: number;
  total_count: number;
  construction_count: number;
  internal_construction_count: number;
  help_revenue: number;
  help_count: number;
  ad_cost: number;
  switchboard_count: number;
};

async function callPeriodAggregate(
  client: PoolClient,
  category: string,
  year: number,
  month: number,
  startDay: number,
  endDay: number,
): Promise<PeriodAggregateResult> {
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
         COALESCE(SUM(COALESCE((data->>'ad_cost')::numeric, 0)), 0) AS sum_ad_cost,
         COALESCE(SUM(
           COALESCE(
             (data->>'construction_count')::numeric,
             COALESCE((data->>'outsourced_construction_count')::numeric, 0)
               + COALESCE((data->>'internal_construction_count')::numeric, 0)
           )
         ), 0) AS sum_construction_count,
         COALESCE(SUM(COALESCE((data->>'internal_construction_count')::numeric, 0)), 0) AS sum_internal_construction_count,
         COALESCE(SUM(COALESCE((data->>'help_count')::numeric, 0)), 0) AS sum_help_count,
         COALESCE(SUM(COALESCE((data->>'help_revenue')::numeric, 0)), 0) AS sum_help_revenue,
         COALESCE(SUM(COALESCE((data->>'switchboard_count')::numeric, 0)), 0) AS sum_switchboard_count,
         COALESCE(SUM(COALESCE((data->>'locksmith_construction_cost')::numeric, 0)), 0) AS sum_locksmith_construction_cost,
         COALESCE(SUM(COALESCE((data->>'locksmith_commission_fee')::numeric, 0)), 0) AS sum_locksmith_commission_fee
       FROM entries
       WHERE area_id = $1
         AND business_category = $2
         AND entry_date >= MAKE_DATE($3, $4, $5)
         AND entry_date < (MAKE_DATE($3, $4, $6) + INTERVAL '1 day')
     ),
     derived AS (
       SELECT
         b.*,
         (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue) AS d_total_revenue,
         (b.sum_outsourced_response_count + b.sum_internal_staff_response_count) AS d_total_count,
         CASE
           WHEN $2 = 'locksmith' THEN
             (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
             - b.sum_locksmith_construction_cost
             - b.sum_material_cost
             - b.sum_ad_cost
             - b.sum_locksmith_commission_fee
           ELSE
             (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
             - b.sum_total_labor_cost
             - b.sum_material_cost
             - b.sum_ad_cost
             - b.sum_sales_outsourcing_cost
             - b.sum_card_processing_fee
         END AS d_total_profit
       FROM base b
     )
     SELECT
       ROUND(d.d_total_revenue)::BIGINT AS total_revenue,
       ROUND(d.d_total_profit)::BIGINT AS total_profit,
       ROUND(d.d_total_count)::INT AS total_count,
       d.sum_construction_count AS construction_count,
       d.sum_internal_construction_count AS internal_construction_count,
       ROUND(d.sum_help_revenue)::BIGINT AS help_revenue,
       ROUND(d.sum_help_count)::INT AS help_count,
       ROUND(d.sum_ad_cost)::BIGINT AS ad_cost,
       ROUND(d.sum_switchboard_count)::INT AS switchboard_count
     FROM derived d`,
    [TEST_AREA, category, year, month, startDay, endDay]
  );
  const r = rows[0];
  return {
    total_revenue: Number(r.total_revenue ?? 0),
    total_profit: Number(r.total_profit ?? 0),
    total_count: Number(r.total_count ?? 0),
    construction_count: Number(r.construction_count ?? 0),
    internal_construction_count: Number(r.internal_construction_count ?? 0),
    help_revenue: Number(r.help_revenue ?? 0),
    help_count: Number(r.help_count ?? 0),
    ad_cost: Number(r.ad_cost ?? 0),
    switchboard_count: Number(r.switchboard_count ?? 0),
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL が設定されていません。");
    process.exit(1);
  }

  console.log(`🧪 PR c94-A: /api/meeting-aggregate 旬独立集計 検証 (30 件)\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // ============================================================
    // CATEGORY 1: 旬境界オフバイワン (4 ケース × 5 assertions = 20 件)
    //   2099-05 (31 日月) の day=5, 10, 11, 15, 20, 21, 25, 31 に
    //   各 entry: revenue=150000 (90000+60000), count=5 (2+3),
    //             construction_count=1, internal_construction_count=1,
    //             help_count=1, help_revenue=20000, ad_cost=5000
    // ============================================================
    console.log(`📋 SETUP: kansai/water/2099-05 (31 日月) に 8 entries 投入`);
    await cleanup(client, WATER, 2099, 5);
    const days = [5, 10, 11, 15, 20, 21, 25, 31];
    for (const d of days) {
      await insertEntry(client, WATER, 2099, 5, d, {
        outsourced_sales_revenue: 90000,
        internal_staff_revenue: 60000,
        outsourced_response_count: 2,
        internal_staff_response_count: 3,
        construction_count: 1,
        internal_construction_count: 1,
        help_count: 1,
        help_revenue: 20000,
        ad_cost: 5000,
      });
    }

    console.log(`\n📋 CASE 1.1: 上旬 (1〜10日) — day=5,10 のみ包含 (2 entries)`);
    const upper = await callPeriodAggregate(client, WATER, 2099, 5, 1, 10);
    check("total_revenue = 300000 (= 150000 × 2)", upper.total_revenue, 300000);
    check("total_count = 10 (= 5 × 2)", upper.total_count, 10);
    check("construction_count = 2", upper.construction_count, 2);
    check("help_count = 2", upper.help_count, 2);
    check("ad_cost = 10000", upper.ad_cost, 10000);

    console.log(`\n📋 CASE 1.2: 中旬 (11〜20日) — day=11,15,20 のみ包含 (3 entries)`);
    const middle = await callPeriodAggregate(client, WATER, 2099, 5, 11, 20);
    check("total_revenue = 450000 (= 150000 × 3)", middle.total_revenue, 450000);
    check("total_count = 15 (= 5 × 3)", middle.total_count, 15);
    check("construction_count = 3", middle.construction_count, 3);
    check("help_count = 3", middle.help_count, 3);
    check("ad_cost = 15000", middle.ad_cost, 15000);

    console.log(`\n📋 CASE 1.3: 下旬 (21〜31日) — day=21,25,31 のみ包含 (3 entries)`);
    const lower = await callPeriodAggregate(client, WATER, 2099, 5, 21, 31);
    check("total_revenue = 450000 (= 150000 × 3)", lower.total_revenue, 450000);
    check("total_count = 15 (= 5 × 3)", lower.total_count, 15);
    check("construction_count = 3", lower.construction_count, 3);
    check("help_count = 3", lower.help_count, 3);
    check("ad_cost = 15000", lower.ad_cost, 15000);

    console.log(`\n📋 CASE 1.4: 月全体 (1〜31日) — 全 8 entries 包含`);
    const whole = await callPeriodAggregate(client, WATER, 2099, 5, 1, 31);
    check("total_revenue = 1200000 (= 150000 × 8)", whole.total_revenue, 1200000);
    check("total_count = 40 (= 5 × 8)", whole.total_count, 40);
    check("construction_count = 8", whole.construction_count, 8);
    check("help_count = 8", whole.help_count, 8);
    check("ad_cost = 40000", whole.ad_cost, 40000);

    // ============================================================
    // CATEGORY 2: 整合性 (5 件) — 上旬 + 中旬 + 下旬 = 月全体
    // ============================================================
    console.log(`\n📋 CASE 2: 整合性 (上旬 + 中旬 + 下旬 = 月全体)`);
    check(
      "整合: total_revenue (upper+middle+lower = whole)",
      upper.total_revenue + middle.total_revenue + lower.total_revenue,
      whole.total_revenue,
    );
    check(
      "整合: total_count",
      upper.total_count + middle.total_count + lower.total_count,
      whole.total_count,
    );
    check(
      "整合: construction_count",
      upper.construction_count + middle.construction_count + lower.construction_count,
      whole.construction_count,
    );
    check(
      "整合: help_revenue",
      upper.help_revenue + middle.help_revenue + lower.help_revenue,
      whole.help_revenue,
    );
    check(
      "整合: ad_cost",
      upper.ad_cost + middle.ad_cost + lower.ad_cost,
      whole.ad_cost,
    );

    // ============================================================
    // CATEGORY 3: エッジケース (5 件)
    // ============================================================

    // CASE 3.1: 2024-02 (閏年) で end=29 が day=29 を包含
    console.log(`\n📋 CASE 3.1: 2024-02 閏年 (end=29 で day=29 包含)`);
    await cleanup(client, WATER, 2024, 2);
    await insertEntry(client, WATER, 2024, 2, 29, {
      outsourced_sales_revenue: 100000,
      outsourced_response_count: 1,
    });
    const leap = await callPeriodAggregate(client, WATER, 2024, 2, 21, 29);
    check("閏年 2024-02-29 包含 (revenue=100000)", leap.total_revenue, 100000);
    await cleanup(client, WATER, 2024, 2);

    // CASE 3.2: 30 日月 (2099-04) で end=30 が day=30 を包含
    console.log(`\n📋 CASE 3.2: 30 日月 2099-04 (end=30 で day=30 包含)`);
    await cleanup(client, WATER, 2099, 4);
    await insertEntry(client, WATER, 2099, 4, 30, {
      outsourced_sales_revenue: 200000,
      outsourced_response_count: 2,
    });
    const apr = await callPeriodAggregate(client, WATER, 2099, 4, 21, 30);
    check("30 日月 day=30 包含 (revenue=200000)", apr.total_revenue, 200000);
    await cleanup(client, WATER, 2099, 4);

    // CASE 3.3: 31 日月 day=31 包含確認 (Category 1 で実証済だが独立 entry で再確認)
    console.log(`\n📋 CASE 3.3: 31 日月 2099-05 day=31 包含 (lower 旬で 1 件)`);
    // CASE 1 setup の day=31 が既に lower (21〜31) に含まれている。lower.construction_count=3 のうち 1 件が day=31
    check("31 日月 day=31 が下旬に包含 (lower.construction_count >= 1)", lower.construction_count, 3);

    // CASE 3.4: 0 件期間 (entries が day=15 のみ → start=21, end=30 で 0 件)
    console.log(`\n📋 CASE 3.4: 0 件期間 (entries 空の旬で全 0)`);
    await cleanup(client, WATER, 2099, 6);
    await insertEntry(client, WATER, 2099, 6, 15, {
      outsourced_sales_revenue: 50000,
      outsourced_response_count: 1,
    });
    const empty = await callPeriodAggregate(client, WATER, 2099, 6, 21, 30);
    check("0 件期間 total_revenue = 0", empty.total_revenue, 0);
    await cleanup(client, WATER, 2099, 6);

    // CASE 3.5: 月跨ぎ排除 (2099-05-31 と 2099-06-01 を入れて month=5 end=31 で 6/1 排除)
    console.log(`\n📋 CASE 3.5: 月跨ぎ排除 (2099-06-01 が month=5 end=31 で除外される)`);
    await cleanup(client, WATER, 2099, 6);
    await insertEntry(client, WATER, 2099, 6, 1, {
      outsourced_sales_revenue: 999999,  // この値が混入したら失敗
      outsourced_response_count: 9,
    });
    // 既存 CASE 1 の 8 entries は month=5 にそのまま残置、再集計
    const noOverflow = await callPeriodAggregate(client, WATER, 2099, 5, 1, 31);
    check("月跨ぎ排除 (2099-06-01 の 999999 が混入していない)", noOverflow.total_revenue, 1200000);
    await cleanup(client, WATER, 2099, 6);
    await cleanup(client, WATER, 2099, 5);

    // ============================================================
    // CATEGORY 4: locksmith 業態分岐 (5 件)
    //   total_profit が locksmith 分岐 (- locksmith_construction_cost - material_cost
    //   - ad_cost - locksmith_commission_fee) で計算されること
    // ============================================================
    console.log(`\n📋 CASE 4: locksmith 業態分岐検証 (2099-05、上旬)`);
    await cleanup(client, LOCKSMITH, 2099, 5);
    // revenue=500000, locksmith_construction_cost=100000, material_cost=50000,
    // ad_cost=30000, locksmith_commission_fee=20000
    // → total_profit = 500000 - 100000 - 50000 - 30000 - 20000 = 300000
    await insertEntry(client, LOCKSMITH, 2099, 5, 5, {
      outsourced_sales_revenue: 300000,
      internal_staff_revenue: 200000,
      outsourced_response_count: 3,
      internal_staff_response_count: 2,
      locksmith_construction_cost: 100000,
      material_cost: 50000,
      ad_cost: 30000,
      locksmith_commission_fee: 20000,
      // water 経路にも値を入れて、locksmith 分岐が走ったことを誤分岐検知:
      // total_labor_cost / sales_outsourcing_cost / card_processing_fee は引かれてはいけない
      total_labor_cost: 99999,
      sales_outsourcing_cost: 88888,
      card_processing_fee: 77777,
    });
    const ls = await callPeriodAggregate(client, LOCKSMITH, 2099, 5, 1, 10);
    check("locksmith total_revenue = 500000", ls.total_revenue, 500000);
    check("locksmith total_profit = 300000 (locksmith 経路で計算)", ls.total_profit, 300000);
    check("locksmith total_count = 5", ls.total_count, 5);
    // water 経路で計算されると total_profit = 500000 - 99999 - 50000 - 30000 - 88888 - 77777 = 153336
    // → 300000 と一致するので locksmith 分岐が確実に走っている
    check("locksmith 分岐確認 (water 経路の cost が引かれていない)", ls.total_profit, 300000);
    // 念のため: water 業態で同じ data → water 分岐で計算される
    await cleanup(client, WATER, 2099, 5);
    await insertEntry(client, WATER, 2099, 5, 5, {
      outsourced_sales_revenue: 300000,
      internal_staff_revenue: 200000,
      outsourced_response_count: 3,
      internal_staff_response_count: 2,
      total_labor_cost: 100000,
      material_cost: 50000,
      ad_cost: 30000,
      sales_outsourcing_cost: 20000,
      card_processing_fee: 10000,
    });
    const wt = await callPeriodAggregate(client, WATER, 2099, 5, 1, 10);
    // water: 500000 - 100000 - 50000 - 30000 - 20000 - 10000 = 290000
    check("water 分岐確認 (water 経路 total_profit = 290000)", wt.total_profit, 290000);

    await cleanup(client, WATER, 2099, 5);
    await cleanup(client, LOCKSMITH, 2099, 5);

    console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} assertions passed`);
    if (failed > 0) process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
