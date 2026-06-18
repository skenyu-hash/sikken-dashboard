// 鍵業態 入電内訳 埋め戻し (dry-run デフォルト / --apply で本適用)。
//
// 方針 (反さん承認 2026-06-18): エクセル(現場集計)を正とする。
//   - 全47日 (関西 locksmith 5/1〜5/31, 6/1〜6/16) の entries.data に
//     locksmith_car_lp_email_call_count / locksmith_inhouse_call_count を保存。
//   - call_count を「車LP+メール + インハウス」で上書き (8日のズレを含む)。
//   - その後 monthly_summaries を kansai×locksmith×5月/6月 だけ再集計。
//
// 安全策:
//   - dry-run デフォルト。--apply 無しでは1バイトも書かない。
//   - area_id='kansai' AND business_category='locksmith' AND 2026-05〜06 に厳密スコープ。
//   - 4月以前 monthly_summaries の不変を apply 前後で検証 (count + sum)。
//   - 6/17 (DB欠落) は対象外 (現場が /entry で通常入力)。
//   - 適用後 monthly_summaries を読み直し、期待値と照合。
//
// 実行:
//   dry-run : export $(grep DATABASE_URL .env.local | xargs) && npx tsx scripts/backfill-locksmith-call-breakdown.ts
//   本適用  : export $(grep DATABASE_URL .env.local | xargs) && npx tsx scripts/backfill-locksmith-call-breakdown.ts --apply

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary } from "../app/lib/monthlyAggregation";

const APPLY = process.argv.includes("--apply");

// === 現場エクセル (関西 locksmith)。左から各月1日〜。反さん提供 2026-06-18 ===
const MAY_LP =      [34,31,25,35,32,32,35,31,35,38,38,39,38,32,40,28,33,35,30,40,30,38,44,41,41,48,41,30,30,42,52];
const MAY_INHOUSE = [ 2, 4, 2, 1, 2, 0, 2, 4, 0, 2, 1, 1, 6, 1, 0, 1, 1, 1, 3, 1, 0, 3, 1, 1, 0, 4, 3, 4, 0, 2, 1];
const JUN_LP =      [42,34,34,34,32,22,22,26,40,32,33,30,31,33,34,34];      // 6/1〜6/16 (DBにある分のみ。6/17は除外)
const JUN_INHOUSE = [ 6, 3, 4, 6, 4,10, 4, 2, 5, 1, 4, 3, 3, 4, 1, 3];

const AREA = "kansai", CAT = "locksmith";

function dstr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
type Plan = { date: string; lp: number; ih: number; sum: number };
function buildPlan(): Plan[] {
  const plan: Plan[] = [];
  MAY_LP.forEach((lp, i) => plan.push({ date: dstr(2026,5,i+1), lp, ih: MAY_INHOUSE[i], sum: lp + MAY_INHOUSE[i] }));
  JUN_LP.forEach((lp, i) => plan.push({ date: dstr(2026,6,i+1), lp, ih: JUN_INHOUSE[i], sum: lp + JUN_INHOUSE[i] }));
  return plan;
}

async function snapshotPreApril(c: any) {
  const r = await c.query(
    `SELECT COUNT(*)::int AS cnt,
            COALESCE(SUM(total_revenue),0)::bigint AS rev,
            COALESCE(SUM(total_profit),0)::bigint AS prof,
            COALESCE(SUM(call_count),0)::bigint AS calls,
            MAX(updated_at) AS max_upd
     FROM monthly_summaries WHERE (year*100+month) < 202604`);
  return r.rows[0];
}

