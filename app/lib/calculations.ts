// 経営ダッシュボード ビジネスロジック
// 全ての金額は「円(整数)」、件数は「件(整数)」を想定

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
  grossMargin: number;      // 粗利率(%)
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
  const helpRate = safeDiv(addCnt, constructionCount) * 100;
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
    grossMargin,
  };
}

export const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export function emptyEntry(date: string): DailyEntry {
  return {
    date,
    totalCount: 0, constructionCount: 0,
    selfRevenue: 0, selfProfit: 0, selfCount: 0,
    newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
    addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
    insourceCount: 0, outsourceCount: 0, reviewCount: 0,
    helpRevenue: 0, helpCount: 0,
    adCost: 0, laborCost: 0, materialCost: 0,
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
  targetCallCount: number;
  targetConstructionRate: number;
  targetPassRate: number;
  targetUnitPrice: number;        // 客単価目標(円)
  targetCallUnitPrice: number;    // 入電単価目標(円)
  targetHelpRate: number;         // HELP率目標(%)
};

export const emptyTargets = (): Targets => ({
  targetSales: 0, targetProfit: 0, targetCount: 0, targetCpa: 0, targetConversionRate: 0,
  targetHelpSales: 0, targetHelpCount: 0, targetHelpUnitPrice: 0,
  targetSelfSales: 0, targetSelfProfit: 0, targetSelfCount: 0,
  targetNewSales: 0, targetNewProfit: 0, targetNewCount: 0,
  targetAdCost: 0, targetAdRate: 0, targetLaborRate: 0, targetMaterialRate: 0,
  targetVehicleCount: 0, targetCallCount: 0,
  targetConstructionRate: 0, targetPassRate: 0,
  targetUnitPrice: 0, targetCallUnitPrice: 0, targetHelpRate: 0,
});

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
