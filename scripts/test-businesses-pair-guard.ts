// PR-3 (2026-06-08) 純関数テスト: businesses.ts の category-area 連動ヘルパー。
//
// 単独実行: npm run test:integration:businesses-pair-guard (DB 不要、純関数)
//
// 反さん指定 検証範囲:
//   1. getAreasForCategory(cat): 全 5 業態でマスター定義通りの配列が返る、未知 cat は []
//   2. clampAreaToCategory(area, cat): 全 32 マスター内ペアは入力 area がそのまま返る
//   3. clampAreaToCategory: マスター外組合せ (例: electric/shizuoka, road/kitakanto 等) は
//      DEFAULT_AREA_FOR_CLAMP="kansai" に寄る
//   4. DEFAULT_AREA_FOR_CLAMP が全 5 業態に含まれていることを構造的に保証
//      (= 修正1「先頭」依存排除の核心、明示定数が全業態で fallback として機能する)
//   5. category 切替シナリオ regression: water/shizuoka → electric (shizuoka なし) で kansai
//                                       water/kitakanto → detective (kitakanto なし) で kansai
//                                       water/kanto → detective (kanto あり) で kanto そのまま
//   6. 防御 fallback: 未知 cat でも空配列 → DEFAULT_AREA → areas[0] の 3 段で落ちない

import {
  BUSINESSES,
  DEFAULT_AREA_FOR_CLAMP,
  getAreasForCategory,
  clampAreaToCategory,
} from "../app/lib/businesses";

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

console.log("🧪 PR-3: businesses.ts category-area 連動ヘルパー検証\n");

// ── 1. getAreasForCategory: 全 5 業態 ─────────────────────
console.log("📋 1. getAreasForCategory(cat): マスター定義通りの配列");
eq("water 8 エリア", getAreasForCategory("water").length, 8);
eq("electric 7 エリア (no shizuoka)", getAreasForCategory("electric").length, 7);
eq("locksmith 7 エリア", getAreasForCategory("locksmith").length, 7);
eq("road 5 エリア", getAreasForCategory("road").length, 5);
eq("detective 5 エリア", getAreasForCategory("detective").length, 5);

// マスター定義との完全一致 (順序含む)
for (const b of BUSINESSES) {
  const derived = getAreasForCategory(b.id);
  ok(`${b.id}: getAreasForCategory == BUSINESSES.areas (順序含む完全一致)`,
    derived.length === b.areas.length && derived.every((a, i) => a === b.areas[i]));
}

// 未知 cat は空配列 (型は外しても runtime で安全に降伏)
eq("未知 category → []",
  // @ts-expect-error 意図的に不正型を渡す runtime テスト
  getAreasForCategory("unknown_xyz").length, 0);

// ── 2. clampAreaToCategory: マスター内ペアは入力そのまま ──
console.log("\n📋 2. マスター内 32 ペア: clampAreaToCategory == 入力 area (恒等)");
let identityCount = 0;
for (const b of BUSINESSES) {
  for (const area of b.areas) {
    if (clampAreaToCategory(area, b.id) === area) identityCount++;
    else console.log(`     ❌ 恒等違反: ${b.id}/${area} → ${clampAreaToCategory(area, b.id)}`);
  }
}
eq("32 ペア全てが恒等 (32/32)", identityCount, 32);

// ── 3. マスター外組合せが DEFAULT_AREA_FOR_CLAMP に寄る ───
console.log("\n📋 3. マスター外組合せ → DEFAULT_AREA_FOR_CLAMP (=" + DEFAULT_AREA_FOR_CLAMP + ")");
eq("electric/shizuoka → kansai (PR-1 で water 専用エリア)",
  clampAreaToCategory("shizuoka", "electric"), "kansai");
eq("locksmith/shizuoka → kansai", clampAreaToCategory("shizuoka", "locksmith"), "kansai");
eq("road/shizuoka → kansai", clampAreaToCategory("shizuoka", "road"), "kansai");
eq("detective/shizuoka → kansai", clampAreaToCategory("shizuoka", "detective"), "kansai");
eq("road/kitakanto → kansai (road は 5 エリア限定)",
  clampAreaToCategory("kitakanto", "road"), "kansai");
