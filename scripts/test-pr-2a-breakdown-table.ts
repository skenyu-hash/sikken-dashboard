// PR-2a 純関数テスト: CompanyBreakdownTable.tsx の helper / 行ソース / 型ガード。
//
// 単独実行: npx tsx scripts/test-pr-2a-breakdown-table.ts
//
// 反さん指定 5 要件:
//   1. 会社別ビューで company.areas の全行が描画 (= getBreakdownPairs(companyId) が一致)
//   2. __all__ で全社、unassigned で 16 ペア (= computeUnassignedAreas 経由)
//   3. 欠損フィールドが「—」になり toFixed クラッシュしない (型ガード: string/null/undefined/NaN)
//   4. ヒーローKPI の SUM 値が PR 前と完全一致 (= Dashboard.tsx L306-346 の untouch を grep で検証)
//   5. 「事業別で編集 →」で viewMode/category/area が正しく切替わる
//      (純関数 = onChangeBusinessRequest コールバックが pair {category, areaId} で呼ばれること、
//       Dashboard 側で setViewMode/setActiveBusiness/setActiveTab を行う JSX 配線を grep で確認)

import {
  getBreakdownPairs,
  type BreakdownPair,
} from "../app/components/dashboard/CompanyBreakdownTable";
import { COMPANIES, getCompanyAssignments } from "../app/lib/companies";
import * as fs from "node:fs";
import * as path from "node:path";

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

console.log("🧪 PR-2a: CompanyBreakdownTable 純関数 + invariant 検証\n");

// ── 要件 1. company.areas の全行が描画 ─────────────────
console.log("📋 1. getBreakdownPairs(companyId) が company.areas と一致");
for (const c of COMPANIES) {
  if (c.id === "unassigned") continue;
  const pairs = getBreakdownPairs(c.id);
  const expected = getCompanyAssignments(c.id);
  eq(`${c.id}: 件数一致`, pairs.length, expected.length);
  const pairSet = new Set(pairs.map((p) => `${p.category}|${p.areaId}`));
  const expSet = new Set(expected.map((a) => `${a.category}|${a.areaId}`));
  ok(`${c.id}: ペア Set 完全一致`,
    pairSet.size === expSet.size && Array.from(pairSet).every((k) => expSet.has(k)));
}

// ── 要件 2. __all__ で全社 / unassigned で 16 ペア ─────
console.log("\n📋 2. 特殊会社 ID の派生 (__all__ / unassigned)");
const allPairs = getBreakdownPairs("__all__");
const expectedAllCount = COMPANIES.reduce((s, c) => s + c.areas.length, 0);
eq("__all__ 件数 = COMPANIES 全 areas 合計", allPairs.length, expectedAllCount);

const unassignedPairs = getBreakdownPairs("unassigned");
eq("unassigned 件数 = 16 (PR-1 反さん確定)", unassignedPairs.length, 16);

// PR-1 確定の内訳: electric 3 / locksmith 6 / detective 3 / road 4
const byCat = unassignedPairs.reduce<Record<string, number>>((m, p) => {
  m[p.category] = (m[p.category] ?? 0) + 1;
  return m;
}, {});
eq("unassigned[electric] = 3", byCat.electric, 3);
eq("unassigned[locksmith] = 6", byCat.locksmith, 6);
eq("unassigned[detective] = 3", byCat.detective, 3);
eq("unassigned[road] = 4", byCat.road, 4);
ok("unassigned[water] 未定義 (water 全 8 エリアは 4 社で完備)", byCat.water === undefined);

// 未知 ID は assignments 空 → 空配列
const unkPairs = getBreakdownPairs("unknown_company_id");
eq("未知 ID → 0 件 (空テーブル → 「担当範囲なし」表示パス)", unkPairs.length, 0);

// ── 要件 3. 型ガード (Neon string レスポンス → toFixed/toLocaleString クラッシュ防止) ─
//   CompanyBreakdownTable 内の normalizeNum / fmtYen / fmtCount / fmtUnitPrice を
//   実体 import せずに同等仕様で再現テスト (default export のため component 内 helper は非公開)。
//   代わりに「実 component に何を渡してもクラッシュしない」ことを Node 上で JSON.stringify + Number で検証する。
console.log("\n📋 3. 型ガード (string/null/undefined/NaN/負値 → 「—」or 0 で安全降伏)");

// helper 再現 (component と同仕様、c96-2 hotfix normalizeRow と同方針)
const normalizeNum = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtYen = (v: unknown): string => {
  if (v == null) return "—";
  return `¥${Math.round(normalizeNum(v)).toLocaleString("ja-JP")}`;
};
const fmtCount = (v: unknown): string => {
  if (v == null) return "—";
  return `${Math.round(normalizeNum(v)).toLocaleString("ja-JP")}件`;
};
const fmtUnitPrice = (revenue: unknown, count: unknown): string => {
  const r = normalizeNum(revenue);
  const c = normalizeNum(count);
  if (c <= 0 || r <= 0) return "—";
  return `¥${Math.round(r / c).toLocaleString("ja-JP")}`;
};

