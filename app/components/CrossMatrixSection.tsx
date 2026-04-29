"use client";

import { useEffect, useState } from "react";

type CategoryRow = {
  category: string;
  label: string;
  revenue: number | null;
  profit: number | null;
  adCost: number | null;
  count: number | null;
  cpa: number | null;
  adRatio: number | null;
  forecast: number | null;
};

type TotalRow = {
  label: string;
  revenue: number;
  profit: number;
  adCost: number;
  count: number;
  cpa: number | null;
  adRatio: number | null;
  forecast: number | null;
};

type ApiResponse = {
  year: number;
  month: number;
  daysInMonth: number;
  daysElapsed: number;
  categories: CategoryRow[];
  total: TotalRow;
};

function formatYenSplit(v: number | null | undefined): { num: string; unit: string } {
  if (v === null || v === undefined) return { num: "—", unit: "" };
  if (v >= 100000000) return { num: (v / 100000000).toFixed(2), unit: "億" };
  if (v >= 10000) return { num: Math.round(v / 10000).toLocaleString(), unit: "万" };
  return { num: v.toLocaleString(), unit: "" };
}

function formatCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString();
}

function getRatioColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return "#D1D5DB";
  const pct = v * 100;
  if (pct >= 30) return "#DC2626";
  if (pct >= 25) return "#D97706";
  return "#059669";
}

export default function CrossMatrixSection() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cross-matrix")
      .then((r) => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "#9CA3AF", fontSize: 13 }}>
        読み込み中...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div style={{ padding: 24, color: "#DC2626", fontSize: 13 }}>
        データの取得に失敗しました
      </div>
    );
  }

  const maxRevenue = Math.max(
    data.total.revenue,
    ...data.categories.map((c) => c.revenue ?? 0)
  );

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 16,
        padding: "28px 32px",
        marginBottom: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "#111827",
            }}
          >
            グループ全体クロス比較
          </h2>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
            {data.year}年{data.month}月　・　全エリア合算　・　経過 {data.daysElapsed}/
            {data.daysInMonth}日
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            fontSize: 11,
            color: "#6B7280",
            marginTop: 4,
          }}
        >
          <Legend color="#059669" label="健全 ≤25%" />
          <Legend color="#D97706" label="注意 25–30%" />
          <Legend color="#DC2626" label="警戒 ≥30%" />
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 780,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <thead>
            <tr>
              <Th align="left">カテゴリ</Th>
              <Th>売上</Th>
              <Th>粗利</Th>
              <Th>広告費</Th>
              <Th>件数</Th>
              <Th>CPA</Th>
              <Th>広告比率</Th>
              <Th>着地予測</Th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((row) => (
              <DataRow key={row.category} row={row} maxRevenue={maxRevenue} />
            ))}
            <DataRow row={data.total} maxRevenue={maxRevenue} isTotal />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
        }}
      />
      {label}
    </span>
  );
}

function Th({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: align === "left" ? "0 0 12px 0" : "0 8px 12px",
        fontSize: 10,
        fontWeight: 500,
        color: "#9CA3AF",
        letterSpacing: "0.6px",
        borderBottom: "1px solid #E5E7EB",
      }}
    >
      {children}
    </th>
  );
}

type RowInput = {
  label: string;
  revenue: number | null;
  profit: number | null;
  adCost: number | null;
  count: number | null;
  cpa: number | null;
  adRatio: number | null;
  forecast: number | null;
};

function DataRow({
  row,
  maxRevenue,
  isTotal = false,
}: {
  row: RowInput;
  maxRevenue: number;
  isTotal?: boolean;
}) {
  const rev = formatYenSplit(row.revenue);
  const profit = formatYenSplit(row.profit);
  const adCost = formatYenSplit(row.adCost);
  const forecast = formatYenSplit(row.forecast);
  const ratioColor = getRatioColor(row.adRatio);
  const ratioPct =
    row.adRatio !== null && row.adRatio !== undefined ? row.adRatio * 100 : null;
  const revBarPct =
    maxRevenue > 0 && row.revenue
      ? Math.max((row.revenue / maxRevenue) * 100, 1.5)
      : 0;
  const isEmpty = row.revenue === null || row.revenue === undefined;
  const isWarning = !isTotal && ratioPct !== null && ratioPct >= 25;

  const baseTd: React.CSSProperties = {
    padding: "16px 8px 18px",
    fontSize: 14,
    textAlign: "right",
    borderBottom: isTotal ? "none" : "1px solid #F3F4F6",
    borderTop: isTotal ? "1px solid #D1D5DB" : undefined,
    background: isTotal
      ? "#FAFAFA"
      : isWarning
      ? "rgba(220,38,38,0.04)"
      : undefined,
    color: isEmpty ? "#D1D5DB" : "#111827",
    fontWeight: isTotal ? 500 : 400,
    position: "relative",
  };
  const unit: React.CSSProperties = {
    fontSize: 10,
    color: "#9CA3AF",
    marginLeft: 1,
    fontWeight: 400,
  };

  return (
    <tr>
      <td
        style={{
          ...baseTd,
          textAlign: "left",
          paddingLeft: 0,
          fontWeight: isTotal ? 600 : 500,
          color: isEmpty ? "#9CA3AF" : "#111827",
        }}
      >
        {row.label}
      </td>
      <td style={baseTd}>
        <span>
          {rev.num}
          {rev.unit && <span style={unit}>{rev.unit}</span>}
        </span>
        {!isEmpty && (
          <div
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 6,
              height: 2,
              background: "#F3F4F6",
              borderRadius: 1,
            }}
          >
            <div
              style={{
                width: `${revBarPct}%`,
                height: "100%",
                background: isTotal ? "#374151" : "#9CA3AF",
                borderRadius: 1,
              }}
            />
          </div>
        )}
      </td>
      <td style={baseTd}>
        {profit.num}
        {profit.unit && <span style={unit}>{profit.unit}</span>}
      </td>
      <td style={baseTd}>
        {adCost.num}
        {adCost.unit && <span style={unit}>{adCost.unit}</span>}
      </td>
      <td style={baseTd}>{formatCount(row.count)}</td>
      <td style={baseTd}>
        {row.cpa !== null && row.cpa !== undefined ? (
          <>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>¥</span>
            {row.cpa.toLocaleString()}
          </>
        ) : (
          "—"
        )}
      </td>
      <td style={baseTd}>
        <span
          style={{
            color: ratioPct === null ? "#D1D5DB" : ratioColor,
            fontWeight: 500,
          }}
        >
          {ratioPct !== null ? ratioPct.toFixed(1) : "—"}
          {ratioPct !== null && (
            <span style={{ ...unit, color: ratioColor, opacity: 0.7 }}>%</span>
          )}
        </span>
        {ratioPct !== null && (
          <div
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 6,
              height: 2,
              background: "#F3F4F6",
              borderRadius: 1,
            }}
          >
            <div
              style={{
                width: `${Math.min(ratioPct * 2, 100)}%`,
                height: "100%",
                background: ratioColor,
                borderRadius: 1,
              }}
            />
          </div>
        )}
      </td>
      <td style={baseTd}>
        {forecast.num}
        {forecast.unit && <span style={unit}>{forecast.unit}</span>}
      </td>
    </tr>
  );
}