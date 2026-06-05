// c97-1 純関数テスト: unreadStats.ts (担当範囲導出 + スロットル判定)。
//
// 単独実行: npm run test:integration:c97-1-unread-stats (DB 不要、純関数)
//
// 検証範囲 (反さん指示):
//   1. getUserScopePairs: role 別に対象ペア数が想定通り
//      - executive: 40 ペア (8 area × 5 cat 全社)
//      - vice/manager: 40 ペア (他エリアも view OK)
//      - chief/staff/clerk: 自エリアのみ (= 5 ペア = 1 area × 5 cat)
//   2. throttleSkip: 30 秒以内 = skip / 30 秒超え = 更新 / null (初回) = 必ず更新

import { getUserScopePairs, throttleSkip } from "../app/lib/unreadStats";

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

console.log("🧪 c97-1: unreadStats.ts (担当範囲導出 + スロットル) 純関数検証\n");

// ── 1. getUserScopePairs ロール別 ─────────────────
console.log("📋 1. getUserScopePairs (role 別の対象ペア数)");

const execPairs = getUserScopePairs("executive", null);
eq("executive (areaId=null) → 40 ペア (全 8 area × 5 cat)", execPairs.length, 40);

const execAreaPairs = getUserScopePairs("executive", "kansai");
eq("executive (areaId=kansai でも 全社) → 40 ペア", execAreaPairs.length, 40);

const vicePairs = getUserScopePairs("vice", "kansai");
eq("vice (副社長、他エリアも view) → 40 ペア", vicePairs.length, 40);

const managerPairs = getUserScopePairs("manager", "kansai");
eq("manager (部長、他エリアも view) → 40 ペア", managerPairs.length, 40);

const chiefPairs = getUserScopePairs("chief", "kansai");
eq("chief (課長、自エリアのみ) → 5 ペア (kansai × 5 業態)", chiefPairs.length, 5);
ok("chief 全ペアが kansai", chiefPairs.every((p) => p.area_id === "kansai"));

const staffPairs = getUserScopePairs("staff", "kansai");
eq("staff (社員、自エリアのみ) → 5 ペア (kansai × 5 業態)", staffPairs.length, 5);
ok("staff 全ペアが kansai", staffPairs.every((p) => p.area_id === "kansai"));

const clerkPairs = getUserScopePairs("clerk", "kansai");
eq("clerk (事務員、自エリアのみ) → 5 ペア", clerkPairs.length, 5);

// ── 1b. 自エリア + 自業態指定 (chief/staff/clerk が 1 業態に絞られているケース) ─
console.log("\n📋 1b. business_category 指定で 1 ペアに絞られる");
const staffWaterPairs = getUserScopePairs("staff", "kansai", "water");
eq("staff (kansai/water 指定) → 1 ペア (kansai/water のみ)", staffWaterPairs.length, 1);
ok("staff water ペアが (kansai, water)",
  staffWaterPairs.length === 1 &&
  staffWaterPairs[0].area_id === "kansai" &&
  staffWaterPairs[0].business_category === "water");

// 業態指定でも executive は全社 (= 全 40 ペア閲覧可、自業態絞り無視)
const execWaterPairs = getUserScopePairs("executive", "kansai", "water");
eq("executive + water 指定でも 40 ペア (全社閲覧)", execWaterPairs.length, 40);

// ── 1c. 全 area カバー確認 (executive) ─
console.log("\n📋 1c. executive 全 area カバー (8 area × 5 cat = 40)");
const areaSet = new Set(execPairs.map((p) => p.area_id));
eq("area 種類 = 8", areaSet.size, 8);
const catSet = new Set(execPairs.map((p) => p.business_category));
eq("category 種類 = 5", catSet.size, 5);

// ── 1d. areaId=null (未設定) + staff の挙動 (= 自エリアなし = 全ペア対象外?) ─
console.log("\n📋 1d. staff + areaId=null (担当エリア未設定)");
const staffNullAreaPairs = getUserScopePairs("staff", null);
// hasDataAccess: user.area_id != null かつ user.area_id === targetArea → isOwn=true。
//   area_id=null なら isOwnArea=false 固定。staff は他エリア false → 全ペアが false
//   → 0 ペアが期待
eq("staff (areaId=null) → 0 ペア (自エリア未設定で対象なし)", staffNullAreaPairs.length, 0);

// ── 2. throttleSkip ─────────────────────────────
console.log("\n📋 2. throttleSkip (30 秒スロットル)");

const NOW = new Date("2026-06-05T12:00:00Z");

eq("null (初回) → false (必ず更新)", throttleSkip(null, NOW, 30), false);

// 10 秒前 (30 秒以内) → skip
const ago10s = new Date(NOW.getTime() - 10_000);
eq("10 秒前 → true (skip)", throttleSkip(ago10s, NOW, 30), true);

// 29 秒前 (30 秒境界内) → skip
const ago29s = new Date(NOW.getTime() - 29_000);
eq("29 秒前 → true (skip)", throttleSkip(ago29s, NOW, 30), true);

// 30 秒前ピッタリ (境界外、SQL の < NOW - INTERVAL と一致) → 更新
const ago30s = new Date(NOW.getTime() - 30_000);
eq("30 秒前ピッタリ → false (境界外、更新)", throttleSkip(ago30s, NOW, 30), false);

// 60 秒前 (30 秒超え) → 更新
const ago60s = new Date(NOW.getTime() - 60_000);
eq("60 秒前 → false (更新)", throttleSkip(ago60s, NOW, 30), false);

// 1 時間前 → 更新
const ago1h = new Date(NOW.getTime() - 3600_000);
eq("1 時間前 → false (更新)", throttleSkip(ago1h, NOW, 30), false);

// 異常系: lastSeenAt が未来 (clock skew or 時計ずれ) → 差分マイナス → skip
const futureTime = new Date(NOW.getTime() + 10_000);
eq("未来時刻 → true (skip、保守的)", throttleSkip(futureTime, NOW, 30), true);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
