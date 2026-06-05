// c96-3 純関数テスト: buildDailyReportText 拡張モード (視点 / 期間ラベル) 対応検証。
//
// 単独実行: npm run test:integration:c96-3-build-text-extended (DB 不要、純関数)
//
// 検証範囲:
//   1. 既存モード (isExtended 未指定): ヘッダー "【日報】date / area / category"、KPI ラベル "今日"
//   2. 拡張モード + 単日 (isExtended=true / viewLabel あり / periodLabel なし): "【日報】viewLabel / date" "今日"
//   3. 拡張モード + 期間 (isExtended=true / viewLabel + periodLabel): "【日報】viewLabel / periodLabel" "期間"
//   4. kpi.today=null フォールバック (期間モードでもクラッシュなし)
//   5. HELP 個人別が空でも壊れない

import { buildDailyReportText } from "../app/entry/lib/buildDailyReportText";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); failed++; }
}

console.log("🧪 c96-3: buildDailyReportText 拡張モード検証\n");

const baseKpi = {
  today: { sales: 1000000, profit: 200000, count: 10, unitPrice: 100000, profitRate: 20.0 },
  monthly: { sales: 5000000, profit: 1000000, count: 50 },
};
const baseInput = {
  date: "2026-05-15",
  areaName: "関西",
  categoryLabel: "水道",
  hasHelp: false,
  kpi: baseKpi,
  helpStaffMonthly: [],
};

// ── 1. 既存モード (isExtended 未指定) ─────────────────
console.log("📋 1. 既存モード (Modal 経由、isExtended 未指定)");
const text1 = buildDailyReportText(baseInput);
ok("ヘッダー '【日報】2026-05-15 / 関西 / 水道' 含む", text1.includes("【日報】2026-05-15 / 関西 / 水道"));
ok("KPI ラベル '今日 売上' 含む", text1.includes("今日 売上"));
ok("KPI ラベル '今日 粗利率' 含む", text1.includes("今日粗利率"));
ok("既存挙動: viewLabel/periodLabel が出ない", !text1.includes("viewLabel") && !text1.includes("periodLabel"));

// ── 2. 拡張モード + 単日 ─────────────────────────────
console.log("\n📋 2. 拡張モード + 単日 (isExtended=true / viewLabel あり / periodLabel なし)");
const text2 = buildDailyReportText({
  ...baseInput,
  isExtended: true,
  viewLabel: "Mavericks (水道)",
});
ok("ヘッダー '【日報】Mavericks (水道) / 2026-05-15' 含む", text2.includes("【日報】Mavericks (水道) / 2026-05-15"));
ok("KPI ラベル '今日 売上' (期間なし=今日のまま)", text2.includes("今日 売上"));
ok("既存 'date / areaName / categoryLabel' フォーマットは含まれない (viewLabel 置換)", !text2.includes("/ 関西 / 水道"));

// ── 3. 拡張モード + 期間 ─────────────────────────────
console.log("\n📋 3. 拡張モード + 期間 (isExtended=true / viewLabel + periodLabel)");
const text3 = buildDailyReportText({
  ...baseInput,
  isExtended: true,
  viewLabel: "グループ全体",
  periodLabel: "5/1〜5/15",
});
ok("ヘッダー '【日報】グループ全体 / 5/1〜5/15' 含む", text3.includes("【日報】グループ全体 / 5/1〜5/15"));
ok("KPI ラベル '期間 売上' (期間モード)", text3.includes("期間 売上"));
ok("KPI ラベル '期間 粗利率' (期間モード)", text3.includes("期間粗利率"));
ok("'今日' ラベルが出ない (期間に置換)", !text3.includes("今日 売上") && !text3.includes("今日 粗利"));

// ── 4. kpi.today=null フォールバック ────────────────
console.log("\n📋 4. kpi.today=null (データなし、クラッシュなし)");
const text4 = buildDailyReportText({
  ...baseInput,
  kpi: { today: null, monthly: baseKpi.monthly },
  isExtended: true,
  viewLabel: "REXIA",
  periodLabel: "5/1〜5/15",
});
ok("text4 生成成功 (クラッシュなし)", typeof text4 === "string" && text4.length > 0);
ok("'当日 データなし' 含む", text4.includes("当日 データなし"));
ok("月累計 売上 行が出る (フォールバック)", text4.includes("月累計 売上"));

// ── 5. HELP 個人別あり (拡張モード + 合算範囲集約後の配列) ──
console.log("\n📋 5. HELP 個人別 (合算範囲集約済み)");
const text5 = buildDailyReportText({
  ...baseInput,
  hasHelp: true,
  helpStaffMonthly: [
    { staff_name: "田中", help_sales: 800000, help_count: 1, help_close_count: 1 },
    { staff_name: "佐藤", help_sales: 500000, help_count: 1, help_close_count: 0 },
  ],
  companyReference: { totalRevenue: 10000000, totalCount: 100, constructionCount: 30 },
  isExtended: true,
  viewLabel: "水道事業 (全エリア)",
  periodLabel: "5/1〜5/15",
});
ok("HELP セクション '▼ ⑤HELP' 含む", text5.includes("▼ ⑤HELP"));
ok("担当者 '田中' 含む", text5.includes("田中"));
ok("担当者 '佐藤' 含む", text5.includes("佐藤"));
ok("売上高率 含む", text5.includes("売上高率"));
ok("ヘッダー '【日報】水道事業 (全エリア) / 5/1〜5/15'", text5.includes("【日報】水道事業 (全エリア) / 5/1〜5/15"));

// ── 6. helpStaffMonthly 空配列 (壊れない担保) ────────
console.log("\n📋 6. helpStaffMonthly 空 + hasHelp=true");
const text6 = buildDailyReportText({
  ...baseInput,
  hasHelp: true,
  helpStaffMonthly: [],
  isExtended: true,
  viewLabel: "GriT's",
});
ok("'HELP 対応なし' 含む", text6.includes("HELP 対応なし"));

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
