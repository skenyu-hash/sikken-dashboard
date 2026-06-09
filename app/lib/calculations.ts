// 経営ダッシュボード ビジネスロジック
// 全ての金額は「円(整数)」、件数は「件(整数)」を想定

import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM, toYyyyMm } from "./consultantFee";

export type DailyEntry = {
  date: string; // YYYY-MM-DD
  // 全体
  totalCount: number;          // 全体件数
  constructionCount: number;   // 10万以上の工事件数
  // 自社施工部門
  selfRevenue: number;
  selfProfit: number;
  selfCount: number;
  // 新規営業部門
  newRevenue: number;
  newMaterial: number;
  newLabor: number;
  newCount: number;
  // 追加/ヘルプ部門
  addRevenue: number;
  addMaterial: number;
  addLabor: number;
  addCount: number;

  // ===== Phase 1 拡張項目 =====
  insourceCount?: number;   // 内製対応件数
  outsourceCount?: number;  // 外注対応件数
  reviewCount?: number;     // 口コミ件数
  helpRevenue?: number;     // HELP売上
  helpCount?: number;       // HELP件数
  adCost?: number;          // 広告費
  laborCost?: number;       // 職人費(全体)
  materialCost?: number;    // 材料費(全体)
  outsourceCost?: number;   // 営業外注費
  vehicleCount?: number;    // 車両数

  // ===== PR c90-2: /entry 日次差分入力モデルで保存される全フィールド =====
  // EntryFormState (app/entry/types.ts) と 1:1 対応。すべて optional で旧 DailyEntry
  // との互換性を保ち、entries.data JSONB に直接格納される。aggregateMonthlySummary
  // (app/lib/monthlyAggregation.ts) はこれらを (data->>'xxx')::numeric で SUM 集計する。
  //
  // フィールドが unset の月 (4 月以前 / 旧データ) は SQL の COALESCE で 0 扱い。
  // 新列追加時は: types.ts (EntryFormState) → ここ → AGGREGATION_MAPPING.md →
  //   monthlyAggregation.ts の SQL の 4 箇所を同時更新する必要 (KNOWN_ISSUES §7)。

  // ① 新規対応 (7) — water/electric/locksmith/road/detective 共通
  outsourced_sales_revenue?: number;
  internal_staff_revenue?: number;
  outsourced_response_count?: number;
  internal_staff_response_count?: number;
  repeat_count?: number;
  revisit_count?: number;
  review_count?: number;

  // ② コスト (4 + PR c95-D-1 で 5 項目目 consultant_fee を water 専用追加、optional)
  total_labor_cost?: number;
  material_cost?: number;
  sales_outsourcing_cost?: number;
  card_processing_fee?: number;
  // PR c95-D-1 (slice 1+2): water 業態 コンサル費 手入力。他業態は常に 0。
  //   旧 c95-B 自動 (売上 × 7.7%) は本 PR untouch、slice 3-5 で計算経路を手入力ベースに切替予定。
  consultant_fee?: number;

  // ③ 広告 (3)
  ad_cost?: number;
  call_count?: number;
  acquisition_count?: number;

  // ④ 施工 (4)
  // PR c93-2: 工事件数 (対応ベース) — 新規入力フィールド。
  //   旧 outsourced + internal の発注ベース合算 (二重カウント) を撤去し、対応 1 件 =
  //   工事 1 件 (10万円以上) に再定義。旧フィールドは後方互換のため保持。
  construction_count?: number;
  outsourced_construction_count?: number; // 残置 (UI 撤去、aggregation の fallback で参照)
  internal_construction_count?: number;   // 意味変更: 会社内製化分のみ (営業マン自施工除外)
  outsourced_construction_cost?: number;
  internal_construction_profit?: number;

  // ⑤ HELP (2)
  help_count?: number;
  help_revenue?: number;

  // 電気業態専用 (PR #48b)
  switchboard_count?: number;

  // 鍵業態専用 (PR #51) — 獲得 4 内訳 + コスト 2
  locksmith_car_lp_email_count?: number;
  locksmith_inhouse_count?: number;
  locksmith_repeat_count?: number;
  locksmith_revisit_count?: number;
  locksmith_construction_cost?: number;
  locksmith_commission_fee?: number;

  // ロード業態専用 (PR #52 + #58c) — 獲得 7 + 入電 7 + 保険売上 2 + 販管費
  road_ad_count?: number;
  road_repeat_count?: number;
  road_referral_count?: number;
  road_revisit_count?: number;
  road_wellnest_count?: number;
  road_seo_count?: number;
  road_insurance_count?: number;
  road_ad_call_count?: number;
  road_repeat_call_count?: number;
  road_referral_call_count?: number;
  road_revisit_call_count?: number;
  road_wellnest_call_count?: number;
  road_seo_call_count?: number;
  road_insurance_call_count?: number;
  road_insurance_revenue?: number;
  road_non_insurance_revenue?: number;
  road_selling_admin_cost?: number;

  // 探偵業態専用 (PR #53 + #57 + #58b) — 面談 2 + 入電 4 + 獲得 6 + 販管費
  detective_meeting_count?: number;
  detective_cancel_count?: number;
  detective_phone_only_call_count?: number;
  detective_mail_only_call_count?: number;
  detective_line_only_call_count?: number;
  detective_wrong_call_count?: number;
  detective_phone_uwaki_acquisition_count?: number;
  detective_phone_other_acquisition_count?: number;
  detective_mail_uwaki_acquisition_count?: number;
  detective_mail_other_acquisition_count?: number;
  detective_line_uwaki_acquisition_count?: number;
  detective_line_other_acquisition_count?: number;
  detective_selling_admin_cost?: number;

  // 体制 (PR c94-C) — スナップショット (MAX 集計)。
  //   entries.data JSONB に snake_case で格納。aggregation が data->>'xxx' を MAX。
  //   PR c94-C-2: /entry ⑥ 体制セクションから両者を書き込み開始。
  //   注: 旧 camelCase vehicleCount (L34) は entries[] 由来の別レガシー経路。
  //       aggregation / monthly_summaries 経路は本 snake_case を使う。
  vehicle_count?: number;
  trainee_count?: number;

  // ⑤ HELP — PR c95-A-2: 担当者別配列 (Effect B 既存読込 / handleSave 書込で使用)。
  //   entries.data には G1 案 (b) で本配列 + 派生 scalar (help_count/help_revenue) を併存書込。
  //   aggregation は scalar を SUM するため SQL 変更不要 (後方互換)。
  help_staff?: Array<{
    staff_name?: string;
    help_sales?: number;
    help_count?: number;
    help_close_count?: number;
  }>;
};