async function readMonthly(c: any, y: number, m: number) {
  const r = await c.query(
    `SELECT call_count, call_unit_price,
            locksmith_car_lp_email_call_count AS lp, locksmith_inhouse_call_count AS ih,
            total_revenue, total_profit, ad_cost, acquisition_count
     FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [AREA, CAT, y, m]);
  return r.rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL 未設定"); process.exit(1); }
  // 入力自己検算
  if (MAY_LP.length!==31||MAY_INHOUSE.length!==31||JUN_LP.length!==16||JUN_INHOUSE.length!==16) throw new Error("配列長エラー");
  const plan = buildPlan();
  console.log(`=== モード: ${APPLY ? "🔴 本適用 (--apply)" : "🟢 dry-run (書き込みなし)"} ===`);
  console.log(`対象: ${AREA} × ${CAT} × ${plan.length}日 (5/1〜5/31, 6/1〜6/16)\n`);

  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await p.connect();
  try {
    // 現状読み出し
    const cur = await c.query(
      `SELECT entry_date, COALESCE((data->>'call_count')::numeric,0)::int AS call_count
       FROM entries WHERE area_id=$1 AND business_category=$2
         AND entry_date>='2026-05-01' AND entry_date<='2026-06-16' ORDER BY entry_date`,
      [AREA, CAT]);
    const curMap = new Map<string, number>();
    for (const r of cur.rows) {
      const d = r.entry_date instanceof Date ? r.entry_date.toISOString().slice(0,10) : String(r.entry_date).slice(0,10);
      curMap.set(d, r.call_count);
    }

    // 計画と現状の突合 (全日DBに存在することを確認)
    const changed: Plan[] = [];
    for (const pl of plan) {
      if (!curMap.has(pl.date)) throw new Error(`DBに ${pl.date} の entry が無い (想定外、中断)`);
      const before = curMap.get(pl.date)!;
      if (before !== pl.sum) changed.push(pl);
    }
    console.log(`call_count が変わる日: ${changed.length}日`);
    for (const ch of changed) console.log(`  ${ch.date}: ${curMap.get(ch.date)} → ${ch.sum} (車LP ${ch.lp}+IH ${ch.ih})`);

    // 月次 before
    const mayBefore = await readMonthly(c, 2026, 5);
    const junBefore = await readMonthly(c, 2026, 6);
    console.log("\n=== monthly_summaries (before) ===");
    console.log(`  5月: call_count=${mayBefore.call_count}, lp列=${mayBefore.lp}, ih列=${mayBefore.ih}, 入電単価=${mayBefore.call_unit_price}`);
    console.log(`  6月: call_count=${junBefore.call_count}, lp列=${junBefore.lp}, ih列=${junBefore.ih}, 入電単価=${junBefore.call_unit_price}`);

    // 期待値
    const expMay = { call: 1172, lp: 1118, ih: 54 };
    const expJun = { call: 576, lp: 513, ih: 63 };
    console.log("\n=== 適用後の期待値 ===");
    console.log(`  5月: call_count=${expMay.call}, lp列=${expMay.lp}, ih列=${expMay.ih}`);
    console.log(`  6月: call_count=${expJun.call}, lp列=${expJun.lp}, ih列=${expJun.ih}`);

    const preBefore = await snapshotPreApril(c);
    console.log(`\n=== 4月以前 monthly_summaries (不変検証用 before) ===`);
    console.log(`  count=${preBefore.cnt}, sum_revenue=${preBefore.rev}, sum_profit=${preBefore.prof}, sum_call=${preBefore.calls}`);

    if (!APPLY) {
      console.log("\n🟢 dry-run 終了。書き込みは一切していません。--apply で本適用します。");
      return;
    }

    // === 本適用 ===
    console.log("\n🔴 entries.data を更新中...");
    for (const pl of plan) {
      const patch = JSON.stringify({
        locksmith_car_lp_email_call_count: pl.lp,
        locksmith_inhouse_call_count: pl.ih,
        call_count: pl.sum,
      });
      const res = await c.query(
        `UPDATE entries SET data = data || $1::jsonb, updated_at = NOW()
         WHERE area_id=$2 AND business_category=$3 AND entry_date=$4`,
        [patch, AREA, CAT, pl.date]);
      if (res.rowCount !== 1) throw new Error(`${pl.date} の UPDATE が ${res.rowCount} 行 (想定1、中断)`);
    }
    console.log(`  ${plan.length}日 更新完了。`);

    console.log("🔄 monthly_summaries 再集計中 (kansai×locksmith 5月/6月のみ)...");
    await aggregateMonthlySummary(AREA, CAT, 2026, 5);
    await aggregateMonthlySummary(AREA, CAT, 2026, 6);

    // 4月以前不変検証
    const preAfter = await snapshotPreApril(c);
    const preOk = preBefore.cnt===preAfter.cnt && String(preBefore.rev)===String(preAfter.rev) &&
                  String(preBefore.prof)===String(preAfter.prof) && String(preBefore.calls)===String(preAfter.calls) &&
                  String(preBefore.max_upd)===String(preAfter.max_upd);
    console.log(`\n=== 4月以前 不変検証 ===  ${preOk ? "✓ 完全不変" : "✗ 変化検出！"}`);
    if (!preOk) {
      console.log(`  before: ${JSON.stringify(preBefore)}`);
      console.log(`  after : ${JSON.stringify(preAfter)}`);
      throw new Error("4月以前データが変化した。重大事故。要調査。");
    }

    // 月次 after & 期待値照合
    const mayAfter = await readMonthly(c, 2026, 5);
    const junAfter = await readMonthly(c, 2026, 6);
    console.log("\n=== monthly_summaries (after) ===");
    console.log(`  5月: call_count=${mayAfter.call_count}, lp列=${mayAfter.lp}, ih列=${mayAfter.ih}, 入電単価=${mayAfter.call_unit_price}`);
    console.log(`  6月: call_count=${junAfter.call_count}, lp列=${junAfter.lp}, ih列=${junAfter.ih}, 入電単価=${junAfter.call_unit_price}`);

    const ok =
      Number(mayAfter.call_count)===expMay.call && Number(mayAfter.lp)===expMay.lp && Number(mayAfter.ih)===expMay.ih &&
      Number(junAfter.call_count)===expJun.call && Number(junAfter.lp)===expJun.lp && Number(junAfter.ih)===expJun.ih;
    // 他フィールド不変検証 (売上・粗利・広告費・獲得件数は変わらないはず)
    const sideOk =
      String(mayBefore.total_revenue)===String(mayAfter.total_revenue) && String(mayBefore.total_profit)===String(mayAfter.total_profit) &&
      String(mayBefore.ad_cost)===String(mayAfter.ad_cost) && String(mayBefore.acquisition_count)===String(mayAfter.acquisition_count) &&
      String(junBefore.total_revenue)===String(junAfter.total_revenue) && String(junBefore.total_profit)===String(junAfter.total_profit) &&
      String(junBefore.ad_cost)===String(junAfter.ad_cost) && String(junBefore.acquisition_count)===String(junAfter.acquisition_count);
    console.log(`\n=== 期待値照合: ${ok ? "✓ 一致" : "✗ 不一致"} / 入電以外の不変: ${sideOk ? "✓ 不変" : "✗ 変化検出"} ===`);
    if (!ok || !sideOk) throw new Error("適用後の値が期待と不一致。要調査。");
    console.log("\n✅ 本適用 完了。全検証通過。");
  } finally {
    c.release();
    await p.end();
  }
}
main().catch((e) => { console.error("❌", e); process.exit(1); });
