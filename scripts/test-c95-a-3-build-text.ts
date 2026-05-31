// PR c95-A-3 純関数テスト: 日報テキスト共有 (buildDailyReportText.ts)。
//
// 単独実行: npm run test:integration:c95-a-3-build-text (DB 不要、純関数)
//
// 設計: 本 lib は presentation 純関数。粗利式・KPI 値は caller (DailyReportModal が
//   業態別 Section から取得) で予め計算して渡す。lib は formatting のみ責務を持つ。
//   理由: 粗利式は業態別 (locksmith は locksmith_construction_cost + commission を引く等)。
//        formatter に業態 branching を入れると複雑度が増し、テストもしにくい。
//
// 検証範囲:
//   1. ヘッダ: 【日報】date / areaName / categoryLabel
//   2. KPI 帯: 今日 + 現在地、粗利率 (当日ベース、null は表示省略)
//   3. ⑤HELP: hasHelp=true のみ、担当者別 (月累計) + 会社参照 + 引継率 / 売上高率
//   4. 閾値超過: ⚠ マーカー (顧客単価 / 成約率 / 引継率系)
//   5. 0 件担当者: 「–」表示、閾値判定対象外 (赤マーカーなし)
//   6. hasHelp=false (road/detective): HELP セクション出力なし
//   7. データなし: kpi.today=null → 「データなし」表示

import { buildDailyReportText } from "../app/entry/lib/buildDailyReportText";
import type { HelpStaffMonthly } from "../app/entry/lib/helpStats";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); failed++; }
}
function contains(name: string, text: string, needle: string) {
  ok(`${name} 含む "${needle}"`, text.includes(needle));
  if (!text.includes(needle)) console.log(`     full text:\n${text}\n----`);
}
function notContains(name: string, text: string, needle: string) {
  ok(`${name} 含まない "${needle}"`, !text.includes(needle));
  if (text.includes(needle)) console.log(`     full text:\n${text}\n----`);
}

console.log("🧪 PR c95-A-3: buildDailyReportText 純関数検証\n");

// 共通の入力 — 水道モック想定値で組み立て
const kpiToday1 = { sales: 4897700, profit: 1866246, count: 35, unitPrice: 139934, profitRate: 38.1 };
const kpiMonthly1 = { sales: 120500000, profit: 45600000, count: 800 };
const companyRef1 = { totalRevenue: 120500000, totalCount: 800, constructionCount: 240 };
const helpStaffMonthly1: HelpStaffMonthly[] = [
  { staff_name: "田中", help_sales: 120000, help_count: 3, help_close_count: 2 }, // 単価 40000 ⚠, 成約率 66.7% ⚠
  { staff_name: "佐藤", help_sales: 80000,  help_count: 2, help_close_count: 1 }, // 単価 40000 ⚠, 成約率 50% ⚠
  { staff_name: "鈴木", help_sales: 0,      help_count: 0, help_close_count: 0 }, // 0 件 → "–", 閾値対象外
];

// ── 1. 基本フォーマット (水道、HELP あり) ──────────────
console.log("📋 1. 基本フォーマット (水道、HELP あり)");
const t1 = buildDailyReportText({
  date: "2026-05-30", areaName: "関西", categoryLabel: "水道", hasHelp: true,
  kpi: { today: kpiToday1, monthly: kpiMonthly1 },
  helpStaffMonthly: helpStaffMonthly1,
  companyReference: companyRef1,
});
contains("ヘッダ日付", t1, "2026-05-30");
contains("エリア名", t1, "関西");
contains("業態名", t1, "水道");
contains("【日報】 ヘッダ", t1, "【日報】");
contains("今日 売上", t1, "¥4,897,700");
contains("月累計 売上", t1, "¥120,500,000");
contains("粗利率 (当日ベース) ラベル", t1, "粗利率");
contains("粗利率 値 38.1%", t1, "38.1%");
contains("当日件数", t1, "35件");
contains("月累計件数", t1, "800件");
// HELP セクション
contains("HELP セクションヘッダ", t1, "⑤HELP");
contains("田中の名前", t1, "田中");
contains("田中の売上", t1, "¥120,000");
contains("佐藤の名前", t1, "佐藤");
contains("鈴木の名前 (0 件担当者でも残す)", t1, "鈴木");
contains("0 件担当者 「–」 表示", t1, "–");
// 閾値マーカー
contains("⚠ アラート記号", t1, "⚠");
// 会社参照
contains("会社参照 売上", t1, "¥120,500,000");
contains("会社参照 件数", t1, "800");

