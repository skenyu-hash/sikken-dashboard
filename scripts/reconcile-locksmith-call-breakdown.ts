// 鍵業態 入電内訳 埋め戻しの照合 (dry-run、READ ONLY)。
//
// エクセル (現場集計、車LP+メール / インハウスを分離記録) の各日内訳が、
// DB の既存 call_count と一致するかを1日ずつ照合する。
//
//   一致     → 内訳を保存しても合計 (call_count) は不変。安全に埋め戻せる。
//   不一致   → エクセルとDBで日次合計がズレている。人間の判断が必要 (勝手に書かない)。
//   DB欠落   → エクセルにあるがDBにentryが無い (例: 6/17)。新規entry作成の是非は別判断。
//
// 本スクリプトは一切書き込まない。照合結果を出力するのみ。

import { Pool } from "@neondatabase/serverless";

// === 現場エクセル (関西 locksmith)。左から各月1日〜の日次。値は反さん提供 (2026-06-18) ===
const MAY_LP =      [34,31,25,35,32,32,35,31,35,38,38,39,38,32,40,28,33,35,30,40,30,38,44,41,41,48,41,30,30,42,52];
const MAY_INHOUSE = [ 2, 4, 2, 1, 2, 0, 2, 4, 0, 2, 1, 1, 6, 1, 0, 1, 1, 1, 3, 1, 0, 3, 1, 1, 0, 4, 3, 4, 0, 2, 1];
const JUN_LP =      [42,34,34,34,32,22,22,26,40,32,33,30,31,33,34,34,24];
const JUN_INHOUSE = [ 6, 3, 4, 6, 4,10, 4, 2, 5, 1, 4, 3, 3, 4, 1, 3, 3];

function dstr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

// エクセル → {date: {lp, ih}} に展開
function buildExcel(): Map<string, { lp: number; ih: number }> {
  const m = new Map<string, { lp: number; ih: number }>();
  MAY_LP.forEach((lp, i) => m.set(dstr(2026,5,i+1), { lp, ih: MAY_INHOUSE[i] }));
  JUN_LP.forEach((lp, i) => m.set(dstr(2026,6,i+1), { lp, ih: JUN_INHOUSE[i] }));
  return m;
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL 未設定"); process.exit(1); }
  // 入力整合の自己検算
  if (MAY_LP.length !== 31 || MAY_INHOUSE.length !== 31) throw new Error(`5月配列長エラー lp=${MAY_LP.length} ih=${MAY_INHOUSE.length}`);
  if (JUN_LP.length !== 17 || JUN_INHOUSE.length !== 17) throw new Error(`6月配列長エラー lp=${JUN_LP.length} ih=${JUN_INHOUSE.length}`);
  const mayLpSum = MAY_LP.reduce((a,b)=>a+b,0), mayIhSum = MAY_INHOUSE.reduce((a,b)=>a+b,0);
  const junLpSum = JUN_LP.reduce((a,b)=>a+b,0), junIhSum = JUN_INHOUSE.reduce((a,b)=>a+b,0);
  console.log("=== エクセル月合計の自己検算 ===");
  console.log(`  5月 車LP+メール=${mayLpSum} (期待1118 ${mayLpSum===1118?"✓":"✗"}), インハウス=${mayIhSum} (期待54 ${mayIhSum===54?"✓":"✗"})`);
  console.log(`  6月 車LP+メール=${junLpSum} (期待537 ${junLpSum===537?"✓":"✗"}), インハウス=${junIhSum} (期待66 ${junIhSum===66?"✓":"✗"})`);

  const excel = buildExcel();
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await p.connect();
  try {
    const rows = await c.query(
      `SELECT entry_date, COALESCE((data->>'call_count')::numeric, 0)::int AS call_count
       FROM entries
       WHERE business_category = 'locksmith' AND area_id = 'kansai'
         AND entry_date >= '2026-05-01' AND entry_date <= '2026-06-30'
       ORDER BY entry_date`
    );
    const dbMap = new Map<string, number>();
    for (const r of rows.rows) {
      const d = r.entry_date instanceof Date ? r.entry_date.toISOString().slice(0,10) : String(r.entry_date).slice(0,10);
      dbMap.set(d, r.call_count);
    }

    console.log("\n=== 1日ずつ照合 (エクセル内訳和 vs DB既存call_count) ===");
    console.log("date          車LP  IH  和(Excel)  DB現状   判定");
    let match = 0; const mismatch: string[] = []; const dbMissing: string[] = []; const excelMissing: string[] = [];
    const allDates = new Set<string>([...excel.keys(), ...dbMap.keys()]);
    const sorted = [...allDates].sort();
    for (const d of sorted) {
      const ex = excel.get(d);
      const db = dbMap.get(d);
      if (ex && db !== undefined) {
        const sum = ex.lp + ex.ih;
        const ok = sum === db;
        if (ok) match++; else mismatch.push(d);
        console.log(`${d}  ${String(ex.lp).padStart(5)} ${String(ex.ih).padStart(3)} ${String(sum).padStart(8)} ${String(db).padStart(8)}   ${ok ? "✓一致" : "✗ズレ(差"+(sum-db>0?"+":"")+(sum-db)+")"}`);
      } else if (ex && db === undefined) {
        dbMissing.push(d);
        console.log(`${d}  ${String(ex.lp).padStart(5)} ${String(ex.ih).padStart(3)} ${String(ex.lp+ex.ih).padStart(8)} ${"(無)".padStart(8)}   △DB欠落`);
      } else if (!ex && db !== undefined) {
        excelMissing.push(d);
        console.log(`${d}  ${"-".padStart(5)} ${"-".padStart(3)} ${"-".padStart(8)} ${String(db).padStart(8)}   △Excel欠落`);
      }
    }

    console.log("\n=== 集計 ===");
    console.log(`  ✓ 一致      : ${match}日 → そのまま内訳を埋め戻せる (合計不変)`);
    console.log(`  ✗ ズレ      : ${mismatch.length}日 → 人間の判断が必要: ${mismatch.join(", ") || "なし"}`);
    console.log(`  △ DB欠落    : ${dbMissing.length}日 → DBにentry無し: ${dbMissing.join(", ") || "なし"}`);
    console.log(`  △ Excel欠落 : ${excelMissing.length}日 → エクセルに無し: ${excelMissing.join(", ") || "なし"}`);
    console.log("\n本スクリプトは書き込みを一切していません (READ ONLY)。");
  } finally {
    c.release();
    await p.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
