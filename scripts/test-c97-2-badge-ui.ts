// c97-2 純関数テスト: UnreadBadge 表示ロジック + getSingleMarkReadPair (自動既読化発火条件)。
//
// 単独実行: npm run test:integration:c97-2-badge-ui (DB 不要、純関数)
//
// 検証範囲 (反さん指示):
//   1. formatBadgeCount: count=0 → null / 1-99 → "N" / 100+ → "99+"
//   2. getSingleMarkReadPair: 単一 (1×1) のときペア返却 / 合算 (N×M, N>1 or M>1) のとき null
//   3. fetch エラー時の握りつぶしロジック (本テストでは fetch を mock しないが、純関数の責務範囲を確認)

import { formatBadgeCount } from "../app/components/UnreadBadge";
import { getSingleMarkReadPair } from "../app/lib/unreadStats";

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

console.log("🧪 c97-2: UnreadBadge + 自動既読化 純関数検証\n");

// ── 1. formatBadgeCount: 数値 → 表示文字列 ────────
console.log("📋 1. formatBadgeCount (バッジ表示文字列)");
eq("count=0 → null (バッジ非表示)", formatBadgeCount(0), null);
eq("count=1 → '1'", formatBadgeCount(1), "1");
eq("count=50 → '50'", formatBadgeCount(50), "50");
eq("count=99 → '99' (cap 境界)", formatBadgeCount(99), "99");
eq("count=100 → '99+' (cap 発火)", formatBadgeCount(100), "99+");
eq("count=500 → '99+' (cap)", formatBadgeCount(500), "99+");
eq("count=-1 → null (負値ガード)", formatBadgeCount(-1), null);
eq("count=NaN → null (異常値ガード)", formatBadgeCount(NaN), null);
eq("count=Infinity → null (異常値ガード)", formatBadgeCount(Infinity), null);
eq("count=1.5 (小数) → '1' (floor)", formatBadgeCount(1.5), "1");

// ── 2. getSingleMarkReadPair: 単一拠点判定 ───────
console.log("\n📋 2. getSingleMarkReadPair (自動既読化発火条件)");

// 単一 (1×1) → ペア返却
const single = getSingleMarkReadPair(["water"], ["kansai"]);
ok("単一 (water × kansai) → ペア返却 not null", single !== null);
eq("単一: areaId='kansai'", single?.areaId, "kansai");
eq("単一: category='water'", single?.category, "water");

// 合算 (1×N) → null (複数エリア)
eq("(water × [kansai, kanto]) → null (複数エリア)",
  getSingleMarkReadPair(["water"], ["kansai", "kanto"]), null);

// 合算 (N×1) → null (複数業態)
eq("([water, electric] × kansai) → null (複数業態)",
  getSingleMarkReadPair(["water", "electric"], ["kansai"]), null);

// 合算 (N×M) → null
eq("([water, electric] × [kansai, kanto]) → null",
  getSingleMarkReadPair(["water", "electric"], ["kansai", "kanto"]), null);

// グループ全体相当 (5 × 8) → null
eq("([5 業態] × [8 エリア]) → null (グループ全体)",
  getSingleMarkReadPair(
    ["water", "electric", "locksmith", "road", "detective"],
    ["kansai", "kanto", "nagoya", "kyushu", "kitakanto", "hokkaido", "chugoku", "shizuoka"],
  ),
  null);

// 空配列 → null (担当範囲なし)
eq("([] × []) → null (空)", getSingleMarkReadPair([], []), null);
eq("(空 × [kansai]) → null (空 categories)", getSingleMarkReadPair([], ["kansai"]), null);
eq("([water] × 空) → null (空 areas)", getSingleMarkReadPair(["water"], []), null);

// ── 3. 実シナリオ確認 (反さん仕様): 会社別ビューでの単一拠点 ───
console.log("\n📋 3. 会社別ビュー実シナリオ");
// SIKKEN Group (鍵×関西) = 唯一の 1 ペア会社
const sikkenPair = getSingleMarkReadPair(["locksmith"], ["kansai"]);
ok("SIKKEN (鍵×関西、1 ペア会社) → mark-read 発火", sikkenPair !== null);
eq("SIKKEN: locksmith/kansai", `${sikkenPair?.category}/${sikkenPair?.areaId}`, "locksmith/kansai");

// Mavericks (水道×関西, 水道×北海道) = 2 拠点会社 → 合算扱いで mark-read しない
eq("Mavericks 全表示 (水道 × [関西, 北海道]) → null (mark-read しない)",
  getSingleMarkReadPair(["water"], ["kansai", "hokkaido"]), null);

// Mavericks で 1 エリアに絞ったとき → mark-read 発火
const mavKansaiPair = getSingleMarkReadPair(["water"], ["kansai"]);
ok("Mavericks 関西のみ絞り込み → mark-read 発火", mavKansaiPair !== null);
eq("Mavericks 関西: water/kansai",
  `${mavKansaiPair?.category}/${mavKansaiPair?.areaId}`, "water/kansai");

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