export type DepartmentSummary = {
  revenue: number;
  profit: number;
  count: number;
  unitPrice: number;
};

export type DashboardSummary = {
  self: DepartmentSummary;
  newSales: DepartmentSummary;
  help: DepartmentSummary;
  totalRevenue: number;
  totalCount: number;
  totalProfit: number;
  companyUnitPrice: number;
  forecastProfit: number;
  forecastRevenue: number;
  constructionRate: number;
  helpRate: number;
  daysElapsed: number;
  daysInMonth: number;
  // 拡張KPI
  insourceCount: number;
  outsourceCount: number;
  insourceRate: number;     // 内製化率(%)
  outsourceRate: number;    // 外注比率(%)
  reviewCount: number;
  totalAdCost: number;
  totalLaborCost: number;
  totalMaterialCost: number;
  totalSalesOutsourcingCost: number;  // 営業外注費 (PR #38 sales_outsourcing_cost 由来)
  outsourcedConstructionCount: number; // 外注工事件数 (PR #38 outsourced_construction_count 由来、後方互換)
  internalConstructionCount: number;   // 自社工事件数 (PR c93-2 で意味変更: 会社内製化分のみ)
  // PR c93-2: 工事件数 (対応ベース) — monthly_summaries.construction_count 由来。
  //   旧 outsourced + internal の合算 (発注ベース、各社統計表と不一致で工事取得率 100%
  //   超え問題) を撤去し、対応 1 件 = 工事 1 件 (10万円以上) で再定義。
  constructionCount: number;
  // PR c93-3: 自社工事利益 (monthly_summaries.internal_construction_profit 由来)。
  //   水道業態 MetricsTable に独立 row として表示するための流入経路。
  //   c93-1 で粗利加算からは外し済 (内製化ボーナス廃止)、把握用として独立表示。
  internalConstructionProfit: number;
  grossMargin: number;      // 粗利率(%)
  vehicleCount: number;     // 車両数
  traineeCount: number;     // 研修生(営業マン)数 — PR c94-C-3a
};

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getDaysElapsed(today: Date, year: number, month: number): number {
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  if (ty !== year || tm !== month) {
    if (ty > year || (ty === year && tm > month)) return getDaysInMonth(year, month);
    return 0;
  }
  return today.getDate();
}

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);
const n = (v: number | undefined) => v ?? 0;

