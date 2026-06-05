"use client";
// PR c96-2: /daily-report 用フィルター帯 (3 視点 + 会社/事業/エリア + 期間)。
//
// 構成 (上から):
//   1. 視点セグメント (会社別 / 事業別 / グループ全体) — 半透明黒地、選択中=白地 + 深緑文字
//   2. 視点別 2 段目:
//      - 会社別: 会社タブ (7 社 + 未割当) → 選択会社の (categories, areas) を派生で表示
//        会社別の 1 業態/1 エリアまで絞り込めるサブセレクタ (任意、未選択=会社全 SUM)
//      - 事業別: 業態タブ (5 業態、業態色) → 全エリア SUM
//      - グループ全体: フィルタなし表示 (= 全業態×全エリア SUM)
//   3. 期間モード切替 (単日 / 期間 トグル) + 日付入力
//      - 単日: ◀ [日付ピッカー] ▶
//      - 期間: 開始 [date] 〜 終了 [date] (同一月内必須、to の min/max は from の月で制約)
//
// 色: theme.ts 経由 (ハードコード回避)。
// レスポンシブ: 親 (DailyReportContent wrapper) が flex で配置、本コンポーネントは縦積み。

import { useMemo } from "react";
import type { BusinessCategory } from "../../../lib/businesses";
import { AREA_NAMES, BUSINESSES } from "../../../lib/businesses";
import { COMPANIES, getCompanyCategoriesAndAreas } from "../../../lib/companies";
import {
  COLOR_BRAND_DARK,
  COLOR_BRAND_MID,
  COLOR_TEXT_SECONDARY,
  COLOR_BORDER_LIGHT,
  BUSINESS_ACCENT_COLOR,
} from "../../../lib/theme";

export type ViewMode = "company" | "business" | "group";
export type DateMode = "single" | "range";

const VIEW_LABELS: Record<ViewMode, string> = {
  company: "会社別",
  business: "事業別",
  group: "グループ全体",
};

const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  water: "水道", electric: "電気", locksmith: "鍵", road: "ロード", detective: "探偵",
};

type Props = {
  view: ViewMode;
  company: string;            // CompanyId (view=company 時のアクティブ)
  category: BusinessCategory; // view=business 時のアクティブ業態、または会社別 1 業態絞り込み
  area: string;               // 会社別 1 エリア絞り込み (空文字なら未絞り込み)
  mode: DateMode;
  date: string;               // mode=single
  from: string;               // mode=range
  to: string;                 // mode=range

  onViewChange: (v: ViewMode) => void;
  onCompanyChange: (id: string) => void;
  onCategoryChange: (c: BusinessCategory | "") => void; // "" = 絞り込み解除
  onAreaChange: (a: string) => void;                    // "" = 絞り込み解除
  onModeChange: (m: DateMode) => void;
  onDateChange: (d: string) => void;
  onFromChange: (d: string) => void;
  onToChange: (d: string) => void;
};

