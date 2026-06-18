"use client";
// PR-2a (2026-06-07): 会社別ダッシュボードの事業×エリア内訳テーブル。
//
// 用途: viewMode="company" のヒーロー KPI カードの下に表示。
//   現状ヒーローは会社全体 SUM のみで、複数事業会社 (DUNK=water+road+electric,
//   REXIA=water+electric) や未割当 16 ペアの事業内訳が見えなかった。
//   本テーブルは「追加」のみ、ヒーロー KPI のロジック・数値・表示は一切 untouch (反さん厳命)。
//
// データ取得 (反さん確定 Step 2、2026-06-07):
//   - **monthly-summary N 並列 fetch** (ヒーローと同じ経路、monthly_summaries 優先、不変条件 3 遵守)
//   - range-aggregate (entries 直 SUM) は採用しない → 4 月以前 entries 0 行で乖離する問題を回避
//   - 各 (cat, area) ペアに対して /api/monthly-summary?area=X&category=Y&year=Z&month=W で個別取得
//   - 行数の目安: 単一会社 1-4、__all__ で全 14 ペア (PR-1 後は 32 ペア)、unassigned で 16 ペア
//
// 行ソース (activeCompany ベース):
//   - 通常の会社 → company.areas をそのまま展開
//   - "__all__" (全社合計) → COMPANIES 全社の areas を平坦化
//   - "unassigned" → COMPANIES.find(c => c.id === "unassigned")?.areas (PR-1 で 16 ペア)
//
// 列:
//   - 売上 / 粗利 / 対応件数 / 客単価 / 広告費 の 5 列 + 末尾「事業別で編集 →」ボタン
//   - 欠損フィールドは「—」表示 (探偵=面談系で「対応件数」「客単価」が無い等のクラッシュ防止)
//
// fmt 関数経路:
//   - Neon driver は NUMERIC/BIGINT を string で返すため、normalizeNum で number 化 + isFinite ガード
//   - c96-2 hotfix 教訓: `.toFixed()` / `.toLocaleString()` に string を渡してクラッシュした事故再発防止

import { useEffect, useState } from "react";
import type { BusinessCategory } from "../../lib/businesses";
import { BUSINESSES, AREA_NAMES } from "../../lib/businesses";
import { COMPANIES, getCompanyAssignments } from "../../lib/companies";
import { resolveTotalProfit } from "../../lib/profit";