function summarize(revenue: number, profit: number, count: number): DepartmentSummary {
  return { revenue, profit, count, unitPrice: Math.round(safeDiv(revenue, count)) };
}

export function calculateDashboard(
  entries: DailyEntry[],
  targetYear: number,
  targetMonth: number,
  today: Date = new Date()
): DashboardSummary {
  let selfRev = 0, selfProf = 0, selfCnt = 0;
  let newRev = 0, newProf = 0, newCnt = 0;
  let addRev = 0, addProf = 0, addCnt = 0;
  let totalCount = 0;
  let constructionCount = 0;
  let insourceCount = 0;
  let outsourceCount = 0;
  let reviewCount = 0;
  let totalAdCost = 0;
  let totalLaborCost = 0;
  let totalMaterialCost = 0;
  let totalSalesOutsourcingCost = 0;

  for (const e of entries) {
    selfRev += e.selfRevenue;
    selfProf += e.selfProfit;
    selfCnt += e.selfCount;

    newRev += e.newRevenue;
    newProf += e.newRevenue - e.newMaterial - e.newLabor;
    newCnt += e.newCount;

    addRev += e.addRevenue + n(e.helpRevenue);
    addProf += e.addRevenue - e.addMaterial - e.addLabor;
    addCnt += e.addCount + n(e.helpCount);

    totalCount += e.totalCount;
    constructionCount += e.constructionCount;

    insourceCount += n(e.insourceCount);
    outsourceCount += n(e.outsourceCount);
    reviewCount += n(e.reviewCount);
    totalAdCost += n(e.adCost);
    totalLaborCost += n(e.laborCost);
    totalMaterialCost += n(e.materialCost);
    totalSalesOutsourcingCost += n(e.outsourceCost);
  }

  const self = summarize(selfRev, selfProf, selfCnt);
  const newSales = summarize(newRev, newProf, newCnt);
  const help = summarize(addRev, addProf, addCnt);

  const totalRevenue = selfRev + newRev + addRev;
  const totalProfit = selfProf + newProf + addProf;
  const companyUnitPrice = Math.round(safeDiv(totalRevenue, totalCount));

  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  const daysElapsed = Math.max(1, getDaysElapsed(today, targetYear, targetMonth));

  const forecastProfit = Math.round((totalProfit / daysElapsed) * daysInMonth);
  const forecastRevenue = Math.round((totalRevenue / daysElapsed) * daysInMonth);

  const constructionRate = safeDiv(constructionCount, totalCount) * 100;
  const helpRate = safeDiv(addCnt, totalCount) * 100;
  const insourceRate = safeDiv(insourceCount, totalCount) * 100;
  const outsourceRate = safeDiv(outsourceCount, totalCount) * 100;
  const grossMargin = safeDiv(totalProfit, totalRevenue) * 100;

  return {
    self, newSales, help,
    totalRevenue, totalCount, totalProfit, companyUnitPrice,
    forecastProfit, forecastRevenue,
    constructionRate, helpRate,
    daysElapsed, daysInMonth,
    insourceCount, outsourceCount, insourceRate, outsourceRate,
    reviewCount, totalAdCost, totalLaborCost, totalMaterialCost,
    totalSalesOutsourcingCost,
    // PR #46 / c93-2: 工事件数は monthly_summaries 由来 (Dashboard.tsx で流入)。
    //   calculateDashboard は entries[] 由来の旧 summary を返すが、Dashboard 側で
    //   monthly_summaries fetch 後に displaySummary を組み立て直すため、ここは 0 初期化で十分。
    outsourcedConstructionCount: 0,
    internalConstructionCount: 0,
    constructionCount: 0, // PR c93-2: 対応ベース、Dashboard.tsx で monthly_summaries.construction_count から流入
    internalConstructionProfit: 0, // PR c93-3: Dashboard.tsx で monthly_summaries.internal_construction_profit から流入
    grossMargin,
    vehicleCount: entries.length > 0 ? Math.max(...entries.map(e => e.vehicleCount ?? 0), 0) : 0,
    // PR c94-C-3a: 研修生も MAX (スナップショット)。vehicle は camel、trainee は snake (DailyEntry 命名差)。
    traineeCount: entries.length > 0 ? Math.max(...entries.map(e => e.trainee_count ?? 0), 0) : 0,
  };
}

