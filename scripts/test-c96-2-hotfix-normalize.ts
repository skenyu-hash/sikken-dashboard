// c96-2-hotfix 純関数テスト: normalizeRow (API レスポンス型ガード)。
//
// 単独実行: npm run test:integration:c96-2-hotfix-normalize (DB 不要、純関数)
//
// 経緯 (b66883c 本番障害、2026-06-05):
//   /api/range-aggregate は Neon serverless driver で SELECT。NUMERIC / BIGINT は string で返る
//   (JS の number 範囲超過防止)。フロント側で profit_rate.toFixed() を直接呼び出していたため
//   TypeError クラッシュ、/daily-report 全面 "This page couldn't load"。
//   Vercel で c96-1 (17290bf) に Promote/ロールバック → 本番復旧。
//
// 本テストは normalizeRow が以下を保証することを検証:
//   1. string 数値 → number 化 ("125000" → 125000)
//   2. NaN / undefined / null → 0 フォールバック
//   3. number 直値はそのまま通過
//   4. business_category / area_id は string 型保持 (非 string は "" フォールバック)
//   5. raw が null / undefined / 非オブジェクト → null 返却

import { normalizeRow } from "../app/entry/components/dailyReport/useReportData";

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

console.log("🧪 c96-2-hotfix: normalizeRow 型ガード検証\n");

// ── 1. Neon driver の string 数値レスポンスを number 化 ────
console.log("📋 1. string → number 変換 (Neon driver の典型レスポンス)");
const fromNeon = normalizeRow({
  business_category: "water",
  area_id: "kansai",
  total_revenue: "1700000",   // BIGINT → string
  total_profit: "938000",
  total_count: "30",
  unit_price: "56666",
  ad_cost: "90000",
  acquisition_count: "5",
  call_count: "20",
  profit_rate: "55.2",         // NUMERIC → string ← b66883c 本番障害の根本原因
  help_revenue: "0",
  help_count: "0",
  consultant_fee: "77000",
  vehicle_count: "3",
  trainee_count: "0",
});
ok("normalizeRow 戻り値 not null", fromNeon !== null);
eq("total_revenue → number", typeof fromNeon!.total_revenue, "number");
eq("total_revenue 値", fromNeon!.total_revenue, 1700000);
eq("profit_rate → number (本番障害修正の核心)", typeof fromNeon!.profit_rate, "number");
eq("profit_rate 値", fromNeon!.profit_rate, 55.2);
eq("business_category 保持", fromNeon!.business_category, "water");
eq("area_id 保持", fromNeon!.area_id, "kansai");

// ── 1b. profit_rate.toFixed() がクラッシュしないことを確認 ──
console.log("\n📋 1b. profit_rate.toFixed(1) クラッシュ regression (本番障害シナリオ)");
let didNotCrash = false;
try {
  const _ = fromNeon!.profit_rate.toFixed(1);
  didNotCrash = _ === "55.2";
} catch {
  didNotCrash = false;
}
ok("profit_rate.toFixed(1) === '55.2' (TypeError なし)", didNotCrash);

// ── 2. NaN / undefined / null → 0 フォールバック ────────
console.log("\n📋 2. 異常値ガード (NaN / undefined / null / 非数値文字列)");
const fromBroken = normalizeRow({
  business_category: "water",
  area_id: "kansai",
  total_revenue: null,
  total_profit: undefined,
  total_count: "abc",
  unit_price: NaN,
  ad_cost: Infinity,
  acquisition_count: -Infinity,
  call_count: "",
  profit_rate: "not_a_number",
  help_revenue: null,
  help_count: undefined,
  consultant_fee: null,
  vehicle_count: undefined,
  trainee_count: null,
});
ok("normalizeRow 戻り値 not null", fromBroken !== null);
eq("null → 0", fromBroken!.total_revenue, 0);
eq("undefined → 0", fromBroken!.total_profit, 0);
eq("非数値 string → 0", fromBroken!.total_count, 0);
eq("NaN → 0", fromBroken!.unit_price, 0);
eq("Infinity → 0", fromBroken!.ad_cost, 0);
eq("-Infinity → 0", fromBroken!.acquisition_count, 0);
eq("空文字 → 0", fromBroken!.call_count, 0);
eq("非数値 string profit_rate → 0", fromBroken!.profit_rate, 0);

// ── 3. number 直値はそのまま通過 ─────────────────────
console.log("\n📋 3. number 直値はそのまま通過");
const fromNumber = normalizeRow({
  business_category: "electric",
  area_id: "kanto",
  total_revenue: 500000,
  total_profit: 310000,
  total_count: 5,
  unit_price: 100000,
  ad_cost: 30000,
  acquisition_count: 5,
  call_count: 20,
  profit_rate: 62.0,
  help_revenue: 0,
  help_count: 0,
  consultant_fee: 0,
  vehicle_count: 2,
  trainee_count: 0,
});
eq("total_revenue 500000", fromNumber!.total_revenue, 500000);
eq("profit_rate 62.0", fromNumber!.profit_rate, 62.0);

// ── 4. business_category / area_id 非 string → "" ──
console.log("\n📋 4. 文字列フィールドのガード");
const badStr = normalizeRow({
  business_category: 123, // 想定外
  area_id: null,
  total_revenue: "100",
});
eq("business_category 非 string → ''", badStr!.business_category, "");
eq("area_id null → ''", badStr!.area_id, "");
eq("total_revenue は number 化", badStr!.total_revenue, 100);

// ── 5. raw が null / undefined / 非オブジェクト → null 返却 ──
console.log("\n📋 5. null/undefined/非オブジェクト → null");
eq("normalizeRow(null) = null", normalizeRow(null), null);
eq("normalizeRow(undefined) = null", normalizeRow(undefined), null);
eq("normalizeRow('string') = null", normalizeRow("string"), null);
eq("normalizeRow(123) = null", normalizeRow(123), null);
ok("normalizeRow({}) returns object (空オブジェクトは全 0 で正常化)", normalizeRow({}) !== null);

// ── 6. 主要 fmt 関数が落ちないことを確認 ──
console.log("\n📋 6. yen / cnt / pct が normalize 後の値で落ちないこと");
const r = normalizeRow({ total_revenue: "1700000", profit_rate: "55.2" })!;
const yenStr = `¥${Math.round(r.total_revenue).toLocaleString("ja-JP")}`;
eq("yen(total_revenue) = '¥1,700,000'", yenStr, "¥1,700,000");
const pctStr = `${(Math.round(r.profit_rate * 10) / 10).toFixed(1)}%`;
eq("pct(profit_rate) = '55.2%'", pctStr, "55.2%");

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
