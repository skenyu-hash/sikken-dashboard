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
//
// PR #76: /targets mobile v9 化。
//   - PC: 既存の SectionWrapper + TargetsMatrix を .hide-mobile でラップ (完全保持)
//   - Mobile: 新規 <MobileTargetSection> (accordion) + <MobileTargetCard> 群
//   - 各 mobile section に group / count / defaultOpen を割り当て (Plan B 採用)
//   - 第 1 (rev: 売上・粗利・件数) のみ defaultOpen=true、他は collapsed
//   - 達成率 badge は本 PR では未実装 (#76c で /api/monthly-summary fetch + 達成率算出)

import { useState } from "react";
import TargetsMatrix, { getMetricsForCategory } from "./TargetsMatrix";
import MobileTargetCard from "./MobileTargetCard";
import { useTargetsState } from "../lib/useTargetsState";
import type { SaveStatus } from "./../lib/useDebounceSave";
import type { BusinessCategory } from "../../lib/businesses";
import { emptyTargets, type Targets } from "../../lib/calculations";
import { GroupPill, type GroupType } from "../../components/ui";
import { getGroupBorderColor } from "../../components/dashboard/metric-groups";

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

  const { sales, ads, help, meeting, electric } = getMetricsForCategory(category);

  // PR #76: TargetsSections は単一エリア render 前提 (page.tsx で activeAreaTab
  //   !== GROUP_TAB_ID の時のみ呼び出される)。areas[0] を mobile cards で参照。
  const singleArea = areas[0];
  const at: Targets = singleArea ? (areaTargets[singleArea.id] ?? emptyTargets()) : emptyTargets();

  if (loading) {
    return (
      <div style={{ padding: 24, color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
        目標データを読み込み中...
      </div>
    );
  }

  // mobile cards 共通 render helper (1 metric → 1 MobileTargetCard)
  const renderMobileCards = (metrics: typeof sales, group: GroupType) =>
    singleArea ? metrics.map((m) => (
      <MobileTargetCard
        key={m.key} metric={m}
        value={Number(at[m.key as keyof Targets] ?? 0)}
        areaId={singleArea.id} group={group}
        canEdit={canEdit} setCell={setCell}
      />
    )) : null;

  return (
    <>
      {/* ===== PC (既存実装、完全保持) ===== */}
      <div className="hide-mobile" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

        {electric && (
          <SectionWrapper title="電気専用" subtitle={`入力 ${electric.length}項目`}>
            <TargetsMatrix
              areas={areas} metrics={electric}
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

      {/* ===== Mobile (新規、accordion + cards、Plan B: 既存 section 構造 + v9 group 装飾) ===== */}
      <div className="show-mobile" style={{ display: "none", flexDirection: "column", gap: 8 }}>
        <MobileTargetSection title="売上・粗利・件数" group="rev" count={sales.length} defaultOpen>
          {renderMobileCards(sales, "rev")}
        </MobileTargetSection>

        <MobileTargetSection title="広告・効率指標" group="acq" count={ads.length}>
          {renderMobileCards(ads, "acq")}
        </MobileTargetSection>

        {help && (
          <MobileTargetSection title="HELP 部門" group="help" count={help.length}>
            {renderMobileCards(help, "help")}
          </MobileTargetSection>
        )}

        {meeting && (
          <MobileTargetSection title="面談ファネル (探偵専用)" group="acq" count={meeting.length}>
            {renderMobileCards(meeting, "acq")}
          </MobileTargetSection>
        )}

        {electric && (
          <MobileTargetSection title="電気専用" group="cnt" count={electric.length}>
            {renderMobileCards(electric, "cnt")}
          </MobileTargetSection>
        )}
      </div>
    </>
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

// PR #76: モバイル専用アコーディオン (mob-target-card 群を包む)
//   - useState で開閉管理 (第 1 だけ defaultOpen=true 推奨)
//   - ヘッダ: GroupPill (group 色) + 「N 項目」薄灰 + chevron ▲/▼
//   - 子要素は isOpen の時のみ render (DOM 軽量化)
function MobileTargetSection({
  title, group, count, defaultOpen, children,
}: {
  title: string;
  group: GroupType;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen ?? false);
  const borderColor = getGroupBorderColor(group);
  return (
    <div style={{
      background: "#fff", borderRadius: 10,
      border: "1px solid #e5e7eb", overflow: "hidden",
      borderLeft: `3px solid ${borderColor}`,
    }}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        style={{
          width: "100%", padding: "10px 12px",
          background: "#fff", border: "none", cursor: "pointer", font: "inherit",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: isOpen ? "1px solid #e5e7eb" : "none",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <GroupPill type={group}>{title}</GroupPill>
          <span style={{ fontSize: 10, color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
            {count} 項目
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#6b7280" }} aria-hidden>
          {isOpen ? "▲" : "▼"}
        </span>
      </button>
      {isOpen && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  );
}
