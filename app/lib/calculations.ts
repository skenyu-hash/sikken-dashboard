// 経営ダッシュボード ビジネスロジック
// 全ての金額は「円(整数)」、件数は「件(整数)」を想定

export type DailyEntry = {
  date: string; // YYYY-MM-DD
  // 全体
  totalCount: number;          // 全体件数
  constructionCount: number;   // 10万以上の工事件数
  // 自社施工部門
  selfRevenue: number;         // 売上高
  selfProfit: number;          // 施工利益(限界利益)
  selfCount: number;           // 件数
  // 新規営業部門
  newRevenue: number;          // 売上
  newMaterial: number;         // 材料費
  newLabor: number;            // 職人費
  newCount: number;            // 新規件数
  // 追加/ヘルプ部門
  addRevenue: number;          // 追加売上
  addMaterial: number;         // 追加材料費
  addLabor: number;            // 追加職人費
  addCount: number;            // ヘルプ件数
};

export type DepartmentSummary = {
  revenue: number;
  profit: number;
  count: number;
  unitPrice: number; // 客単価 = 売上 / 件数
};

export type DashboardSummary = {
  // 部門別
  self: DepartmentSummary;
  newSales: DepartmentSummary;
  help: DepartmentSummary;
  // 全体
  totalRevenue: number;
  totalCount: number;
  totalProfit: number;          // 合計限界利益(実績)
  companyUnitPrice: number;     // 会社総合客単価
  // 予測
  forecastProfit: number;       // 月末着地予測(合計限界利益)
  forecastRevenue: number;      // 月末着地予測(売上)
  // KPI
  constructionRate: number;     // 工事取得率(%)
  helpRate: number;             // ヘルプ率(%)
  // 月情報
  daysElapsed: number;
  daysInMonth: number;
};

/** 指定月(YYYY-MM)の総日数 */
export function getDaysInMonth(year: number, month: number): number {
  // month: 1-12
  return new Date(year, month, 0).getDate();
}

/** 今日までの経過日数(=本日の日付) */
export function getDaysElapsed(today: Date, year: number, month: number): number {
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  if (ty !== year || tm !== month) {
    // 過去月なら全日数、未来月なら0
    if (ty > year || (ty === year && tm > month)) return getDaysInMonth(year, month);
    return 0;
  }
  return today.getDate();
}

/** ゼロ除算ガード */
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

/** 部門サマリーを集計 */
function summarize(revenue: number, profit: number, count: number): DepartmentSummary {
  return {
    revenue,
    profit,
    count,
    unitPrice: Math.round(safeDiv(revenue, count)),
  };
}

/**
 * 入力データ配列から、ダッシュボード表示用のサマリーを算出する
 * @param entries 当該月の日次入力データ
 * @param targetYear 対象年(西暦)
 * @param targetMonth 対象月(1-12)
 * @param today 現在日時 (テスト容易性のため引数化)
 */
export function calculateDashboard(
  entries: DailyEntry[],
  targetYear: number,
  targetMonth: number,
  today: Date = new Date()
): DashboardSummary {
  // 集計初期化
  let selfRev = 0, selfProf = 0, selfCnt = 0;
  let newRev = 0, newProf = 0, newCnt = 0;
  let addRev = 0, addProf = 0, addCnt = 0;
  let totalCount = 0;
  let constructionCount = 0;

  for (const e of entries) {
    selfRev += e.selfRevenue;
    selfProf += e.selfProfit;
    selfCnt += e.selfCount;

    newRev += e.newRevenue;
    newProf += e.newRevenue - e.newMaterial - e.newLabor; // 新規限界利益
    newCnt += e.newCount;

    addRev += e.addRevenue;
    addProf += e.addRevenue - e.addMaterial - e.addLabor; // 追加限界利益
    addCnt += e.addCount;

    totalCount += e.totalCount;
    constructionCount += e.constructionCount;
  }

  const self = summarize(selfRev, selfProf, selfCnt);
  const newSales = summarize(newRev, newProf, newCnt);
  const help = summarize(addRev, addProf, addCnt);

  const totalRevenue = selfRev + newRev + addRev;
  const totalProfit = selfProf + newProf + addProf;
  const companyUnitPrice = Math.round(safeDiv(totalRevenue, totalCount));

  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  const daysElapsed = Math.max(1, getDaysElapsed(today, targetYear, targetMonth));

  // 月末着地予測 = (現時点合計 ÷ 経過日数) × 総日数
  const forecastProfit = Math.round((totalProfit / daysElapsed) * daysInMonth);
  const forecastRevenue = Math.round((totalRevenue / daysElapsed) * daysInMonth);

  // KPI
  const constructionRate = safeDiv(constructionCount, totalCount) * 100;
  const helpRate = safeDiv(addCnt, constructionCount) * 100;

  return {
    self,
    newSales,
    help,
    totalRevenue,
    totalCount,
    totalProfit,
    companyUnitPrice,
    forecastProfit,
    forecastRevenue,
    constructionRate,
    helpRate,
    daysElapsed,
    daysInMonth,
  };
}

/** 円フォーマット */
export const yen = (n: number) =>
  `¥${Math.round(n).toLocaleString("ja-JP")}`;

/** 空の入力データを生成 */
export function emptyEntry(date: string): DailyEntry {
  return {
    date,
    totalCount: 0,
    constructionCount: 0,
    selfRevenue: 0,
    selfProfit: 0,
    selfCount: 0,
    newRevenue: 0,
    newMaterial: 0,
    newLabor: 0,
    newCount: 0,
    addRevenue: 0,
    addMaterial: 0,
    addLabor: 0,
    addCount: 0,
  };
}