export const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

// PR c94-B-1: 旧「指標一覧」セクション (type MetricRow + buildMetricRows、~318 line)
//   完全削除。MetricsTable / MetricsTableMobile 撤去に伴う dead code 撤去。

export function emptyEntry(date: string): DailyEntry {
  return {
    date,
    totalCount: 0, constructionCount: 0,
    selfRevenue: 0, selfProfit: 0, selfCount: 0,
    newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
    addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
    insourceCount: 0, outsourceCount: 0, reviewCount: 0,
    helpRevenue: 0, helpCount: 0,
    adCost: 0, laborCost: 0, materialCost: 0, outsourceCost: 0,
    vehicleCount: 0,
  };
}

// ============ 損益分岐エンジン ============
export type FixedCosts = {
  laborCost: number;  // 人件費
  rent: number;       // 家賃
  other: number;      // その他固定費
};

export type BreakevenResult = {
  fixedTotal: number;
  grossMarginPct: number;     // 粗利率(%)
  breakevenSales: number;     // 損益分岐売上
  breakevenCount: number;     // 損益分岐件数
  remainingCount: number;     // 残必要件数
  perDayCount: number;        // 1日あたり必要件数
  achievementPct: number;     // 達成率(%)
  remainingDays: number;
};

export function calculateBreakeven(
  fixed: FixedCosts,
  summary: DashboardSummary
): BreakevenResult {
  const fixedTotal = fixed.laborCost + fixed.rent + fixed.other;
  const grossMarginPct = summary.grossMargin;
  const breakevenSales = grossMarginPct > 0
    ? Math.round(fixedTotal / (grossMarginPct / 100))
    : 0;
  const breakevenCount = summary.companyUnitPrice > 0
    ? Math.ceil(breakevenSales / summary.companyUnitPrice)
    : 0;
  const remainingCount = Math.max(0, breakevenCount - summary.totalCount);
  const remainingDays = Math.max(1, summary.daysInMonth - summary.daysElapsed);
  const perDayCount = remainingCount / remainingDays;
  const achievementPct = breakevenCount > 0
    ? (summary.totalCount / breakevenCount) * 100
    : 0;

  return {
    fixedTotal, grossMarginPct, breakevenSales, breakevenCount,
    remainingCount, perDayCount, achievementPct, remainingDays,
  };
}

// ============ 利益ドライバーモデル ============
export type DriverInputs = {
  adCost: number;        // 広告費
  cpa: number;           // CPA
  closingRate: number;   // 成約率(%)
  // ミックス(合計100%にならなくても許容)
  lightRatio: number;    // 軽作業比率(%)
  constRatio: number;    // 工事率(%)
  helpRatio: number;     // HELP率(%)
  // 単価
  lightUnit: number;
  constUnit: number;
  helpUnit: number;
  // 粗利率
  lightMargin: number;   // %
  constMargin: number;   // %
  helpMargin: number;    // %
};

export type DriverResult = {
  leads: number;          // 広告費 ÷ CPA
  deals: number;          // leads × 成約率
  revenue: number;
  grossProfit: number;
  avgUnit: number;        // 加重平均客単価
  avgMargin: number;      // 加重平均粗利率(%)
};

