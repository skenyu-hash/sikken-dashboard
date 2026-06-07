// c96-1 純関数テスト: companies.ts (会社マッピング + 補助関数)。
//
// 単独実行: npm run test:integration:companies (DB 不要、純関数)
//
// 検証範囲:
//   1. COMPANIES 配列: 7 社 + 未割当 (8 件)
//   2. 各社の name / id / areas 構造
//   3. TOPLEVEL に shizuoka 追加済 (反さん指示、c96-1)
//   4. 未割当 = BUSINESSES に存在し 7 社いずれにも属さない (category, area) の集合
//   5. getCompanyFor: (category, area) → CompanyId、未割当判定が正しく動く
//   6. getCompany: id → Company、未知 id は undefined
//   7. getCompanyCategoriesAndAreas: 会社の categories / areas のユニーク派生
//   8. getCompanyAssignments: 会社の areas そのまま展開
//   9. 既存 API 互換 (id / name / areas / areaId / category) 維持確認

import {
  COMPANIES,
  UNASSIGNED_COMPANY_ID,
  getCompany,
  getCompanyFor,
  getCompanyCategoriesAndAreas,
  getCompanyAssignments,
  deriveCompanySwitchPatch,
} from "../app/lib/companies";
import { BUSINESSES } from "../app/lib/businesses";

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

console.log("🧪 PR c96-1: companies.ts 純関数検証\n");

// ── 1. COMPANIES 構造 ───────────────────────────
console.log("📋 1. COMPANIES 配列");
eq("件数 = 8 (7 社 + 未割当)", COMPANIES.length, 8);
eq("ID 一覧 (順序維持)", COMPANIES.map((c) => c.id).join(","),
  "mavericks,toplevel,rexia,dunk,ulua,grits,sikken,unassigned");

// ── 2. 各社の name / areas 構造 ─────────────────
console.log("\n📋 2. 既存 API 互換 (id / name / areas / areaId / category)");
const mav = getCompany("mavericks")!;
eq("mavericks.name", mav.name, "Mavericks");
eq("mavericks.areas[0].category", mav.areas[0].category, "water");
eq("mavericks.areas[0].areaId", mav.areas[0].areaId, "kansai");
eq("mavericks.areas[1].areaId", mav.areas[1].areaId, "hokkaido");

// ── 3. TOPLEVEL に shizuoka 追加済 ──────────────
console.log("\n📋 3. TOPLEVEL shizuoka 追加 (c96-1 反さん指示)");
const top = getCompany("toplevel")!;
eq("toplevel.areas 件数 = 2 (nagoya + shizuoka)", top.areas.length, 2);
ok("toplevel に nagoya", top.areas.some((a) => a.areaId === "nagoya"));
ok("toplevel に shizuoka", top.areas.some((a) => a.areaId === "shizuoka"));

// ── 4. 未割当 = BUSINESSES 差分 ──────────────────
console.log("\n📋 4. unassigned = 7 社いずれにも属さない (category, area)");
const unassigned = getCompany(UNASSIGNED_COMPANY_ID)!;
eq("unassigned.id", unassigned.id, "unassigned");
eq("unassigned.name", unassigned.name, "未割当");

// 既知の所属の例: (water, kansai) は Mavericks → unassigned に含まれない
ok("(water, kansai) は unassigned に含まれない (Mavericks 所属)",
  !unassigned.areas.some((a) => a.category === "water" && a.areaId === "kansai"));
// 既知の未割当候補例: water+shizuoka は TOPLEVEL に追加されたので含まれない
ok("(water, shizuoka) は unassigned に含まれない (TOPLEVEL 所属)",
  !unassigned.areas.some((a) => a.category === "water" && a.areaId === "shizuoka"));

// 未割当数 = BUSINESSES 全 (cat, area) - 7 社の assignments 数 (重複なし前提)
const allBusinessPairs = BUSINESSES.flatMap((b) => b.areas.map((a) => `${b.id}|${a}`));
const assignedCount = COMPANIES.filter((c) => c.id !== "unassigned").reduce(
  (s, c) => s + c.areas.length, 0
);
eq("unassigned 数 = BUSINESSES 全 (cat,area) - 7 社合計",
  unassigned.areas.length, allBusinessPairs.length - assignedCount);

