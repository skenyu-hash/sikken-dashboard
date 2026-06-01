// 一時調査 (READ ONLY): 日報当日粗利の検算 (CLAUDE.md §7 未解決)。
//
// 水道・関西・5/29 と 電気・関西・5/30 の entries.data を取得し、
// 全コスト項目を表示した上で実際の f30 (B-3 適用後) を計算。
// 画面値 (¥1,153,098 / ¥164,583) と一致するか確認。

import { Pool } from "@neondatabase/serverless";

type EntryRow = {
  area_id: string;
  business_category: string;
  entry_date: string;
  data: Record<string, unknown>;
};

const cases = [
  { area: "kansai", cat: "water",    date: "2026-05-29", expected: 1153098 },
  { area: "kansai", cat: "electric", date: "2026-05-30", expected: 164583  },
];

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL 未設定"); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log("🔎 日報当日粗利 逆検算 (READ ONLY)\n");

    for (const tc of cases) {
      console.log(`\n━━━ ${tc.cat} / ${tc.area} / ${tc.date} (画面値 ¥${tc.expected.toLocaleString()}) ━━━`);
      const { rows } = await client.query(
        `SELECT area_id, business_category, entry_date::text, data
         FROM entries
         WHERE area_id=$1 AND business_category=$2 AND entry_date::text=$3`,
        [tc.area, tc.cat, tc.date]
      );
      if (rows.length === 0) {
        console.log(`  ⚠️ entries 行なし。day-level なので entries が必須。`);
        continue;
      }
      const e = rows[0] as EntryRow;
      const d = e.data ?? {};

      const outSales = num(d.outsourced_sales_revenue);
      const intSales = num(d.internal_staff_revenue);
      const totalSales = outSales + intSales;
      const labor = num(d.total_labor_cost);
      const material = num(d.material_cost);
      const adCost = num(d.ad_cost);
      const outsource = num(d.sales_outsourcing_cost);
      const card = num(d.card_processing_fee);

      console.log(`\n入力値 (entries.data):`);
      console.log(`  outsourced_sales_revenue : ${outSales.toLocaleString()}`);
      console.log(`  internal_staff_revenue   : ${intSales.toLocaleString()}`);
      console.log(`  → 全体売上 (f1)         : ${totalSales.toLocaleString()}`);
      console.log(`  total_labor_cost (f11)   : ${labor.toLocaleString()}`);
      console.log(`  material_cost (f12)      : ${material.toLocaleString()}`);
      console.log(`  ad_cost (f15)            : ${adCost.toLocaleString()}   ← 手計算で忘れがち`);
      console.log(`  sales_outsourcing_cost(f13): ${outsource.toLocaleString()}`);
      console.log(`  card_processing_fee (f14): ${card.toLocaleString()}`);

      // c95-B-3 控除 (water + yyyymm >= 202605 のみ非 0)
      const yyyymm = Number(tc.date.slice(0,4)) * 100 + Number(tc.date.slice(5,7));
      const rate = (tc.cat === "water" && yyyymm >= 202605) ? 0.077 : 0;
      const fee = Math.round(totalSales * rate); // 表示時 Math.round 想定
      const profitJsRaw = totalSales - labor - material - adCost - outsource - card - (totalSales * rate); // floating
      const profitDisplayRound = Math.round(profitJsRaw);

      // 手計算 (CLAUDE.md §7 のスタイル、ad_cost 抜き)
      const manualMissingAd = totalSales - labor - material - outsource - card;

      console.log(`\n計算式:`);
      console.log(`  実式 (f30 B-3) = f1 - f11 - f12 - f15 - f13 - f14 - fee`);
      console.log(`  ad_cost: ${adCost.toLocaleString()}`);
      console.log(`  controle fee (${tc.cat} 5月以降 ${rate ? "あり" : "なし"}): ${fee.toLocaleString()}`);
      console.log(`  実 profit (浮動小数): ${profitJsRaw.toFixed(2)}`);
      console.log(`  実 profit (Math.round): ${profitDisplayRound.toLocaleString()}`);
      console.log(`  画面値                : ${tc.expected.toLocaleString()}`);
      console.log(`  → 実 profit ≒ 画面値 ? ${Math.abs(profitDisplayRound - tc.expected) <= 1 ? "✅ 一致" : "❌ 不一致"}`);
      console.log(`\n  手計算 (ad_cost 抜き、CLAUDE.md §7): ${manualMissingAd.toLocaleString()}`);
      console.log(`  → 手計算と画面値の差: ${(manualMissingAd - tc.expected).toLocaleString()}`);
      console.log(`  → 内訳: ad_cost ${adCost.toLocaleString()} + fee ${fee.toLocaleString()} = ${(adCost + fee).toLocaleString()}`);
    }

    console.log("\n");
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