export default function FilterBar(props: Props) {
  const {
    view, company, category, area, mode, date, from, to,
    onViewChange, onCompanyChange, onCategoryChange, onAreaChange,
    onModeChange, onDateChange, onFromChange, onToChange,
  } = props;

  // 会社別: 連動絞り込み選択肢 (会社が担当する categories / areas)
  const companySel = useMemo(() => getCompanyCategoriesAndAreas(company), [company]);

  // 期間モード: to の min/max を from の年月内に制約 (同一月内ガード)
  const fromMonthFirst = useMemo(() => {
    if (!from) return "";
    const y = from.slice(0, 4);
    const m = from.slice(5, 7);
    return `${y}-${m}-01`;
  }, [from]);
  const fromMonthLast = useMemo(() => {
    if (!from) return "";
    const y = Number(from.slice(0, 4));
    const m = Number(from.slice(5, 7));
    const lastDay = new Date(y, m, 0).getDate(); // m=4 → April の最終日
    return `${from.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  }, [from]);

  return (
    <div style={containerStyle}>
      {/* 段 1: 視点セグメント */}
      <div style={segmentRowStyle}>
        <div style={segmentGroupStyle}>
          {(["company", "business", "group"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              style={view === v ? segmentBtnActiveStyle : segmentBtnStyle}
              aria-pressed={view === v}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* 段 2: 視点別 (会社タブ / 事業タブ / なし) */}
      {view === "company" && (
        <div style={tabRowStyle}>
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onCompanyChange(c.id);
                // 会社変更時、絞り込みもリセット (= 会社全 SUM へ)
                onCategoryChange("");
                onAreaChange("");
              }}
              style={c.id === company ? tabActiveStyle : tabStyle}
              aria-pressed={c.id === company}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {view === "business" && (
        <div style={tabRowStyle}>
          {BUSINESSES.map((b) => (
            <button
              key={b.id}
              onClick={() => onCategoryChange(b.id)}
              style={{
                ...tabStyle,
                ...(b.id === category ? {
                  background: BUSINESS_ACCENT_COLOR[b.id],
                  color: "#fff",
                  borderColor: BUSINESS_ACCENT_COLOR[b.id],
                } : {}),
              }}
              aria-pressed={b.id === category}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* 段 3: 会社別の 1 業態/1 エリア絞り込み (任意、複数選択肢があるときのみ表示) */}
      {view === "company" && (companySel.categories.length > 1 || companySel.areas.length > 1) && (
        <div style={tabRowStyle}>
          {companySel.categories.length > 1 && (
            <>
              <span style={subLabelStyle}>事業:</span>
              <button
                onClick={() => onCategoryChange("")}
                style={!companySel.categories.includes(category) ? subPillActive : subPillStyle}
              >全て</button>
              {companySel.categories.map((c) => (
                <button
                  key={c}
                  onClick={() => onCategoryChange(c)}
                  style={c === category ? subPillActive : subPillStyle}
                >{CATEGORY_LABELS[c]}</button>
              ))}
            </>
          )}
          {companySel.areas.length > 1 && (
            <>
              <span style={{ ...subLabelStyle, marginLeft: 12 }}>エリア:</span>
              <button
                onClick={() => onAreaChange("")}
                style={area === "" ? subPillActive : subPillStyle}
              >全て</button>
              {companySel.areas.map((a) => (
                <button
                  key={a}
                  onClick={() => onAreaChange(a)}
                  style={a === area ? subPillActive : subPillStyle}
                >{AREA_NAMES[a] ?? a}</button>
              ))}
            </>
          )}
        </div>
      )}

      {/* 段 4: 期間モードトグル + 日付入力 */}
      <div style={dateRowStyle}>
        <div style={segmentGroupSmallStyle}>
          {(["single", "range"] as DateMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              style={mode === m ? segmentBtnSmallActiveStyle : segmentBtnSmallStyle}
              aria-pressed={mode === m}
            >
              {m === "single" ? "単日" : "期間"}
            </button>
          ))}
        </div>

        {mode === "single" ? (
          <div style={dateInputGroupStyle}>
            <button onClick={() => shiftDate(date, -1, onDateChange)} style={navBtnStyle} aria-label="前日">◀</button>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              style={dateInputStyle}
            />
            <button onClick={() => shiftDate(date, +1, onDateChange)} style={navBtnStyle} aria-label="翌日">▶</button>
          </div>
        ) : (
          <div style={dateInputGroupStyle}>
            <input
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              style={dateInputStyle}
              aria-label="開始日"
            />
            <span style={{ color: "#fff", padding: "0 6px" }}>〜</span>
            <input
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              min={fromMonthFirst}
              max={fromMonthLast}
              style={dateInputStyle}
              aria-label="終了日"
            />
            <span style={hintStyle}>同一月内のみ</span>
          </div>
        )}
      </div>
    </div>
  );
}

function shiftDate(current: string, deltaDays: number, onChange: (d: string) => void) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(current)) return;
  const d = new Date(`${current}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  onChange(d.toISOString().slice(0, 10));
}

// ── スタイル (theme.ts 経由、ハードコード回避) ──────────

const containerStyle: React.CSSProperties = {
  background: COLOR_BRAND_MID,
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  borderBottom: `1px solid ${COLOR_BORDER_LIGHT}`,
};

const segmentRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
};
const segmentGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "rgba(0, 0, 0, 0.2)",
  borderRadius: 6,
  padding: 3,
  gap: 2,
};
const segmentBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#fff",
  border: "none",
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 4,
  cursor: "pointer",
};
const segmentBtnActiveStyle: React.CSSProperties = {
  ...segmentBtnStyle,
  background: "#fff",
  color: COLOR_BRAND_DARK,
};

const tabRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};
const tabStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.15)",
  color: "#fff",
  border: "1px solid rgba(255, 255, 255, 0.3)",
  borderRadius: 4,
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  background: "#fff",
  color: COLOR_BRAND_DARK,
  borderColor: "#fff",
};

const subLabelStyle: React.CSSProperties = {
  color: "rgba(255, 255, 255, 0.85)",
  fontSize: 11,
  fontWeight: 600,
  marginRight: 4,
};
const subPillStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.1)",
  color: "#fff",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  borderRadius: 999,
  padding: "2px 10px",
  fontSize: 11,
  cursor: "pointer",
};
const subPillActive: React.CSSProperties = {
  ...subPillStyle,
  background: "#fff",
  color: COLOR_BRAND_DARK,
  borderColor: "#fff",
};

const dateRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};
const segmentGroupSmallStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "rgba(0, 0, 0, 0.2)",
  borderRadius: 4,
  padding: 2,
  gap: 2,
};
const segmentBtnSmallStyle: React.CSSProperties = {
  background: "transparent",
  color: "#fff",
  border: "none",
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 3,
  cursor: "pointer",
};
const segmentBtnSmallActiveStyle: React.CSSProperties = {
  ...segmentBtnSmallStyle,
  background: "#fff",
  color: COLOR_BRAND_DARK,
};

const dateInputGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};
const dateInputStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #fff",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 13,
  color: COLOR_BRAND_DARK,
  fontWeight: 600,
};
const navBtnStyle: React.CSSProperties = {
  background: "rgba(0, 0, 0, 0.2)",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
};
const hintStyle: React.CSSProperties = {
  color: COLOR_TEXT_SECONDARY,
  background: "rgba(255, 255, 255, 0.85)",
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 3,
  marginLeft: 4,
};
