// 単独実行: npm run test:permissions
//
// lib/permissions.ts の A-1 / A-2 / A-1例外 / 議事録階層 を網羅する
// テーブル駆動テスト。仕様書 docs/specs/spec-form-redesign.md の §2 / §3
// と照合できるケースを揃える。
//
// テスト基盤 (vitest/jest) は未導入のため tsx で直接実行 (test:utils と
// 同じパターン)。

import {
  hasDataAccess,
  hasPageAccess,
  isA1Exception,
  canSeeDataOnPage,
  hasMinuteAccess,
  type Role,
  type AreaId,
  type BusinessCategory,
  type User,
} from "../app/lib/permissions";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(desc: string, fn: () => boolean) {
  try {
    if (fn()) {
      passed++;
    } else {
      failed++;
      failures.push(`❌ ${desc}`);
      console.error(`❌ ${desc}`);
    }
  } catch (e) {
    failed++;
    failures.push(`❌ ${desc} (threw: ${e instanceof Error ? e.message : String(e)})`);
    console.error(`❌ ${desc} (threw)`);
  }
}

function u(role: Role, area: AreaId | null = null, category: BusinessCategory | null = null): User {
  return { role, area_id: area, business_category: category };
}

// ============================================================
// A-1: hasDataAccess
// 仕様書 §2 のマトリクス全網羅
// ============================================================

console.log("\n=== A-1: hasDataAccess ===");

// --- 役員: 全エリア・全業態で edit/view ---
test("A-1: executive 自エリア edit", () =>
  hasDataAccess(u("executive", "kansai", "water"), "kansai", "water", "edit") === true);
test("A-1: executive 他エリア edit", () =>
  hasDataAccess(u("executive", "kansai", "water"), "kanto", "electric", "edit") === true);
test("A-1: executive area_id null でも他エリア edit (運用上 executive は area_id null)", () =>
  hasDataAccess(u("executive", null), "kansai", "water", "edit") === true);

// --- 副社長: 自領域 edit、他領域は view のみ ---
test("A-1: vice 自エリア edit", () =>
  hasDataAccess(u("vice", "kanto", "water"), "kanto", "water", "edit") === true);
test("A-1: vice 他エリア view 可", () =>
  hasDataAccess(u("vice", "kanto", "water"), "kansai", "water", "view") === true);
test("A-1: vice 他エリア edit 不可", () =>
  hasDataAccess(u("vice", "kanto", "water"), "kansai", "water", "edit") === false);
test("A-1: vice 他業態 view 可、edit 不可", () =>
  hasDataAccess(u("vice", "kanto", "water"), "kanto", "electric", "view") === true &&
  hasDataAccess(u("vice", "kanto", "water"), "kanto", "electric", "edit") === false);

// --- 部長: 自領域 edit、他領域は view のみ ---
test("A-1: manager 自エリア edit", () =>
  hasDataAccess(u("manager", "kansai", "water"), "kansai", "water", "edit") === true);
test("A-1: manager 他エリア view 可、edit 不可", () =>
  hasDataAccess(u("manager", "kansai", "water"), "kyushu", "water", "view") === true &&
  hasDataAccess(u("manager", "kansai", "water"), "kyushu", "water", "edit") === false);

// --- 課長: 自領域 edit のみ、他は完全× ---
test("A-1: chief 自エリア edit", () =>
  hasDataAccess(u("chief", "kyushu", "water"), "kyushu", "water", "edit") === true);
test("A-1: chief 他エリア view 不可", () =>
  hasDataAccess(u("chief", "kyushu", "water"), "kansai", "water", "view") === false);
test("A-1: chief 他業態 view 不可", () =>
  hasDataAccess(u("chief", "kyushu", "water"), "kyushu", "electric", "view") === false);

// --- 社員: 自領域 edit のみ、他は完全× (★ 主目的) ---
test("A-1: staff 自エリア edit (★主目的)", () =>
  hasDataAccess(u("staff", "kyushu", "water"), "kyushu", "water", "edit") === true);
test("A-1: staff 他エリア view 不可", () =>
  hasDataAccess(u("staff", "kyushu", "water"), "kansai", "water", "view") === false);
test("A-1: staff 他業態 view 不可", () =>
  hasDataAccess(u("staff", "kyushu", "water"), "kyushu", "electric", "view") === false);

// --- 事務員: 自領域 edit のみ、他は完全× ---
test("A-1: clerk 自エリア edit", () =>
  hasDataAccess(u("clerk", "kansai", "water"), "kansai", "water", "edit") === true);
test("A-1: clerk 他エリア view 不可", () =>
  hasDataAccess(u("clerk", "kansai", "water"), "kanto", "water", "view") === false);

// --- 業態判定スキップ (PR #38 暫定: business_category null) ---
test("A-1: business_category null なら業態判定スキップで自エリア edit (暫定)", () =>
  hasDataAccess(u("staff", "kansai", null), "kansai", "water", "edit") === true);
test("A-1: business_category null でも他エリアは× (staff)", () =>
  hasDataAccess(u("staff", "kansai", null), "kanto", "water", "edit") === false);