/** PR-2a: Neon driver の string レスポンスを number 化 + 異常値ガード。c96-2 hotfix の normalizeRow と同方針。 */
function normalizeNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** PR-2a: number → "¥1,234,567" 形式、欠損は "—"。 */
function fmtYen(v: unknown): string {
  if (v == null) return "—";
  const n = normalizeNum(v);
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

/** PR-2a: number → "1,234 件" 形式、欠損 (= summary に該当列がない、または null) は "—"。 */
function fmtCount(v: unknown): string {
  if (v == null) return "—";
  const n = normalizeNum(v);
  return `${Math.round(n).toLocaleString("ja-JP")}件`;
}

/** PR-2a: 客単価 = 売上 ÷ 件数。件数 0 のときは "—" (divide-by-zero 防止)。 */
function fmtUnitPrice(revenue: unknown, count: unknown): string {
  const r = normalizeNum(revenue);
  const c = normalizeNum(count);
  if (c <= 0 || r <= 0) return "—";
  return `¥${Math.round(r / c).toLocaleString("ja-JP")}`;
}

export type BreakdownPair = {
  category: BusinessCategory;
  areaId: string;
};

/** PR-2a: activeCompany から表示対象ペア配列を派生 (純関数、テスト容易化)。
 *  反さん指示通り、__all__ は全社平坦化、unassigned は companies.ts ヘルパー流用。 */
export function getBreakdownPairs(activeCompany: string): BreakdownPair[] {
  if (activeCompany === "__all__") {
    return COMPANIES.flatMap((c) => c.areas.map((a) => ({ category: a.category, areaId: a.areaId })));
  }
  const assignments = getCompanyAssignments(activeCompany);
  return assignments.map((a) => ({ category: a.category, areaId: a.areaId }));
}

const categoryLabel = (c: BusinessCategory): string =>
  BUSINESSES.find((b) => b.id === c)?.label ?? c;

type Props = {
  activeCompany: string;
  viewYear: number;
  viewMonth: number;
  /** ヘッダーや「事業別で編集 →」用、Dashboard 側 state 更新 callback (= TargetsCompanyView と同じ pattern) */
  onChangeBusinessRequest: (category: BusinessCategory, areaId: string) => void;
};

export default function CompanyBreakdownTable({
  activeCompany, viewYear, viewMonth, onChangeBusinessRequest,
}: Props) {
  const [rows, setRows] = useState<Array<{
    category: BusinessCategory;
    areaId: string;
    summary: Record<string, unknown> | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const pairs = getBreakdownPairs(activeCompany);
    if (pairs.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    // monthly-summary N 並列 fetch (反さん確定、ヒーローと同じ経路、monthly_summaries 優先)
    Promise.all(
      pairs.map(async (p) => {
        const res = await fetch(
          `/api/monthly-summary?area=${p.areaId}&year=${viewYear}&month=${viewMonth}&category=${p.category}`,
        ).then((r) => (r.ok ? r.json() : { summary: null }));
        return { category: p.category, areaId: p.areaId, summary: res.summary };
      }),
    ).then((results) => {
      if (cancelled) return;
      setRows(results);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setRows(pairs.map((p) => ({ category: p.category, areaId: p.areaId, summary: null })));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeCompany, viewYear, viewMonth]);

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        事業×エリア内訳を読み込み中...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{
        padding: 20, textAlign: "center", color: "#6b7280", fontSize: 12,
        background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 8,
        margin: "16px 20px",
      }}>
        担当範囲なし (この会社には事業×エリアの assignments がありません)
      </div>
    );
  }

  return (
    <div style={{
      margin: "16px 20px", background: "#fff", border: "1px solid #d1fae5",
      borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        background: "#ecfdf5", padding: "8px 14px", borderBottom: "1px solid #d1fae5",
        fontSize: 11, fontWeight: 700, color: "#065f46", letterSpacing: "0.07em",
      }}>
        事業 × エリア 内訳 ({viewYear}年{viewMonth}月、monthly_summaries 直読)
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr style={{ background: "#fafffe" }}>
              <th style={thStyle()}>事業</th>
              <th style={thStyle()}>エリア</th>
              <th style={thStyle("right")}>売上</th>
              <th style={thStyle("right")}>粗利</th>
              <th style={thStyle("right")}>対応件数</th>
              <th style={thStyle("right")}>客単価</th>
              <th style={thStyle("right")}>広告費</th>
              <th style={thStyle("center")}>編集</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.summary;
              // monthly_summary が null (= 未入力ペア) のときは全列「—」、行は表示する
              // (絶対制約: entries.length>0 による early return は追加禁止、行は出す)
              const revenue = s?.total_revenue;
              const profit = s ? resolveTotalProfit(s) : null;
              // total_count は water/electric のみ populated。locksmith/road は acquisition_count を使う
              const count = s != null
                ? (Number(s.total_count ?? 0) || Number(s.acquisition_count ?? 0))
                : null;
              const adCost = s?.ad_cost;
              return (
                <tr key={`${r.category}::${r.areaId}`}>
                  <td style={tdLabel()}>{categoryLabel(r.category)}</td>
                  <td style={tdLabel()}>{AREA_NAMES[r.areaId] ?? r.areaId}</td>
                  <td style={tdValue(revenue == null)}>{fmtYen(revenue)}</td>
                  <td style={tdValue(profit == null)}>{profit == null ? "—" : fmtYen(profit)}</td>
                  <td style={tdValue(count == null)}>{fmtCount(count)}</td>
                  <td style={tdValue(revenue == null || count == null)}>{fmtUnitPrice(revenue, count)}</td>
                  <td style={tdValue(adCost == null)}>{fmtYen(adCost)}</td>
                  <td style={{ ...tdValue(false), textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => onChangeBusinessRequest(r.category, r.areaId)}
                      style={{
                        fontSize: 10, padding: "4px 10px", borderRadius: 6,
                        background: "#fff", border: "1px solid #1B5E3F",
                        color: "#1B5E3F", cursor: "pointer", fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      事業別で編集 →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── スタイル helper ──────────────────────────────────────
function thStyle(align: "left" | "right" | "center" = "left"): React.CSSProperties {
  return {
    padding: "8px 10px", fontSize: 11, fontWeight: 700,
    color: "#065f46", textAlign: align,
    borderBottom: "1px solid #d1fae5", whiteSpace: "nowrap",
  };
}
function tdLabel(): React.CSSProperties {
  return {
    padding: "8px 10px", fontSize: 12, fontWeight: 500,
    color: "#1f2937", borderBottom: "1px solid #f3f4f6",
    whiteSpace: "nowrap",
  };
}
function tdValue(isMissing: boolean): React.CSSProperties {
  return {
    padding: "8px 10px", fontSize: 12,
    color: isMissing ? "#9ca3af" : "#1f2937",
    textAlign: "right", borderBottom: "1px solid #f3f4f6",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };
}
