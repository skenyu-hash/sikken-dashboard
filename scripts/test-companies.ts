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
ok("DUNK categories = [water, road]",
  JSON.stringify(dunkSel.categories.sort()) === JSON.stringify(["road", "water"]));
ok("DUNK areas = [kansai, kyushu, chugoku] (順不同)",
  JSON.stringify(dunkSel.areas.sort()) === JSON.stringify(["chugoku", "kansai", "kyushu"]));

// 未割当 / 未知 id は空
const unkSel = getCompanyCategoriesAndAreas("unknown_id");
ok("unknown id: categories 空", unkSel.categories.length === 0);
ok("unknown id: areas 空", unkSel.areas.length === 0);

// ── 8. getCompanyAssignments ─────────────────────
console.log("\n📋 8. getCompanyAssignments (assignments そのまま展開)");
const rexiaA = getCompanyAssignments("rexia");
eq("REXIA assignments 件数 = 2", rexiaA.length, 2);
ok("REXIA 全件 water",
  rexiaA.every((a) => a.category === "water"));
ok("REXIA areas = [kanto, kitakanto]",
  JSON.stringify(rexiaA.map((a) => a.areaId).sort()) === JSON.stringify(["kanto", "kitakanto"]));

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

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