// ── 2. hasHelp=false (road) → HELP セクションなし ─────
console.log("\n📋 2. hasHelp=false (road) → HELP セクションなし");
const t2 = buildDailyReportText({
  date: "2026-05-30", areaName: "関西", categoryLabel: "ロード", hasHelp: false,
  kpi: { today: kpiToday1, monthly: kpiMonthly1 },
  helpStaffMonthly: helpStaffMonthly1, // 渡しても無視される
});
notContains("ロード: HELP セクションヘッダなし", t2, "⑤HELP");
notContains("ロード: 田中の名前なし", t2, "田中");

// ── 3. hasHelp=false (detective) → 同様 ───────────────
console.log("\n📋 3. hasHelp=false (detective)");
const t3 = buildDailyReportText({
  date: "2026-05-30", areaName: "名古屋", categoryLabel: "探偵", hasHelp: false,
  kpi: { today: kpiToday1, monthly: kpiMonthly1 },
  helpStaffMonthly: helpStaffMonthly1,
});
notContains("探偵: HELP セクションヘッダなし", t3, "⑤HELP");

// ── 4. データなし (kpi.today=null) ─────────────────────
console.log("\n📋 4. 未入力日 (kpi.today=null)");
const t4 = buildDailyReportText({
  date: "2026-05-30", areaName: "関西", categoryLabel: "水道", hasHelp: true,
  kpi: { today: null, monthly: kpiMonthly1 },
  helpStaffMonthly: [],
  companyReference: companyRef1,
});
contains("ヘッダ日付は出る", t4, "2026-05-30");
contains("データなし表示", t4, "データなし");
contains("月累計 売上は出る (summary 由来は表示)", t4, "¥120,500,000");

// ── 5. 閾値超過なし (健全データ) → ⚠ なし ────────────
console.log("\n📋 5. 健全データ (閾値超過なし) → ⚠ マーカーなし");
const healthyHelpMonthly: HelpStaffMonthly[] = [
  // 単価 700000 (>650000)、成約率 90% (>70%)
  { staff_name: "田中", help_sales: 7000000, help_count: 10, help_close_count: 9 },
];
// 引継率対総 10/100 = 10% (>5%)、対工事 10/30 = 33.3% (>30%)
const healthyRef = { totalRevenue: 100000000, totalCount: 100, constructionCount: 30 };
const t5 = buildDailyReportText({
  date: "2026-05-30", areaName: "関西", categoryLabel: "水道", hasHelp: true,
  kpi: { today: kpiToday1, monthly: kpiMonthly1 },
  helpStaffMonthly: healthyHelpMonthly, companyReference: healthyRef,
});
notContains("健全データ ⚠ マーカーなし", t5, "⚠");

// ── 6. helpStaffMonthly 空配列 (HELP 対応なし日) ───────
console.log("\n📋 6. helpStaffMonthly 空配列 (HELP 対応なし日)");
const t6 = buildDailyReportText({
  date: "2026-05-30", areaName: "関西", categoryLabel: "水道", hasHelp: true,
  kpi: { today: kpiToday1, monthly: kpiMonthly1 },
  helpStaffMonthly: [], companyReference: companyRef1,
});
contains("水道は HELP セクションヘッダ出る", t6, "⑤HELP");
contains("HELP 対応なしの注記", t6, "HELP 対応なし");

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