// ── 5. getCompanyFor: (category, area) → CompanyId ─
console.log("\n📋 5. getCompanyFor (逆引き)");
eq("(water, kansai) → mavericks", getCompanyFor("water", "kansai"), "mavericks");
eq("(water, kanto) → rexia", getCompanyFor("water", "kanto"), "rexia");
eq("(water, shizuoka) → toplevel (c96-1 追加)", getCompanyFor("water", "shizuoka"), "toplevel");
eq("(locksmith, kansai) → sikken", getCompanyFor("locksmith", "kansai"), "sikken");
eq("(road, kansai) → dunk", getCompanyFor("road", "kansai"), "dunk");
eq("(detective, nagoya) → grits", getCompanyFor("detective", "nagoya"), "grits");
eq("(electric, kanto) → ulua", getCompanyFor("electric", "kanto"), "ulua");
// 未割当の例 (BUSINESSES に存在しない組合せは unassigned 落ち)
eq("(water, unknown_area) → unassigned", getCompanyFor("water", "unknown_area"), "unassigned");

// ── 6. getCompany: id → Company / undefined ─────
console.log("\n📋 6. getCompany (順引き)");
ok("getCompany('rexia') 存在", getCompany("rexia") !== undefined);
ok("getCompany('unknown_id') = undefined", getCompany("unknown_id") === undefined);

// ── 7. getCompanyCategoriesAndAreas (ユニーク派生) ─
console.log("\n📋 7. getCompanyCategoriesAndAreas (会社別の絞り込み選択肢生成)");
const dunkSel = getCompanyCategoriesAndAreas("dunk");
// PR-1 (2026-06-07): DUNK に electric/kyushu 追加 → categories = [water, road, electric]、areas Set 不変
ok("DUNK categories = [water, road, electric] (PR-1 で electric 追加)",
  JSON.stringify(dunkSel.categories.sort()) === JSON.stringify(["electric", "road", "water"]));
ok("DUNK areas = [kansai, kyushu, chugoku] (PR-1 で electric/kyushu 追加でも area Set 不変)",
  JSON.stringify(dunkSel.areas.sort()) === JSON.stringify(["chugoku", "kansai", "kyushu"]));

// 未割当 / 未知 id は空
const unkSel = getCompanyCategoriesAndAreas("unknown_id");
ok("unknown id: categories 空", unkSel.categories.length === 0);
ok("unknown id: areas 空", unkSel.areas.length === 0);

// ── 8. getCompanyAssignments ─────────────────────
console.log("\n📋 8. getCompanyAssignments (assignments そのまま展開)");
const rexiaA = getCompanyAssignments("rexia");
// PR-1 (2026-06-07): REXIA に electric/kitakanto 追加 → assignments 3 件、water 2 + electric 1
eq("REXIA assignments 件数 = 3 (water 2 + electric 1)", rexiaA.length, 3);
eq("REXIA water 件数 = 2", rexiaA.filter((a) => a.category === "water").length, 2);
eq("REXIA electric 件数 = 1", rexiaA.filter((a) => a.category === "electric").length, 1);
ok("REXIA areas Set = {kanto, kitakanto} (electric/kitakanto 追加でも area は同じ)",
  JSON.stringify(Array.from(new Set(rexiaA.map((a) => a.areaId))).sort()) === JSON.stringify(["kanto", "kitakanto"]));

eq("unknown id assignments = []", getCompanyAssignments("unknown_id").length, 0);

// ── 9. 重複なしの不変 (各 (cat, area) は最大 1 社のみに所属) ─
console.log("\n📋 9. 排他性 (各 (category, area) は最大 1 社のみに所属)");
const allAssignments: string[] = [];
for (const c of COMPANIES) {
  if (c.id === "unassigned") continue;
  for (const a of c.areas) {
    allAssignments.push(`${a.category}|${a.areaId}`);
  }
}
const uniqueSet = new Set(allAssignments);
ok("重複 0 件 (各 (cat,area) は最大 1 社)",
  allAssignments.length === uniqueSet.size);

// ── 10. unassigned 内も同じ排他性 (unassigned 自身に重複なし) ─
const uList = unassigned.areas.map((a) => `${a.category}|${a.areaId}`);
const uSet = new Set(uList);
ok("unassigned 内重複なし", uList.length === uSet.size);



// ── 11. deriveCompanySwitchPatch (c97-4 bug fix、反さん指示) ──────
//   会社切替時の URL patch 派生: 単一事業会社はその事業を category にセット、複数事業会社は null。
//   バグ症状: 旧 handleCompanyChange で category=null → page.tsx fallback "water" 固定で
//     ULUA/GriT's/SIKKEN など水道以外の会社で「ULUA / water」と誤表示されていた。
console.log("\n📋 11. deriveCompanySwitchPatch (会社切替時 URL patch、c97-4)");

