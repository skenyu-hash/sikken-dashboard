// 単独実行: npm run test:targets-row
// year-view スライス2: rowToTargets (targets テーブル行 → Targets 型) の純粋マッパー検証。
// db.ts getTargets のインライン変換と同一マッピングであることを確認する。

import { rowToTargets } from "../app/lib/targetsRow";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`❌ ${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
}

// ===== 文字列 (Neon NUMERIC/BIGINT) も Number 化 =====
{
  const t = rowToTargets({
    target_sales: "8600", target_profit: "3000", target_count: 560,
    target_ad_cost: "2000", target_call_count: "1200",
    target_help_sales: 100, target_help_count: 5,
    target_meeting_count: 3, target_switchboard_count: 7,
  });
  eq(t.targetSales, 8600, "target_sales 文字列を数値化");
  eq(t.targetProfit, 3000, "target_profit");
  eq(t.targetCount, 560, "target_count");
  eq(t.targetAdCost, 2000, "target_ad_cost");
  eq(t.targetCallCount, 1200, "target_call_count 文字列を数値化");
  eq(t.targetMeetingCount, 3, "target_meeting_count (探偵)");
  eq(t.targetSwitchboardCount, 7, "target_switchboard_count (電気)");
  eq(typeof t.targetSales, "number", "結果は number 型 (連結でない)");
}

// ===== 欠損列は 0 (null/undefined セーフ) =====
{
  const t = rowToTargets({ target_sales: 1000 });
  eq(t.targetSales, 1000, "存在する列");
  eq(t.targetProfit, 0, "欠損列は 0");
  eq(t.targetCpa, 0, "欠損 target_cpa は 0");
  eq(t.targetHelpRate, 0, "欠損 target_help_rate は 0");
}

// ===== 空行 → 全 0 =====
{
  const t = rowToTargets({});
  eq(t.targetSales, 0, "空行: targetSales=0");
  eq(t.targetCount, 0, "空行: targetCount=0");
  eq(t.targetAdRate, 0, "空行: targetAdRate=0");
}

// ===== 不正値 (NaN になる文字列) は 0 にフォールバック =====
{
  const t = rowToTargets({ target_sales: "abc", target_count: null });
  eq(t.targetSales, 0, "NaN 文字列 → 0");
  eq(t.targetCount, 0, "null → 0");
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