// ============ 目標管理 ============
export type Targets = {
  targetSales: number;
  targetProfit: number;
  targetCount: number;
  targetCpa: number;
  targetConversionRate: number;
  targetHelpSales: number;
  targetHelpCount: number;
  targetHelpUnitPrice: number;
  targetSelfSales: number;
  targetSelfProfit: number;
  targetSelfCount: number;
  targetNewSales: number;
  targetNewProfit: number;
  targetNewCount: number;
  targetAdCost: number;
  targetAdRate: number;
  targetLaborRate: number;
  targetMaterialRate: number;
  targetVehicleCount: number;
  targetTraineeCount: number;     // PR c94-C: 研修生(営業マン)数目標 — ⑥体制
  targetCallCount: number;
  targetConstructionRate: number;
  targetPassRate: number;
  targetUnitPrice: number;        // 客単価目標(円)
  targetCallUnitPrice: number;    // 入電単価目標(円)
  targetHelpRate: number;         // HELP率目標(%)
  // PR #53: 探偵業態 面談ファネル目標 (探偵以外は 0)
  targetMeetingCount: number;     // 面談数目標
  targetMeetingRate: number;      // 面談率目標(%)
  // PR #54: 電気業態 分電盤件数目標 (電気以外は 0)
  targetSwitchboardCount: number; // 分電盤件数目標
};

export const emptyTargets = (): Targets => ({
  targetSales: 0, targetProfit: 0, targetCount: 0, targetCpa: 0, targetConversionRate: 0,
  targetHelpSales: 0, targetHelpCount: 0, targetHelpUnitPrice: 0,
  targetSelfSales: 0, targetSelfProfit: 0, targetSelfCount: 0,
  targetNewSales: 0, targetNewProfit: 0, targetNewCount: 0,
  targetAdCost: 0, targetAdRate: 0, targetLaborRate: 0, targetMaterialRate: 0,
  targetVehicleCount: 0, targetTraineeCount: 0, targetCallCount: 0,
  targetConstructionRate: 0, targetPassRate: 0,
  targetUnitPrice: 0, targetCallUnitPrice: 0, targetHelpRate: 0,
  targetMeetingCount: 0, targetMeetingRate: 0,
  targetSwitchboardCount: 0,
});

// 万円単位で保存されているフィールドを円に変換（比較・表示用）
export function manToYen(targets: Targets): Targets {
  return {
    ...targets,
    targetSales: targets.targetSales * 10000,
    targetProfit: targets.targetProfit * 10000,
    targetHelpSales: targets.targetHelpSales * 10000,
    targetSelfSales: targets.targetSelfSales * 10000,
    targetSelfProfit: targets.targetSelfProfit * 10000,
    targetNewSales: targets.targetNewSales * 10000,
    targetNewProfit: targets.targetNewProfit * 10000,
    targetAdCost: targets.targetAdCost * 10000,
  };
}

export type Achievement = {
  salesPct: number;
  profitPct: number;
  countPct: number;
  remainingCount: number;
};

export function calculateAchievement(t: Targets, s: DashboardSummary): Achievement {
  const safe = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
  return {
    salesPct: safe(s.totalRevenue, t.targetSales),
    profitPct: safe(s.totalProfit, t.targetProfit),
    countPct: safe(s.totalCount, t.targetCount),
    remainingCount: Math.max(0, t.targetCount - s.totalCount),
  };
}

/** 達成率に応じた色クラス */
export function achievementColor(pct: number): "good" | "warn" | "bad" {
  if (pct >= 100) return "good";
  if (pct >= 80) return "warn";
  return "bad";
}

