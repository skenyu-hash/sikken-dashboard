// PR c95-A-2 純関数テスト: HELP 担当者配列の派生計算・整形ヘルパー (helpStaffUtils.ts) 検証。
//
// 単独実行: npm run test:integration:c95-a-2-help-staff (DB 不要、純関数)
//
// 検証範囲は本 PR の新規面に集約:
//   1. sumHelpSales / sumHelpCount / sumHelpClose: 配列 SUM + InputValue ("") 0 化
//   2. helpUnitPrice: 件数 0 のとき divide-by-zero ガード
//   3. isHelpRowEmpty / helpRowHasNumber: G4 G5 判定基準
//   4. cleanHelpStaffForSave: 空行除外 + 数値あり氏名なし検知 + 派生 SUM (G1 案 b)
//   5. cleanHelpStaffForSave の冪等性 / 元配列を破壊しないこと

import {
  sumHelpSales, sumHelpCount, sumHelpClose, helpUnitPrice,
  isHelpRowEmpty, helpRowHasNumber, cleanHelpStaffForSave,
} from "../app/entry/lib/helpStaffUtils";
import type { HelpStaffEntry } from "../app/entry/types";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); failed++; }
}
function eq(name: string, actual: unknown, expected: unknown) {
  ok(`${name} (= ${JSON.stringify(expected)})`, actual === expected);
  if (actual !== expected) console.log(`     got ${JSON.stringify(actual)}`);
}

const row = (name: string, sales: number | "", count: number | "", close: number | ""): HelpStaffEntry => ({
  staff_name: name, help_sales: sales, help_count: count, help_close_count: close,
});

console.log("🧪 PR c95-A-2: helpStaffUtils 純関数検証\n");

// ── 1. SUM 系 ─────────────────────────────────────────
console.log("📋 1. sumHelpSales / sumHelpCount / sumHelpClose");
const rows1: HelpStaffEntry[] = [
  row("田中", 120000, 3, 2),
  row("佐藤", 80000, 2, 1),
  row("鈴木", "", "", ""),    // 空 ("") は 0 化
];
eq("sumHelpSales (120000 + 80000 + 0)", sumHelpSales(rows1), 200000);
eq("sumHelpCount (3 + 2 + 0)", sumHelpCount(rows1), 5);
eq("sumHelpClose (2 + 1 + 0)", sumHelpClose(rows1), 3);
eq("sumHelpSales([])", sumHelpSales([]), 0);

// ── 2. helpUnitPrice + divide-by-zero ガード ─────────
console.log("\n📋 2. helpUnitPrice (件数 0 でガード)");
eq("helpUnitPrice (200000/5)", helpUnitPrice(rows1), 40000);
eq("helpUnitPrice 件数 0 で 0", helpUnitPrice([row("田中", 100000, 0, 0)]), 0);
eq("helpUnitPrice 空配列で 0", helpUnitPrice([]), 0);

// ── 3. isHelpRowEmpty / helpRowHasNumber ─────────────
console.log("\n📋 3. isHelpRowEmpty / helpRowHasNumber");
ok("isHelpRowEmpty: 全空", isHelpRowEmpty(row("", "", "", "")));
ok("isHelpRowEmpty: 空白名のみ (trim 後)", isHelpRowEmpty(row("   ", "", "", "")));
ok("isHelpRowEmpty: 氏名あり (数値なし) は空ではない", !isHelpRowEmpty(row("田中", "", "", "")));
ok("isHelpRowEmpty: 数値あり (氏名なし) は空ではない", !isHelpRowEmpty(row("", 100, "", "")));
ok("helpRowHasNumber: いずれか数値あり", helpRowHasNumber(row("", 0, 1, 0)));
ok("helpRowHasNumber: 数値全部 0 は false", !helpRowHasNumber(row("田中", 0, 0, 0)));
ok("helpRowHasNumber: 数値全部 \"\" は false", !helpRowHasNumber(row("田中", "", "", "")));

// ── 4. cleanHelpStaffForSave: 空行除外 + G5 検知 + 派生 SUM ──
console.log("\n📋 4. cleanHelpStaffForSave (G4 + G5 + G1 案 b 派生 SUM)");
const result1 = cleanHelpStaffForSave([
  row("田中", 120000, 3, 2),
  row("", "", "", ""),       // G4: drop (全空)
  row("佐藤", 80000, 2, 1),
  row("名前のみ", "", "", ""), // 名前あり数値なし → 残す (空ではない、エラーでもない)
]);
eq("cleaned 件数 (空 1 行除外で 3)", result1.cleaned.length, 3);
eq("nameMissingIndex (該当なしで -1)", result1.nameMissingIndex, -1);
eq("sumSales (120000 + 80000 + 0)", result1.sumSales, 200000);
eq("sumCount (3 + 2 + 0)", result1.sumCount, 5);
eq("cleaned[0].staff_name trim", result1.cleaned[0].staff_name, "田中");
eq("cleaned[2].staff_name (名前のみ保持)", result1.cleaned[2].staff_name, "名前のみ");

// G5: 数値あり氏名なし → nameMissingIndex
console.log("\n📋 5. cleanHelpStaffForSave: G5 数値あり氏名なし検知");
const result2 = cleanHelpStaffForSave([
  row("田中", 120000, 3, 2),
  row("", 50000, 1, 0),  // 数値あり氏名なし → エラー (index 1 in cleaned)
]);
eq("nameMissingIndex (cleaned で index 1)", result2.nameMissingIndex, 1);

// 全空 + 名前のみは入っても nameMissingIndex なし (数値なしなら氏名不要)
const result3 = cleanHelpStaffForSave([
  row("田中", "", "", ""),
]);
eq("名前のみ行は nameMissingIndex なし", result3.nameMissingIndex, -1);
eq("名前のみ行も cleaned に残る", result3.cleaned.length, 1);

// ── 5. 冪等性 + 元配列を破壊しない ────────────────────
console.log("\n📋 6. 冪等性 / 元配列非破壊");
const original: HelpStaffEntry[] = [row("田中", 100, 1, 1)];
const originalSnapshot = JSON.stringify(original);
const r1 = cleanHelpStaffForSave(original);
const r2 = cleanHelpStaffForSave(original);
ok("元配列を破壊しない", JSON.stringify(original) === originalSnapshot);
eq("再実行で同じ cleaned 件数 (冪等)", r1.cleaned.length, r2.cleaned.length);
eq("再実行で同じ sumSales (冪等)", r1.sumSales, r2.sumSales);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
