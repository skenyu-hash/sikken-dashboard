// PR c95-B-1 → c95-D-5 純関数テスト: consultantFee.ts の現状検証。
//
// 単独実行: npm run test:integration:c95-b-consultant-fee (DB 不要、純関数)
//
// c95-D-5 (slice 5) で CONSULTANT_FEE_RATE.water を 0.077 → 0 に変更し、自動計算を無効化。
// 関数本体 consultantFee() は untouch だが、全業態 rate=0 のため戻り値は常に 0。
// slice 6 で本ファイル / consultantFee.ts ごと完全撤去予定。それまでの過渡期 lib として
// 「rate が全業態 0 で固定 / 関数戻り値が常に 0 / 月境界定数 202605 のみ流用」を検証。

import {
  CONSULTANT_FEE_RATE,
  CONSULTANT_FEE_APPLIED_FROM_YYYYMM,
  consultantFee,
  toYyyyMm,
} from "../app/lib/consultantFee";

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

console.log("🧪 PR c95-D-5: consultantFee 純関数検証 (rate=0 で自動計算無効化を確認)\n");

// ── 1. 業態別率マスター (c95-D-5 で全 0 化) ──────────────
console.log("📋 1. CONSULTANT_FEE_RATE (c95-D-5 で全業態 0 固定)");
eq("water 率 = 0 (c95-D-5 で 0.077 → 0 化、自動計算無効化)", CONSULTANT_FEE_RATE.water, 0);
eq("electric 率 = 0", CONSULTANT_FEE_RATE.electric, 0);
eq("locksmith 率 = 0", CONSULTANT_FEE_RATE.locksmith, 0);
eq("road 率 = 0", CONSULTANT_FEE_RATE.road, 0);
eq("detective 率 = 0", CONSULTANT_FEE_RATE.detective, 0);
eq("業態 key 数 = 5", Object.keys(CONSULTANT_FEE_RATE).length, 5);

// ── 2. 月境界定数 (c95-D-5 でも維持、絶対不変ガード用) ──────
console.log("\n📋 2. CONSULTANT_FEE_APPLIED_FROM_YYYYMM (4 月以前ガード用、維持)");
eq("適用開始 = 202605 (2026/5)", CONSULTANT_FEE_APPLIED_FROM_YYYYMM, 202605);

// ── 3. toYyyyMm helper ───────────────────────────────
console.log("\n📋 3. toYyyyMm (year, month → year*100+month)");
eq("2026/5 → 202605", toYyyyMm(2026, 5), 202605);
eq("2026/4 → 202604", toYyyyMm(2026, 4), 202604);
eq("2026/12 → 202612", toYyyyMm(2026, 12), 202612);
eq("2025/1 → 202501", toYyyyMm(2025, 1), 202501);

// ── 4. consultantFee 戻り値 = 全業態 0 (rate=0 のため) ───
console.log("\n📋 4. consultantFee 戻り値 (rate=0 のため全業態で常に 0)");
eq("water 2026/5 → 0 (旧仕様 77000)", consultantFee("water", 1_000_000, 202605), 0);
eq("water 2026/6 → 0", consultantFee("water", 1_000_000, 202606), 0);
eq("water 2027/3 → 0", consultantFee("water", 1_000_000, 202703), 0);
eq("water 2026/4 → 0 (境界外、元から 0)", consultantFee("water", 1_000_000, 202604), 0);
eq("water 2025/12 → 0 (過去、元から 0)", consultantFee("water", 1_000_000, 202512), 0);
eq("electric 2026/5 → 0", consultantFee("electric", 1_000_000, 202605), 0);
eq("locksmith 2026/5 → 0", consultantFee("locksmith", 1_000_000, 202605), 0);
eq("road 2026/5 → 0", consultantFee("road", 1_000_000, 202605), 0);
eq("detective 2026/5 → 0", consultantFee("detective", 1_000_000, 202605), 0);

// ── 5. 異常値ガード (rate=0 でも追加保護として機能) ───────
console.log("\n📋 5. 異常値ガード (rate=0 でも 0 返却の安定性)");
eq("revenue = 0 → 0", consultantFee("water", 0, 202605), 0);
eq("revenue = -100 (負値) → 0", consultantFee("water", -100, 202605), 0);
eq("revenue = NaN → 0", consultantFee("water", NaN, 202605), 0);
eq("revenue = Infinity → 0", consultantFee("water", Infinity, 202605), 0);
eq("revenue = -Infinity → 0", consultantFee("water", -Infinity, 202605), 0);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