// --- 将来稼働予定の area × category 組み合わせ ---
test("A-1: electric × kyushu 責任者が自エリア edit (将来枠)", () =>
  hasDataAccess(u("manager", "kyushu", "electric"), "kyushu", "electric", "edit") === true);
test("A-1: electric × kitakanto 責任者が自エリア edit (将来枠)", () =>
  hasDataAccess(u("manager", "kitakanto", "electric"), "kitakanto", "electric", "edit") === true);
test("A-1: water × shizuoka 責任者が自エリア edit (将来枠)", () =>
  hasDataAccess(u("manager", "shizuoka", "water"), "shizuoka", "water", "edit") === true);

// ============================================================
// A-2: hasPageAccess
// 仕様書 §3 のマトリクス重要セルを網羅
// ============================================================

console.log("\n=== A-2: hasPageAccess ===");

// --- ダッシュボード: 全ロール edit (★ staff 解禁) ---
test("A-2: staff が dashboard を edit 可 (★ 山口・芝田が入力できる)", () =>
  hasPageAccess(u("staff"), "dashboard", "edit") === true);
test("A-2: clerk も dashboard を edit 可", () =>
  hasPageAccess(u("clerk"), "dashboard", "edit") === true);

// --- import / data-io / admin: executive のみ ---
test("A-2: staff が import edit 不可", () =>
  hasPageAccess(u("staff"), "import", "edit") === false);
test("A-2: vice が import view 不可", () =>
  hasPageAccess(u("vice"), "import", "view") === false);
test("A-2: executive のみ data-io edit 可", () =>
  hasPageAccess(u("executive"), "data-io", "edit") === true &&
  hasPageAccess(u("vice"), "data-io", "view") === false);
test("A-2: executive のみ admin edit 可", () =>
  hasPageAccess(u("executive"), "admin", "edit") === true &&
  hasPageAccess(u("manager"), "admin", "view") === false);

// --- targets: clerk × ---
test("A-2: clerk が targets edit 不可", () =>
  hasPageAccess(u("clerk"), "targets", "edit") === false);
test("A-2: clerk が targets view 不可", () =>
  hasPageAccess(u("clerk"), "targets", "view") === false);
test("A-2: staff が targets edit 可", () =>
  hasPageAccess(u("staff"), "targets", "edit") === true);

// --- meeting: clerk × ---
test("A-2: clerk が meeting view 不可", () =>
  hasPageAccess(u("clerk"), "meeting", "view") === false);
test("A-2: staff が meeting view 可", () =>
  hasPageAccess(u("staff"), "meeting", "view") === true);

// --- minutes: clerk × ---
test("A-2: clerk が minutes view 不可", () =>
  hasPageAccess(u("clerk"), "minutes", "view") === false);
test("A-2: staff が minutes edit 可", () =>
  hasPageAccess(u("staff"), "minutes", "edit") === true);

// --- breakeven: executive/vice のみ ---
test("A-2: vice が breakeven view 可", () =>
  hasPageAccess(u("vice"), "breakeven", "view") === true);
test("A-2: manager が breakeven view 不可", () =>
  hasPageAccess(u("manager"), "breakeven", "view") === false);

// --- mobile-kpi: clerk × ---
test("A-2: staff が mobile-kpi view 可", () =>
  hasPageAccess(u("staff"), "mobile-kpi", "view") === true);
test("A-2: vice が mobile-kpi edit 可", () =>
  hasPageAccess(u("vice"), "mobile-kpi", "edit") === true);
test("A-2: manager が mobile-kpi edit 不可 (view のみ)", () =>
  hasPageAccess(u("manager"), "mobile-kpi", "edit") === false &&
  hasPageAccess(u("manager"), "mobile-kpi", "view") === true);
test("A-2: clerk が mobile-kpi view 不可", () =>
  hasPageAccess(u("clerk"), "mobile-kpi", "view") === false);

// --- matrix: executive/vice のみ ---
test("A-2: vice が matrix view 可", () =>
  hasPageAccess(u("vice"), "matrix", "view") === true);
test("A-2: manager が matrix view 不可", () =>
  hasPageAccess(u("manager"), "matrix", "view") === false);

// --- trends / ranking: clerk × ---
test("A-2: staff が trends view 可", () =>
  hasPageAccess(u("staff"), "trends", "view") === true);
test("A-2: clerk が trends view 不可", () =>
  hasPageAccess(u("clerk"), "trends", "view") === false);
test("A-2: clerk が ranking view 不可", () =>
  hasPageAccess(u("clerk"), "ranking", "view") === false);

// --- cockpit: 既存挙動維持で executive only ---
test("A-2: executive のみ cockpit edit 可 (既存挙動)", () =>
  hasPageAccess(u("executive"), "cockpit", "edit") === true &&
  hasPageAccess(u("vice"), "cockpit", "view") === false);

// --- entry (PR #39 新ページ): 全ロール edit ---
test("A-2: executive が entry edit 可", () =>
  hasPageAccess(u("executive"), "entry", "edit") === true);