const mavPatch = deriveCompanySwitchPatch("mavericks");
eq("Mavericks (水道のみ × 2 エリア): category=water", mavPatch.category, "water");
eq("Mavericks: area=null (2 エリア)", mavPatch.area, null);
eq("Mavericks: company=mavericks", mavPatch.company, "mavericks");

const topPatch = deriveCompanySwitchPatch("toplevel");
eq("TOPLEVEL (水道のみ × 2 エリア): category=water", topPatch.category, "water");
eq("TOPLEVEL: area=null (2 エリア)", topPatch.area, null);

const rexPatch = deriveCompanySwitchPatch("rexia");
// PR-1 (2026-06-07): REXIA に electric/kitakanto 追加 → 水道+電気の複数事業会社化、category=null へ
eq("REXIA (PR-1 後: 水道+電気の複数事業): category=null", rexPatch.category, null);
eq("REXIA: area=null (2 エリア: kanto, kitakanto)", rexPatch.area, null);

const dunkPatch = deriveCompanySwitchPatch("dunk");
// PR-1: DUNK に electric/kyushu 追加。元から複数事業 (水道+ロード) なので挙動不変、areas Set も {kansai,kyushu,chugoku} で不変
eq("DUNK (水道+ロード+電気 = 複数事業): category=null", dunkPatch.category, null);
eq("DUNK: area=null (3 エリア: kansai, kyushu, chugoku)", dunkPatch.area, null);

const uluaPatch = deriveCompanySwitchPatch("ulua");
eq("ULUA (電気のみ × 2 エリア): category=electric (★bug 修正の核心)", uluaPatch.category, "electric");
eq("ULUA: area=null (2 エリア)", uluaPatch.area, null);

const gritsPatch = deriveCompanySwitchPatch("grits");
eq("GriT's (探偵のみ × 2 エリア): category=detective (★bug 修正の核心)", gritsPatch.category, "detective");
eq("GriT's: area=null (2 エリア)", gritsPatch.area, null);

const sikkenPatch = deriveCompanySwitchPatch("sikken");
eq("SIKKEN Group (鍵×関西 = 1 ペア): category=locksmith (★bug 修正の核心)", sikkenPatch.category, "locksmith");
eq("SIKKEN Group: area=kansai (1 エリア)", sikkenPatch.area, "kansai");

const unassignedPatch = deriveCompanySwitchPatch("unassigned");
// 現状の COMPANIES では全 (cat, area) が 7 社に所属しているため unassigned.areas は 0 件
eq("未割当 (assignments 0 件): category=null", unassignedPatch.category, null);
eq("未割当: area=null", unassignedPatch.area, null);

const unknownPatch = deriveCompanySwitchPatch("unknown_company_id");
eq("未知 id: category=null", unknownPatch.category, null);
eq("未知 id: area=null", unknownPatch.area, null);
eq("未知 id: company=unknown_company_id (そのまま反映)", unknownPatch.company, "unknown_company_id");



// ── 12. PR-1 (2026-06-07): 未展開エリア 16 ペアの未割当自動算出 + DUNK/REXIA 電気追加 ─
//   反さん指示「ちょうど 16 件 (3+6+3+4)」「過不足ゼロで内訳一致」を厳密検証。
console.log("\n📋 12. PR-1: 未展開エリアを BUSINESSES に追加、computeUnassignedAreas() で 16 ペア自動算出");

// 12-1: ちょうど 16 件
eq("unassigned 件数 = 16 (反さん確定)", unassigned.areas.length, 16);

// 12-2: 内訳完全一致
const expectedUnassigned: Array<{ category: string; areaId: string }> = [
  // electric: nagoya, chugoku, hokkaido = 3
  { category: "electric", areaId: "nagoya" },
  { category: "electric", areaId: "chugoku" },
  { category: "electric", areaId: "hokkaido" },
  // locksmith: kanto, nagoya, kyushu, kitakanto, chugoku, hokkaido = 6
  { category: "locksmith", areaId: "kanto" },
  { category: "locksmith", areaId: "nagoya" },
  { category: "locksmith", areaId: "kyushu" },
  { category: "locksmith", areaId: "kitakanto" },
  { category: "locksmith", areaId: "chugoku" },
  { category: "locksmith", areaId: "hokkaido" },
  // detective: kanto, kyushu, hokkaido = 3
  { category: "detective", areaId: "kanto" },
  { category: "detective", areaId: "kyushu" },
  { category: "detective", areaId: "hokkaido" },
  // road: kanto, nagoya, kyushu, hokkaido = 4
  { category: "road", areaId: "kanto" },
  { category: "road", areaId: "nagoya" },
  { category: "road", areaId: "kyushu" },
  { category: "road", areaId: "hokkaido" },
];

