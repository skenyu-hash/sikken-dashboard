"use client";
// PR #49a / PR #49b: 1 つのエリアに対して業態別 3 (or 2) セクションの
// TargetsMatrix を縦に並べて表示する。会議ページのセクション構造と視覚対応。
//
// 設計:
//   - useTargetsState フックを 1 回呼んで areaTargets / setCell を共有 state 化
//   - 各セクション = 別 TargetsMatrix インスタンス (異なる metrics サブセットを props で渡す)
//   - SectionShell 風の見出し付きで /meeting と同じグルーピング感を出す
//
// PR #49b: category prop に応じて表示メトリクスを絞り込む。
//   - 鍵: ADS から「工事取得率」を除外
//   - ロード / 探偵: 工事取得率除外 + HELP セクション全体を非表示

import TargetsMatrix, { getMetricsForCategory } from "./TargetsMatrix";
import { useTargetsState } from "../lib/useTargetsState";
import type { SaveStatus } from "./../lib/useDebounceSave";
import type { BusinessCategory } from "../../lib/businesses";

type Area = { id: string; name: string };

type Props = {
  areas: Area[];
  category: BusinessCategory;
  year: number;
  month: number;
  canEdit: boolean;
  onSaveStatusChange?: (status: SaveStatus, flash: boolean) => void;
};

export default function TargetsSections({ areas, category, year, month, canEdit, onSaveStatusChange }: Props) {
  const { areaTargets, setCell, loading, flashCells } = useTargetsState({
    areas, category, year, month, onSaveStatusChange,
  });

  const { sales, ads, help, meeting } = getMetricsForCategory(category);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
        目標データを読み込み中...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionWrapper title="売上・粗利・件数" subtitle={`入力 ${sales.length}項目`}>
        <TargetsMatrix
          areas={areas} metrics={sales}
          areaTargets={areaTargets} setCell={setCell}
          canEdit={canEdit} flashCells={flashCells}
        />
      </SectionWrapper>

      <SectionWrapper title="広告・効率指標" subtitle={`入力 ${ads.length}項目`}>
        <TargetsMatrix
          areas={areas} metrics={ads}
          areaTargets={areaTargets} setCell={setCell}
          canEdit={canEdit} flashCells={flashCells}
        />
      </SectionWrapper>

      {help && (
        <SectionWrapper title="HELP 部門" subtitle={`入力 ${help.length}項目`}>
          <TargetsMatrix
            areas={areas} metrics={help}
            areaTargets={areaTargets} setCell={setCell}
            canEdit={canEdit} flashCells={flashCells}
          />
        </SectionWrapper>
      )}

      {meeting && (
        <SectionWrapper title="面談ファネル (探偵専用)" subtitle={`入力 ${meeting.length}項目`}>
          <TargetsMatrix
            areas={areas} metrics={meeting}
            areaTargets={areaTargets} setCell={setCell}
            canEdit={canEdit} flashCells={flashCells}
          />
        </SectionWrapper>
      )}

      <p style={{
        fontSize: 11, color: "#6b7280", lineHeight: 1.5,
        padding: "8px 12px", background: "#f9fafb",
        borderRadius: 6, border: "1px solid #e5e7eb",
      }}>
        💡 単位の補足: <strong>売上目標 / 粗利目標 / 広告費目標 / HELP売上目標</strong>{" "}
        は <strong>万円単位</strong>で保存されます (入力値 100 = ¥1,000,000)。
        <strong>客単価 / CPA / HELP客単価</strong>{" "}
        は <strong>円単位</strong>。
        <strong>広告費率 / 工事取得率 / 成約率 / HELP率</strong>{" "}
        は 0-100 の <strong>% 値</strong>を入力してください。
      </p>
    </div>
  );
}

function SectionWrapper({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10,
        marginBottom: 8, paddingLeft: 4,
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 800, color: "#065f46", margin: 0 }}>{title}</h2>
        {subtitle && (
          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}