// ============ 未来予測(曜日補正・トレンド) ============
/** 曜日別の平均単件数を出してトレンド予測 */
export function forecastWeekday(
  entries: DailyEntry[],
  year: number, month: number, today: Date
): { forecastRevenue: number; forecastProfit: number } {
  // 曜日別平均
  const buckets: { rev: number; prof: number; n: number }[] =
    Array.from({ length: 7 }, () => ({ rev: 0, prof: 0, n: 0 }));
  for (const e of entries) {
    const d = new Date(e.date);
    const w = d.getDay();
    const profit = e.selfProfit + (e.newRevenue - e.newMaterial - e.newLabor)
      + (e.addRevenue - e.addMaterial - e.addLabor);
    const revenue = e.selfRevenue + e.newRevenue + e.addRevenue + (e.helpRevenue ?? 0);
    buckets[w].rev += revenue;
    buckets[w].prof += profit;
    buckets[w].n += 1;
  }
  const avg = buckets.map((b) =>
    b.n > 0 ? { rev: b.rev / b.n, prof: b.prof / b.n } : null
  );
  // 全体平均(欠損補完用)
  const allCount = buckets.reduce((a, b) => a + b.n, 0);
  const fallback = allCount > 0
    ? {
        rev: buckets.reduce((a, b) => a + b.rev, 0) / allCount,
        prof: buckets.reduce((a, b) => a + b.prof, 0) / allCount,
      }
    : { rev: 0, prof: 0 };

  // 既に経過した日の実績をそのまま使う
  const daysInMonth = getDaysInMonth(year, month);
  let forecastRevenue = 0;
  let forecastProfit = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    if (d <= today && d.getMonth() === month - 1) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const found = entries.find((e) => e.date === iso);
      if (found) {
        forecastRevenue += found.selfRevenue + found.newRevenue + found.addRevenue + (found.helpRevenue ?? 0);
        forecastProfit += found.selfProfit + (found.newRevenue - found.newMaterial - found.newLabor)
          + (found.addRevenue - found.addMaterial - found.addLabor);
        continue;
      }
    }
    const a = avg[d.getDay()] ?? fallback;
    forecastRevenue += a.rev;
    forecastProfit += a.prof;
  }
  return {
    forecastRevenue: Math.round(forecastRevenue),
    forecastProfit: Math.round(forecastProfit),
  };
}

/** 直近7日間の平均で予測 */
export function forecastRecent7(
  entries: DailyEntry[],
  year: number, month: number, today: Date
): { forecastRevenue: number; forecastProfit: number } {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-7);
  if (recent.length === 0) return { forecastRevenue: 0, forecastProfit: 0 };
  let rev = 0, prof = 0;
  for (const e of recent) {
    rev += e.selfRevenue + e.newRevenue + e.addRevenue + (e.helpRevenue ?? 0);
    prof += e.selfProfit + (e.newRevenue - e.newMaterial - e.newLabor)
      + (e.addRevenue - e.addMaterial - e.addLabor);
  }
  const avgRev = rev / recent.length;
  const avgProf = prof / recent.length;
  const daysInMonth = getDaysInMonth(year, month);
  const elapsed = Math.max(1, getDaysElapsed(today, year, month));
  // 経過分の実績 + 残日数 × 直近7日平均
  let actualRev = 0, actualProf = 0;
  for (const e of entries) {
    actualRev += e.selfRevenue + e.newRevenue + e.addRevenue + (e.helpRevenue ?? 0);
    actualProf += e.selfProfit + (e.newRevenue - e.newMaterial - e.newLabor)
      + (e.addRevenue - e.addMaterial - e.addLabor);
  }
  const remaining = Math.max(0, daysInMonth - elapsed);
  return {
    forecastRevenue: Math.round(actualRev + avgRev * remaining),
    forecastProfit: Math.round(actualProf + avgProf * remaining),
  };
}

// ============ キャッシュフロー指標 ============
export type CashflowSummary = {
  totalAR: number;             // 売掛金合計
  totalAROverdue: number;      // 30日超売掛
  totalBank: number;           // 口座残高合計
  totalLoan: number;           // 融資残高
  totalRepayment: number;      // 月次返済
  totalPayments: number;       // 支払予定
  monthlyCF: number;           // 月次CF = 売掛金 - 支払 - 返済
  daysToShortage: number;      // 資金ショート予測日数
  dso: number;                 // DSO
  overdueRate: number;         // 回収遅延率(%)
};