// 期待値を Set 化 (順序非依存比較)
const actualSet = new Set(unassigned.areas.map((a) => `${a.category}|${a.areaId}`));
const expectedSet = new Set(expectedUnassigned.map((a) => `${a.category}|${a.areaId}`));

eq("unassigned: 期待 Set サイズ = 16", expectedSet.size, 16);
ok("unassigned: 実際 Set === 期待 Set (過不足ゼロ)",
  actualSet.size === expectedSet.size &&
  Array.from(actualSet).every((k) => expectedSet.has(k)));

// 内訳ごとに件数チェック (ミスマッチ時に原因特定容易化)
for (const cat of ["electric", "locksmith", "detective", "road"] as const) {
  const actualForCat = unassigned.areas.filter((a) => a.category === cat).map((a) => a.areaId).sort();
  const expectedForCat = expectedUnassigned.filter((a) => a.category === cat).map((a) => a.areaId).sort();
  ok(`unassigned[${cat}] = [${expectedForCat.join(",")}]`,
    JSON.stringify(actualForCat) === JSON.stringify(expectedForCat));
}

// water は未割当 0 件
ok("unassigned[water] = [] (water 全 8 エリアは 4 社所属で完備)",
  unassigned.areas.filter((a) => a.category === "water").length === 0);

// 12-3: getCompanyFor 新規 2 ペア
console.log("\n📋 12-3. getCompanyFor: 新規追加 2 ペアが正しい会社を返す");
eq("(electric, kyushu) → 'dunk' (PR-1 新規)", getCompanyFor("electric", "kyushu"), "dunk");
eq("(electric, kitakanto) → 'rexia' (PR-1 新規)", getCompanyFor("electric", "kitakanto"), "rexia");

// 12-4: 既存 5 社 (mavericks/toplevel/ulua/grits/sikken) の getCompanyAssignments が PR 前と一致
//   反さん指示「他 5 社は変更禁止」regression check。
console.log("\n📋 12-4. 既存 5 社の getCompanyAssignments 不変 regression");
eq("mavericks: 2 件 (water/kansai + water/hokkaido)", getCompanyAssignments("mavericks").length, 2);
eq("toplevel: 2 件 (water/nagoya + water/shizuoka)", getCompanyAssignments("toplevel").length, 2);
eq("ulua: 2 件 (electric/kansai + electric/kanto)", getCompanyAssignments("ulua").length, 2);
eq("grits: 2 件 (detective/kansai + detective/nagoya)", getCompanyAssignments("grits").length, 2);
eq("sikken: 1 件 (locksmith/kansai)", getCompanyAssignments("sikken").length, 1);

// 12-5: REXIA / DUNK は assignment 1 件ずつ増えている (PR-1 で意図した変更)
eq("rexia: 3 件 (water 2 + electric/kitakanto 新規)", getCompanyAssignments("rexia").length, 3);
eq("dunk: 4 件 (water 2 + road/kansai + electric/kyushu 新規)", getCompanyAssignments("dunk").length, 4);

// 12-6: deriveCompanySwitchPatch 既存挙動 regression (反さん指示)
//   ULUA → electric / GriT's → detective / SIKKEN → locksmith/kansai は不変
//   Mavericks/TOPLEVEL → water は不変
//   REXIA は PR-1 で水道+電気の複数事業会社化 → category=null に変わる (上記 §11 で更新済)
//   DUNK は元から複数事業 → 不変
console.log("\n📋 12-6. deriveCompanySwitchPatch 既存挙動 regression");
eq("ULUA → electric (不変、PR-1 でも変わらない)", deriveCompanySwitchPatch("ulua").category, "electric");
eq("GriT's → detective (不変)", deriveCompanySwitchPatch("grits").category, "detective");
eq("SIKKEN → locksmith (不変)", deriveCompanySwitchPatch("sikken").category, "locksmith");
eq("SIKKEN area → kansai (不変、1 ペア会社)", deriveCompanySwitchPatch("sikken").area, "kansai");
eq("Mavericks → water (不変)", deriveCompanySwitchPatch("mavericks").category, "water");
eq("TOPLEVEL → water (不変)", deriveCompanySwitchPatch("toplevel").category, "water");

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