test("A-2: clerk が entry edit 可 (★ 事務員も日次入力)", () =>
  hasPageAccess(u("clerk"), "entry", "edit") === true);
test("A-2: staff が entry edit 可 (★ 山口・芝田が入力できる)", () =>
  hasPageAccess(u("staff"), "entry", "edit") === true);
test("A-1+entry: staff が自エリアで entry edit 可 (組合せ)", () =>
  hasPageAccess(u("staff", "kyushu", "water"), "entry", "edit") === true &&
  hasDataAccess(u("staff", "kyushu", "water"), "kyushu", "water", "edit") === true);
test("A-1+entry: staff が他エリアで entry edit 不可 (A-1 で弾かれる)", () =>
  hasPageAccess(u("staff", "kyushu", "water"), "entry", "edit") === true &&
  hasDataAccess(u("staff", "kyushu", "water"), "kansai", "water", "edit") === false);
test("A-1+entry: vice が他エリアで entry view のみ", () =>
  hasPageAccess(u("vice", "kanto", "water"), "entry", "edit") === true &&
  hasDataAccess(u("vice", "kanto", "water"), "kansai", "water", "view") === true &&
  hasDataAccess(u("vice", "kanto", "water"), "kansai", "water", "edit") === false);

// ============================================================
// A-1 例外: canSeeDataOnPage
// 仕様書 §2 後段「trends/ranking/matrix は越境閲覧可」
// ============================================================

console.log("\n=== A-1 例外: canSeeDataOnPage ===");

test("A-1例外: staff が ranking で他エリア view 可 (★A-1緩和)", () =>
  canSeeDataOnPage(u("staff", "kansai", "road"), "ranking", "kanto", "water") === true);
test("A-1例外: staff が trends で他エリア view 可 (★A-1緩和)", () =>
  canSeeDataOnPage(u("staff", "kansai", "road"), "trends", "kyushu", "electric") === true);
test("A-1例外: vice が matrix で他エリア view 可", () =>
  canSeeDataOnPage(u("vice", "kanto", "water"), "matrix", "kansai", "electric") === true);

test("A-1例外不適用: staff が dashboard で他エリア view 不可", () =>
  canSeeDataOnPage(u("staff", "kansai", "road"), "dashboard", "kanto", "water") === false);
test("A-1例外不適用: staff が targets で他エリア view 不可", () =>
  canSeeDataOnPage(u("staff", "kansai", "road"), "targets", "kanto", "water") === false);

test("A-1例外: clerk は trends 自体に view 権限ないため他エリアも見えない", () =>
  canSeeDataOnPage(u("clerk", "kansai", "water"), "trends", "kanto", "water") === false);

test("isA1Exception: trends/ranking/matrix のみ true", () =>
  isA1Exception("trends") === true &&
  isA1Exception("ranking") === true &&
  isA1Exception("matrix") === true &&
  isA1Exception("dashboard") === false &&
  isA1Exception("targets") === false);

// ============================================================
// 議事録階層: hasMinuteAccess
// 仕様書 §3 後段
// ============================================================

console.log("\n=== 議事録階層: hasMinuteAccess ===");

// --- executive: 全ロールの議事録閲覧可 ---
test("議事録: executive が staff 議事録 view 可", () =>
  hasMinuteAccess(u("executive"), "staff") === true);
test("議事録: executive が clerk 議事録 view 可", () =>
  hasMinuteAccess(u("executive"), "clerk") === true);

// --- vice: vice 以下 ---
test("議事録: vice が manager 議事録 view 可", () =>
  hasMinuteAccess(u("vice"), "manager") === true);
test("議事録: vice が executive 議事録 view 不可", () =>
  hasMinuteAccess(u("vice"), "executive") === false);

// --- manager: manager 以下 ---
test("議事録: manager が vice 議事録 view 不可", () =>
  hasMinuteAccess(u("manager"), "vice") === false);
test("議事録: manager が staff 議事録 view 可", () =>
  hasMinuteAccess(u("manager"), "staff") === true);

// --- chief: chief 以下 ---
test("議事録: chief が manager 議事録 view 不可", () =>
  hasMinuteAccess(u("chief"), "manager") === false);
test("議事録: chief が staff 議事録 view 可", () =>
  hasMinuteAccess(u("chief"), "staff") === true);

// --- staff: staff のみ ---
test("議事録: staff が staff 議事録 view 可", () =>
  hasMinuteAccess(u("staff"), "staff") === true);
test("議事録: staff が chief 議事録 view 不可", () =>
  hasMinuteAccess(u("staff"), "chief") === false);

// --- clerk: 全議事録 view 不可 ---
test("議事録: clerk が staff 議事録 view 不可", () =>
  hasMinuteAccess(u("clerk"), "staff") === false);
test("議事録: clerk が executive 議事録 view 不可", () =>
  hasMinuteAccess(u("clerk"), "executive") === false);

// ============================================================
// 結果サマリ
// ============================================================

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`\n${failed} failures:\n${failures.join("\n")}`);
}
process.exit(failed > 0 ? 1 : 0);
