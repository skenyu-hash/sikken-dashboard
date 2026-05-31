// PR c95-B-1 純関数テスト: consultantFee.ts (率マスター / 月境界 / 業態別 / 異常値ガード)。
//
// 単独実行: npm run test:integration:c95-b-consultant-fee (DB 不要、純関数)
//
// 検証範囲 (c95-B-1 の追加面):
//   1. CONSULTANT_FEE_RATE: water=0.077、他業態=0、5 業態すべて key 存在
//   2. CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605
//   3. toYyyyMm helper (year, month → year*100+month)
//   4. consultantFee 月境界 (>= 202605 で適用、< 202605 で 0)
//   5. consultantFee 業態別 (water だけ正、他 4 業態は 0)
//   6. 0 円ガード / 負値ガード / NaN・Infinity ガード
//   7. 浮動小数精度 (基本サイズ、想定範囲の数値)

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
function approx(name: string, actual: number, expected: number, tol = 0.001) {
  const isOk = Math.abs(actual - expected) <= tol;
  ok(`${name} ≈ ${expected}`, isOk);
  if (!isOk) console.log(`     got ${JSON.stringify(actual)}`);
}

console.log("🧪 PR c95-B-1: consultantFee 純関数検証\n");

// ── 1. 業態別率マスター (G-2) ─────────────────────────
console.log("📋 1. CONSULTANT_FEE_RATE (業態別率マスター)");
eq("water 率 = 0.077 (7.7%)", CONSULTANT_FEE_RATE.water, 0.077);
eq("electric 率 = 0", CONSULTANT_FEE_RATE.electric, 0);
eq("locksmith 率 = 0", CONSULTANT_FEE_RATE.locksmith, 0);
eq("road 率 = 0", CONSULTANT_FEE_RATE.road, 0);
eq("detective 率 = 0", CONSULTANT_FEE_RATE.detective, 0);
eq("業態 key 数 = 5", Object.keys(CONSULTANT_FEE_RATE).length, 5);

// ── 2. 月境界定数 (G-1) ──────────────────────────────
console.log("\n📋 2. CONSULTANT_FEE_APPLIED_FROM_YYYYMM (適用月境界)");
eq("適用開始 = 202605 (2026/5)", CONSULTANT_FEE_APPLIED_FROM_YYYYMM, 202605);

// ── 3. toYyyyMm helper ───────────────────────────────
console.log("\n📋 3. toYyyyMm (year, month → year*100+month)");
eq("2026/5 → 202605", toYyyyMm(2026, 5), 202605);
eq("2026/4 → 202604", toYyyyMm(2026, 4), 202604);
eq("2026/12 → 202612", toYyyyMm(2026, 12), 202612);
eq("2025/1 → 202501", toYyyyMm(2025, 1), 202501);

// ── 4. consultantFee 月境界 (water で検証) ───────────
console.log("\n📋 4. consultantFee 月境界 (water)");
approx("water 2026/5 (= 境界、適用)", consultantFee("water", 1_000_000, 202605), 77000);
approx("water 2026/6 (境界後、適用)", consultantFee("water", 1_000_000, 202606), 77000);
eq("water 2026/4 (境界直前、控除なし) = 0", consultantFee("water", 1_000_000, 202604), 0);
eq("water 2026/1 (過去) = 0", consultantFee("water", 1_000_000, 202601), 0);
eq("water 2025/12 (前年) = 0", consultantFee("water", 1_000_000, 202512), 0);
approx("water 2027/3 (将来) = 適用", consultantFee("water", 1_000_000, 202703), 77000);

// ── 5. 業態別 (5月以降で water 以外は常に 0) ─────────
console.log("\n📋 5. 業態別 (2026/5 以降で water のみ正、他 4 業態は 0)");
approx("water 2026/5 → 77000", consultantFee("water", 1_000_000, 202605), 77000);
eq("electric 2026/5 → 0",    consultantFee("electric", 1_000_000, 202605), 0);
eq("locksmith 2026/5 → 0",   consultantFee("locksmith", 1_000_000, 202605), 0);
eq("road 2026/5 → 0",        consultantFee("road", 1_000_000, 202605), 0);
eq("detective 2026/5 → 0",   consultantFee("detective", 1_000_000, 202605), 0);

// ── 6. 異常値ガード (revenue) ────────────────────────
console.log("\n📋 6. 異常値ガード");
eq("revenue = 0 → 0",            consultantFee("water", 0, 202605), 0);
eq("revenue = -100 (負値) → 0",  consultantFee("water", -100, 202605), 0);
eq("revenue = NaN → 0",          consultantFee("water", NaN, 202605), 0);
eq("revenue = Infinity → 0",     consultantFee("water", Infinity, 202605), 0);
eq("revenue = -Infinity → 0",    consultantFee("water", -Infinity, 202605), 0);

// ── 7. 浮動小数精度 (本番想定スケール) ───────────────
console.log("\n📋 7. 浮動小数精度");
approx("revenue = 4,897,700 (モック値) → 377,123.0", consultantFee("water", 4_897_700, 202605), 377123.0, 1);
approx("revenue = 88,857,300 (モック月累積) → 6,842,012.1", consultantFee("water", 88_857_300, 202605), 6842012.1, 1);
approx("revenue = 1 (最小) → 0.077", consultantFee("water", 1, 202605), 0.077);
approx("revenue = 12,987 (端数) → 999.999", consultantFee("water", 12987, 202605), 999.999);

// ── 8. 月境界 × 業態クロス (regression guard) ─────────
console.log("\n📋 8. 月境界 × 業態クロス (regression guard)");
eq("water 2026/4 = 0 (境界外、率 > 0 でも 0)", consultantFee("water", 1_000_000, 202604), 0);
eq("electric 2026/5 = 0 (境界内、率 = 0 で 0)", consultantFee("electric", 1_000_000, 202605), 0);
eq("electric 2026/4 = 0 (境界外 + 率 = 0)", consultantFee("electric", 1_000_000, 202604), 0);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