export function calculateCashflow(
  cfs: { accountsReceivable: number; accountsReceivableOverdue: number;
         bankBalance: number; loanBalance: number; loanRepayment: number;
         scheduledPayments: number }[],
  monthlyRevenue: number
): CashflowSummary {
  const safe = (a: number, b: number) => (b > 0 ? a / b : 0);
  let totalAR = 0, totalAROverdue = 0, totalBank = 0;
  let totalLoan = 0, totalRepayment = 0, totalPayments = 0;
  for (const c of cfs) {
    totalAR += c.accountsReceivable;
    totalAROverdue += c.accountsReceivableOverdue;
    totalBank += c.bankBalance;
    totalLoan += c.loanBalance;
    totalRepayment += c.loanRepayment;
    totalPayments += c.scheduledPayments;
  }
  const monthlyCF = totalAR - totalPayments - totalRepayment;
  const dailyOutflow = (totalPayments + totalRepayment) / 30;
  const daysToShortage = dailyOutflow > 0 ? Math.floor(totalBank / dailyOutflow) : 9999;
  const dailyRevenue = monthlyRevenue / 30;
  const dso = safe(totalAR, dailyRevenue);
  const overdueRate = safe(totalAROverdue, totalAR) * 100;
  return {
    totalAR, totalAROverdue, totalBank, totalLoan,
    totalRepayment, totalPayments, monthlyCF,
    daysToShortage, dso, overdueRate,
  };
}

// ============ ドライバーモデル ============
export function calculateDriver(d: DriverInputs): DriverResult {
  const leads = d.cpa > 0 ? d.adCost / d.cpa : 0;
  const deals = leads * (d.closingRate / 100);

  const lr = d.lightRatio / 100;
  const cr = d.constRatio / 100;
  const hr = d.helpRatio / 100;

  const avgUnit = lr * d.lightUnit + cr * d.constUnit + hr * d.helpUnit;
  const revenue = deals * avgUnit;

  const grossProfit = deals * (
    lr * d.lightUnit * (d.lightMargin / 100) +
    cr * d.constUnit * (d.constMargin / 100) +
    hr * d.helpUnit * (d.helpMargin / 100)
  );
  const avgMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return {
    leads: Math.round(leads),
    deals: Math.round(deals),
    revenue: Math.round(revenue),
    grossProfit: Math.round(grossProfit),
    avgUnit: Math.round(avgUnit),
    avgMargin,
  };
}

// ============ 前月同日比 ============

/** entries を日付の日部分でフィルタする（例: day <= 9 で月初〜9日分） */
export function filterEntriesByDay(entries: DailyEntry[], maxDay: number): DailyEntry[] {
  return entries.filter((e) => {
    const d = parseInt(e.date.split("-")[2], 10);
    return d <= maxDay;
  });
}

/**
 * prevEntries を集計して前月同日分の集計値を返す。
 * フィールドは monthly_summaries と同じキー名で揃え、Section コンポーネントで直接参照できるようにする。
 * 粗利は profit.ts の resolveTotalProfit と同じロジック（category / consultant_fee 境界を含む）。
 */
export type SameDayAggregate = {
  total_revenue: number;
  total_labor_cost: number;
  material_cost: number;
  ad_cost: number;
  sales_outsourcing_cost: number;
  card_processing_fee: number;
  consultant_fee: number;
  total_profit: number;
  total_count: number;
  call_count: number;
  acquisition_count: number;
  construction_count: number;
  internal_construction_count: number;
  outsourced_construction_cost: number;
  internal_construction_profit: number;
  help_revenue: number;
  help_count: number;
  repeat_count: number;
  revisit_count: number;
  review_count: number;
  switchboard_count: number;
  locksmith_construction_cost: number;
  locksmith_commission_fee: number;
  locksmith_repeat_count: number;
  locksmith_revisit_count: number;
};

