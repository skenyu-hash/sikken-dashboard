"use client";
// PR c90-2: 月初〜選択日までの累積値プレビュー (フォーム下部、確定送信ボタン直上に配置)。
//
// 機能:
//   - /api/monthly-summary fetch で当月の集計値を取得 (c90-1 の aggregation 結果を読む)
//   - 売上 / 件数 / 広告費 / 粗利の 4 メトリクスを横並びで表示
//   - 「5月X日時点」表示 (as_of_day を表示)
//   - refetchTrigger prop が変化したら再 fetch (確定送信成功で aggregation 完了後に親が trigger++)
//
// 設計判断:
//   - 表示メトリクスは 4 つに絞る (情報過多回避、詳細は /dashboard 参照を促す)
//   - データなし時は "まだデータがありません" メッセージ
//   - 業態によらず同一表示 (4 メトリクスは全業態で意味を持つ)
//
// 使い方:
//   <CumulativePreview
//     areaId={state.area_id}
//     category={category}
//     year={state.year}
//     month={state.month}
//     refetchTrigger={cumulativeRefetchCount}
//   />

import { useEffect, useState } from "react";

type Props = {
  areaId: string;
  category: string;
  year: number;
  month: number;
  /** 確定送信成功後に親が ++ する。変化を検知して再 fetch */
  refetchTrigger: number;
};

type Summary = {
  total_revenue?: number;
  total_count?: number;
  ad_cost?: number;
  total_profit?: number;
  as_of_day?: number;
  source?: string;
} | null;

const yen = (v: number | undefined) => v != null && v > 0 ? `¥${Math.round(v).toLocaleString("ja-JP")}` : "¥0";
const cnt = (v: number | undefined) => v != null && v > 0 ? `${v.toLocaleString("ja-JP")}件` : "0件";

export default function CumulativePreview({ areaId, category, year, month, refetchTrigger }: Props) {
  const [summary, setSummary] = useState<Summary>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/monthly-summary?area=${encodeURIComponent(areaId)}&year=${year}&month=${month}&category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((j: { summary?: Summary }) => { if (!cancelled) setSummary(j.summary ?? null); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [areaId, category, year, month, refetchTrigger]);

  const asOfDay = summary?.as_of_day;
  const hasData = summary && (summary.total_revenue ?? 0) > 0;

  return (
    <div style={{
      background: "#f0fdf4", border: "1px solid #a7f3d0", borderRadius: 10,
      padding: 14, marginTop: 16, marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46", letterSpacing: "0.04em" }}>
          📊 月初〜{asOfDay ? `${month}/${asOfDay}` : "選択日"} の累積
        </span>
        {loading && (
          <span style={{ fontSize: 10, color: "#9ca3af" }}>読み込み中...</span>
        )}
        {!loading && summary?.source && (
          <span style={{ fontSize: 9, color: "#6b7280" }}>
            (source: {summary.source})
          </span>
        )}
      </div>

      {!hasData && !loading ? (
        <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>
          まだデータがありません。確定送信すると累積がここに表示されます。
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
          fontVariantNumeric: "tabular-nums",
        }}>
          <Metric label="売上" value={yen(summary?.total_revenue)} />
          <Metric label="件数" value={cnt(summary?.total_count)} />
          <Metric label="広告費" value={yen(summary?.ad_cost)} />
          <Metric label="粗利" value={yen(summary?.total_profit)} />
        </div>
      )}

      <p style={{ fontSize: 10, color: "#6b7280", marginTop: 10, lineHeight: 1.5 }}>
        ※ ダッシュボードに表示される値はこの累積。日次差分を入力 → 確定送信で集計が更新されます。
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#065f46", marginBottom: 2, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{value}</div>
    </div>
  );
}
