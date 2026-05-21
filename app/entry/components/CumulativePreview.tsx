"use client";
// PR c90-2: 月初〜選択日までの累積値プレビュー (サイドバーに配置)。
//
// 機能:
//   - /api/monthly-summary fetch で当月の集計値を取得 (c90-1 の aggregation 結果を読む)
//   - PR c92-2b: 4 → 6 指標に拡張 (Q4=a):
//     売上 / 対応件数 / 広告費 / 獲得件数 / 客単価 / CPA
//   - 3 column × 2 row の grid で sidebar 320px 幅に compact 収納
//   - 「YYYY/MM/DD時点」表示 (as_of_day を表示)
//   - refetchTrigger prop が変化したら再 fetch (確定送信成功で aggregation 完了後に親が trigger++)
//
// 設計判断:
//   - 旧 4 指標 (売上 / 件数 / 広告費 / 粗利) から 粗利 を除去、計算系 4 指標を追加
//   - 計算系 (客単価 / CPA) は monthly_summaries 側で既に c90-1 aggregation が計算済
//   - データなし時は "まだデータがありません" メッセージ
//   - 業態によらず同一表示 (6 メトリクスは全業態で意味を持つ)

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
  total_count?: number;       // 対応件数 (outsourced + internal の合計)
  ad_cost?: number;
  acquisition_count?: number; // 獲得件数
  unit_price?: number;        // 客単価 = total_revenue / total_count
  cpa?: number;               // = ad_cost / acquisition_count
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
      padding: 14, marginTop: 0, marginBottom: 0,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46", letterSpacing: "0.04em" }}>
          📊 月初〜{asOfDay ? `${month}/${asOfDay}` : "選択日"} の累積
        </span>
        {loading && (
          <span style={{ fontSize: 10, color: "#9ca3af" }}>読み込み中...</span>
        )}
      </div>

      {!hasData && !loading ? (
        <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>
          まだデータがありません。確定送信すると累積がここに表示されます。
        </div>
      ) : (
        // PR c92-2b: 6 指標を 3 col × 2 row で配置 (sidebar 320px に compact 収納)
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
          fontVariantNumeric: "tabular-nums",
        }}>
          <Metric label="売上" value={yen(summary?.total_revenue)} />
          <Metric label="対応件数" value={cnt(summary?.total_count)} />
          <Metric label="広告費" value={yen(summary?.ad_cost)} />
          <Metric label="獲得件数" value={cnt(summary?.acquisition_count)} />
          <Metric label="客単価" value={yen(summary?.unit_price)} />
          <Metric label="CPA" value={yen(summary?.cpa)} />
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
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{value}</div>
    </div>
  );
}
