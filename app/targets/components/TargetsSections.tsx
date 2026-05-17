"use client";
// PR #49a: 1 つのエリアに対して 3 セクション (売上系 / 広告系 / HELP系) の
// TargetsMatrix を縦に並べて表示する。会議ページのセクション構造と視覚対応。
//
// 設計:
//   - useTargetsState フックを 1 回呼んで areaTargets / setCell を共有 state 化
//   - 各セクション = 別 TargetsMatrix インスタンス (異なる metrics サブセットを props で渡す)
//   - SectionShell 風の見出し付きで /meeting と同じグルーピング感を出す

import TargetsMatrix, { SALES_METRICS, ADS_METRICS, HELP_METRICS } from "./TargetsMatrix";
import { useTargetsState } from "../lib/useTargetsState";
import type { SaveStatus } from "../lib/useDebounceSave";

type Area = { id: string; name: string };

type Props = {
  areas: Area[];
  category: string;
  year: number;
  month: number;
  canEdit: boolean;
  onSaveStatusChange?: (status: SaveStatus, flash: boolean) => void;
};

export default function TargetsSections({ areas, category, year, month, canEdit, onSaveStatusChange }: Props) {
  const { areaTargets, setCell, loading, flashCells } = useTargetsState({
    areas, category, year, month, onSaveStatusChange,
  });

  if (loading) {
    return (
      <div style={{ padding: 24, color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
        目標データを読み込み中...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionWrapper title="売上・粗利・件数" subtitle="入力 4項目">
        <TargetsMatrix
          areas={areas} metrics={SALES_METRICS}
          areaTargets={areaTargets} setCell={setCell}
          canEdit={canEdit} flashCells={flashCells}
        />
      </SectionWrapper>

      <SectionWrapper title="広告・効率指標" subtitle="入力 6項目">
        <TargetsMatrix
          areas={areas} metrics={ADS_METRICS}
          areaTargets={areaTargets} setCell={setCell}
          canEdit={canEdit} flashCells={flashCells}
        />
      </SectionWrapper>

      <SectionWrapper title="HELP 部門" subtitle="入力 4項目">
        <TargetsMatrix
          areas={areas} metrics={HELP_METRICS}
          areaTargets={areaTargets} setCell={setCell}
          canEdit={canEdit} flashCells={flashCells}
        />
      </SectionWrapper>

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