eq("detective/chugoku → kansai", clampAreaToCategory("chugoku", "detective"), "kansai");
eq("不明 area 'unknown_xyz' / water → kansai", clampAreaToCategory("unknown_xyz", "water"), "kansai");
eq("空文字 area / electric → kansai", clampAreaToCategory("", "electric"), "kansai");

// ── 4. DEFAULT_AREA_FOR_CLAMP の構造保証 (修正1 核心) ────
console.log("\n📋 4. DEFAULT_AREA_FOR_CLAMP=" + DEFAULT_AREA_FOR_CLAMP + " が全 5 業態に含まれる構造保証");
//   この保証が崩れたら areas[0] 防御 fallback に落ちる。BUSINESSES 変更時の regression 検知。
for (const b of BUSINESSES) {
  ok(`${b.id} に DEFAULT_AREA_FOR_CLAMP="${DEFAULT_AREA_FOR_CLAMP}" 含む`,
    b.areas.includes(DEFAULT_AREA_FOR_CLAMP));
}

// ── 5. category 切替シナリオ regression (修正2 の挙動保証) ─
console.log("\n📋 5. EntryForm category 切替シナリオ (clamp useEffect 挙動)");
// 水道タブで shizuoka 選択中 → 探偵タブに切替 → 探偵は shizuoka 無いので kansai
eq("water/shizuoka → detective に切替 → kansai",
  clampAreaToCategory("shizuoka", "detective"), "kansai");
// 水道タブで kitakanto 選択中 → 探偵タブ → 探偵は kitakanto 無い → kansai
eq("water/kitakanto → detective → kansai (kitakanto は探偵に無い)",
  clampAreaToCategory("kitakanto", "detective"), "kansai");
// 水道タブで kanto 選択中 → 探偵タブ → 探偵は kanto あり → kanto そのまま (恒等)
eq("water/kanto → detective → kanto そのまま (恒等、両方含む)",
  clampAreaToCategory("kanto", "detective"), "kanto");
// 電気タブで kitakanto 選択中 → 水道タブ → 水道は kitakanto あり → kitakanto そのまま
eq("electric/kitakanto → water → kitakanto そのまま",
  clampAreaToCategory("kitakanto", "water"), "kitakanto");
// road/kanto → detective → kanto (両方含む)
eq("road/kanto → detective → kanto そのまま",
  clampAreaToCategory("kanto", "detective"), "kanto");

// ── 6. API ガード相当 (route.ts:60 で使う includes 判定) regression ─
console.log("\n📋 6. API ガード相当 (getAreasForCategory(cat).includes(area))");
// マスター内
ok("electric/nagoya → API includes 通過 (PR-1 で追加された未割当ペア)",
  getAreasForCategory("electric").includes("nagoya"));
ok("water/shizuoka → API includes 通過", getAreasForCategory("water").includes("shizuoka"));
// マスター外 (API は 400 になる)
ok("electric/shizuoka → API includes 弾く (400 になる)",
  !getAreasForCategory("electric").includes("shizuoka"));
ok("road/kitakanto → API includes 弾く",
  !getAreasForCategory("road").includes("kitakanto"));
ok("detective/chugoku → API includes 弾く",
  !getAreasForCategory("detective").includes("chugoku"));

// ── 7. 防御 fallback: 未知 cat でも null/throw しない ─
console.log("\n📋 7. 防御 fallback (未知 cat で null/throw しない、areas[0] にも落ちない)");
// 未知 cat → areas=[] → DEFAULT_AREA 含まない → areas[0]=undefined → ?? area で入力そのまま返る
eq("clampAreaToCategory('kansai', 'unknown') → 'kansai' (areas 空時は入力そのまま)",
  // @ts-expect-error 意図的に不正型を渡す runtime テスト
  clampAreaToCategory("kansai", "unknown_xyz"), "kansai");

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