export function aggregatePrevSameDay(
  entries: DailyEntry[],
  category: string,
  year: number,
  month: number
): SameDayAggregate {
  const n = (v: unknown): number => {
    if (v == null) return 0;
    const num = typeof v === "number" ? v : Number(v);
    return Number.isFinite(num) ? num : 0;
  };

  let total_revenue = 0, total_labor_cost = 0, material_cost = 0;
  let ad_cost = 0, sales_outsourcing_cost = 0, card_processing_fee = 0;
  let consultant_fee = 0;
  let total_count = 0, call_count = 0, acquisition_count = 0;
  let construction_count = 0, internal_construction_count = 0;
  let outsourced_construction_cost = 0, internal_construction_profit = 0;
  let help_revenue = 0, help_count = 0;
  let repeat_count = 0, revisit_count = 0, review_count = 0;
  let switchboard_count = 0;
  let locksmith_construction_cost = 0, locksmith_commission_fee = 0;
  let locksmith_repeat_count = 0, locksmith_revisit_count = 0;

  for (const e of entries) {
    total_revenue += n(e.outsourced_sales_revenue) + n(e.internal_staff_revenue);
    total_count   += n(e.outsourced_response_count) + n(e.internal_staff_response_count);
    total_labor_cost           += n(e.total_labor_cost);
    material_cost              += n(e.material_cost);
    ad_cost                    += n(e.ad_cost);
    sales_outsourcing_cost     += n(e.sales_outsourcing_cost);
    card_processing_fee        += n(e.card_processing_fee);
    consultant_fee             += n(e.consultant_fee);
    call_count                 += n(e.call_count);
    acquisition_count          += n(e.acquisition_count);
    construction_count         += n(e.construction_count);
    internal_construction_count   += n(e.internal_construction_count);
    outsourced_construction_cost  += n(e.outsourced_construction_cost);
    internal_construction_profit  += n(e.internal_construction_profit);
    help_revenue               += n(e.help_revenue);
    help_count                 += n(e.help_count);
    repeat_count               += n(e.repeat_count);
    revisit_count              += n(e.revisit_count);
    review_count               += n(e.review_count);
    switchboard_count          += n(e.switchboard_count);
    locksmith_construction_cost += n(e.locksmith_construction_cost);
    locksmith_commission_fee    += n(e.locksmith_commission_fee);
    locksmith_repeat_count      += n(e.locksmith_repeat_count);
    locksmith_revisit_count     += n(e.locksmith_revisit_count);
  }

  // 粗利: resolveTotalProfit と同じロジック（category-aware + consultant_fee 境界）
  let total_profit: number;
  if (category === "locksmith") {
    total_profit = total_revenue - locksmith_construction_cost - material_cost - ad_cost - locksmith_commission_fee;
  } else {
    total_profit = total_revenue - total_labor_cost - material_cost - ad_cost - sales_outsourcing_cost - card_processing_fee;
  }
  if (category === "water") {
    const yyyymm = toYyyyMm(year, month);
    if (yyyymm >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM) {
      total_profit -= consultant_fee;
    }
  }
  total_profit = Math.max(0, Math.round(total_profit));

  return {
    total_revenue, total_labor_cost, material_cost, ad_cost,
    sales_outsourcing_cost, card_processing_fee, consultant_fee,
    total_profit, total_count, call_count, acquisition_count,
    construction_count, internal_construction_count,
    outsourced_construction_cost, internal_construction_profit,
    help_revenue, help_count, repeat_count, revisit_count, review_count,
    switchboard_count, locksmith_construction_cost, locksmith_commission_fee,
    locksmith_repeat_count, locksmith_revisit_count,
  };
}

/**
 * 前月同日比ラベルを生成する。
 * - "yen"  : "↑+12.3% (+¥270万)" のように % と金額差を表示
 * - "count": "↑+9.7% (+16件)"
 * - "pct"  : "+2.1pt"（パーセントポイント差、率指標用）
 * prev が 0 以下のときは null（表示なし）。
 */
export function momLabel(
  current: number,
  prev: number,
  fmt: "yen" | "count" | "pct"
): string | null {
  if (prev <= 0) return null;
  const diff = current - prev;

  if (fmt === "pct") {
    const pt = Math.round((current - prev) * 10) / 10;
    const sign = pt >= 0 ? "+" : "";
    return `${sign}${pt}pt`;
  }

  const pct = Math.round((diff / prev) * 1000) / 10;
  const arrow = pct >= 0 ? "↑" : "↓";
  const sign  = pct >= 0 ? "+" : "";

  if (fmt === "yen") {
    const abs = Math.abs(diff);
    const diffStr = abs >= 10000
      ? `${diff >= 0 ? "+" : "-"}¥${Math.round(abs / 10000).toLocaleString("ja-JP")}万`
      : `${diff >= 0 ? "+" : "-"}¥${Math.round(abs).toLocaleString("ja-JP")}`;
    return `${arrow}${sign}${pct}% (${diffStr})`;
  }

  // count
  const dSign = diff >= 0 ? "+" : "";
  return `${arrow}${sign}${pct}% (${dSign}${Math.round(diff)}件)`;
}