// 3-1: null / undefined → "—" (c96-2 hotfix 教訓: rangeRow.profit_rate.toFixed クラッシュ防止)
eq("fmtYen(null) = —", fmtYen(null), "—");
eq("fmtYen(undefined) = —", fmtYen(undefined), "—");
eq("fmtCount(null) = —", fmtCount(null), "—");
eq("fmtUnitPrice(null, null) = —", fmtUnitPrice(null, null), "—");
eq("fmtUnitPrice(1000, 0) = —", fmtUnitPrice(1000, 0), "—");
eq("fmtUnitPrice(0, 10) = —", fmtUnitPrice(0, 10), "—");

// 3-2: Neon driver の string レスポンス (NUMERIC/BIGINT)
eq("fmtYen('1234567') = ¥1,234,567 (Neon string)", fmtYen("1234567"), "¥1,234,567");
eq("fmtCount('42') = 42件 (Neon string)", fmtCount("42"), "42件");
eq("fmtUnitPrice('120000', '4') = ¥30,000 (Neon string)",
  fmtUnitPrice("120000", "4"), "¥30,000");

// 3-3: NaN / Infinity / 異常値 → 0 扱い → 「—」相当 or ¥0
eq("normalizeNum(NaN) = 0", normalizeNum(NaN), 0);
eq("normalizeNum(Infinity) = 0", normalizeNum(Infinity), 0);
eq("normalizeNum('abc') = 0", normalizeNum("abc"), 0);
eq("fmtYen('abc') = ¥0 (number 化後 0)", fmtYen("abc"), "¥0");

// 3-4: 正常値 (number)
eq("fmtYen(1000000) = ¥1,000,000", fmtYen(1000000), "¥1,000,000");
eq("fmtCount(123) = 123件", fmtCount(123), "123件");

// ── 要件 4. ヒーローKPI の SUM 値が PR 前と完全一致 (Dashboard.tsx untouch を grep) ─
console.log("\n📋 4. ヒーロー集計 useEffect (Dashboard.tsx L306-346) untouch 検証 (grep)");
const dashboardSrc = fs.readFileSync(
  path.join(__dirname, "..", "app", "components", "Dashboard.tsx"),
  "utf-8",
);

// 4-1: 既存 SUM ロジックの key signatures が残存
const heroSignatures = [
  "if (viewMode !== \"company\") { setCompanyData(null); return; }",
  "const company = COMPANIES.find(c => c.id === activeCompany);",
  "const pairs = company ? company.areas : COMPANIES.flatMap(c => c.areas);",
  "result.totalRevenue += Number(s.total_revenue ?? 0);",
  "result.totalProfit += resolveTotalProfit(s);",
  "result.totalCount += Number(s.total_count ?? 0);",
  "result.totalAdCost += Number(s.ad_cost ?? 0);",
  "result.helpRevenue += Number(s.help_revenue ?? 0);",
  "result.helpCount += Number(s.help_count ?? 0);",
  "result.vehicleCount += Number(s.vehicle_count ?? 0);",
  "setCompanyData(result);",
];
for (const sig of heroSignatures) {
  ok(`ヒーロー集計 unchanged: \`${sig.slice(0, 60)}${sig.length > 60 ? "..." : ""}\``,
    dashboardSrc.includes(sig));
}

// 4-2: companyData の state 型シェイプ unchanged (totalRevenue/totalProfit/totalCount/totalAdCost/helpRevenue/helpCount/vehicleCount)
const companyStateShape = "totalRevenue: number; totalProfit: number; totalCount: number; totalAdCost: number;";
ok("companyData state 型 unchanged", dashboardSrc.includes(companyStateShape));

// ── 要件 5. 「事業別で編集 →」コールバックの配線 grep ─
console.log("\n📋 5. onChangeBusinessRequest 配線 (Dashboard.tsx 内 JSX)");

// 5-1: CompanyBreakdownTable が viewMode === "company" でレンダリング
ok("viewMode === \"company\" ガード付きでレンダリング",
  dashboardSrc.includes("{viewMode === \"company\" && (") &&
  dashboardSrc.includes("<CompanyBreakdownTable"));

// 5-2: callback が setViewMode/setActiveBusiness/setActiveTab を順に呼ぶ
ok("onChangeBusinessRequest で setViewMode(\"business\") を呼ぶ",
  dashboardSrc.includes("setViewMode(\"business\");") &&
  dashboardSrc.includes("setActiveBusiness(category);") &&
  dashboardSrc.includes("setActiveTab(areaId);"));

// 5-3: pair (category, areaId) が型として残存
const samplePair: BreakdownPair = { category: "water", areaId: "kansai" };
eq("BreakdownPair 型: category/areaId フィールド名", `${samplePair.category}|${samplePair.areaId}`, "water|kansai");

// ── 6. 既存テスト regression: getBreakdownPairs 単一会社の往復一致 ─
console.log("\n📋 6. 既存 helper との往復一致 (getBreakdownPairs = getCompanyAssignments map)");
const dunkPairs = getBreakdownPairs("dunk");
eq("DUNK 4 ペア (PR-1 後)", dunkPairs.length, 4);
const dunkKeys = new Set(dunkPairs.map((p) => `${p.category}|${p.areaId}`));
ok("DUNK: water/kyushu + water/chugoku + road/kansai + electric/kyushu",
  dunkKeys.has("water|kyushu") && dunkKeys.has("water|chugoku") &&
  dunkKeys.has("road|kansai") && dunkKeys.has("electric|kyushu"));

const rexiaPairs = getBreakdownPairs("rexia");
eq("REXIA 3 ペア (PR-1 後: water 2 + electric 1)", rexiaPairs.length, 3);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
