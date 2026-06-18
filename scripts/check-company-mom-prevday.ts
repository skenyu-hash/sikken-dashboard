// 会社別ビュー 前月同日比の独立検算 (READ ONLY、書き込みなし)。
//
// feature/company-view-mom-prevday の数値根拠を、UI とは別経路で DB から再計算して照合する。
// - 当月(June 2026): monthly_summaries 直読 → companyData / companyCategoryData と同じ合算
// - 前月(May 2026): entries.data 直読 → filterEntriesByDay(<=今日) → aggregatePrevSameDay
//   （= Dashboard.tsx の companyPrevSameDayByCat / companyPrevSummary と同じ lib・同じ順序）
//
// 実行: export $(grep DATABASE_URL .env.local | xargs) && npx tsx scripts/check-company-mom-prevday.ts

import { getSql, listEntries } from "../app/lib/db";
import { resolveTotalProfit } from "../app/lib/profit";
import { aggregatePrevSameDay, filterEntriesByDay, canCompareSameDay } from "../app/lib/calculations";
import { COMPANIES } from "../app/lib/companies";

const VIEW_YEAR = 2026, VIEW_MONTH = 6;       // 当月（ヒーロー/テーブルの当月側）
const PREV_YEAR = 2026, PREV_MONTH = 5;       // 前月
const MAX_DAY = 18;                            // 2026-06-18 時点（summaryToday.getDate()）

function mom(cur: number, prev: number): string {
  if (prev <= 0) return "—（前月0のため比較不可）";
  const v = Math.round((cur - prev) / prev * 1000) / 10;
  return `${v >= 0 ? "+" : ""}${v}%  (差 ${cur - prev >= 0 ? "+" : ""}¥${Math.abs(cur - prev).toLocaleString()})`;
}

async function currentSummary(area: string, cat: string) {
  const rows = await getSql()`
    SELECT * FROM monthly_summaries
    WHERE area_id = ${area} AND year = ${VIEW_YEAR} AND month = ${VIEW_MONTH}
      AND COALESCE(business_category,'water') = ${cat} LIMIT 1`;
  return (rows[0] ?? null) as Record<string, unknown> | null;
}

async function run(companyId: string) {
  const company = COMPANIES.find(c => c.id === companyId)!;
  console.log(`\n================ ${company.name} (${companyId}) ================`);

  // ---- 当月（companyData 規則: total_revenue / resolveTotalProfit / total_count||acquisition_count / ad_cost） ----
  let curRev = 0, curProf = 0, curCnt = 0, curAd = 0;
  const curByCat: Record<string, { rev: number; prof: number; cnt: number }> = {};
  for (const { category, areaId } of company.areas) {
    const s = await currentSummary(areaId, category);
    if (!s) continue;
    const rev = Number(s.total_revenue ?? 0);
    const prof = resolveTotalProfit(s);
    const cnt = Number(s.total_count ?? 0) || Number(s.acquisition_count ?? 0);
    curRev += rev; curProf += prof; curCnt += cnt; curAd += Number(s.ad_cost ?? 0);
    const b = (curByCat[category] ??= { rev: 0, prof: 0, cnt: 0 });
    b.rev += rev; b.prof += prof; b.cnt += cnt;
  }

  // ---- 前月同日（業態ごとに entries 連結 → filterEntriesByDay → aggregatePrevSameDay） ----
  if (!canCompareSameDay(PREV_YEAR, PREV_MONTH)) { console.log("前月が比較不可（4月以前ガード）"); return; }
  const prevEntriesByCat: Record<string, any[]> = {};
  for (const { category, areaId } of company.areas) {
    const ents = await listEntries(areaId, PREV_YEAR, PREV_MONTH, category);
    (prevEntriesByCat[category] ??= []).push(...ents);
  }
  let pRev = 0, pProf = 0, pCnt = 0, pAd = 0;
  const prevByCat: Record<string, { rev: number; prof: number; cnt: number }> = {};
  for (const [cat, ents] of Object.entries(prevEntriesByCat)) {
    const filtered = filterEntriesByDay(ents, MAX_DAY);
    const agg = aggregatePrevSameDay(filtered, cat, PREV_YEAR, PREV_MONTH);
    const cnt = agg.total_count || agg.acquisition_count;
    pRev += agg.total_revenue; pProf += agg.total_profit; pAd += agg.ad_cost; pCnt += cnt;
    prevByCat[cat] = { rev: agg.total_revenue, prof: agg.total_profit, cnt };
  }

  const curUP = curCnt > 0 ? Math.round(curRev / curCnt) : 0;
  const prevUP = pCnt > 0 ? Math.round(pRev / pCnt) : 0;

  console.log("---- ヒーロー（会社合計）前月同日比 ----");
  console.log(`  売上   当月 ¥${curRev.toLocaleString()}  前月 ¥${pRev.toLocaleString()}  → ${mom(curRev, pRev)}`);
  console.log(`  粗利   当月 ¥${curProf.toLocaleString()}  前月 ¥${pProf.toLocaleString()}  → ${mom(curProf, pProf)}`);
  console.log(`  対応件数 当月 ${curCnt}件  前月 ${pCnt}件  → ${mom(curCnt, pCnt)}`);
  console.log(`  客単価 当月 ¥${curUP.toLocaleString()}  前月 ¥${prevUP.toLocaleString()}  → ${mom(curUP, prevUP)}`);
  console.log(`  広告費 当月 ¥${curAd.toLocaleString()}  前月 ¥${pAd.toLocaleString()}  → ${mom(curAd, pAd)}`);

  console.log("---- 業態別テーブル 前月同日比（売上/粗利/件数）----");
  for (const cat of Object.keys(curByCat)) {
    const c = curByCat[cat], p = prevByCat[cat] ?? { rev: 0, prof: 0, cnt: 0 };
    console.log(`  [${cat}] 売上 ${mom(c.rev, p.rev)} | 粗利 ${mom(c.prof, p.prof)} | 件数 ${mom(c.cnt, p.cnt)}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL 未設定"); process.exit(1); }
  console.log(`当月=${VIEW_YEAR}-${VIEW_MONTH} / 前月=${PREV_YEAR}-${PREV_MONTH} / 同日=${MAX_DAY}日まで`);
  for (const id of ["ulua", "rexia", "toplevel"]) await run(id);
  console.log("\n本スクリプトは書き込みを一切していません (READ ONLY)。");
  process.exit(0);
}
main().catch((e) => { console.error("❌", e); process.exit(1); });
