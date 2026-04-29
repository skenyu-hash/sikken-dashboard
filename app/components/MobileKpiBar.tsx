"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type KpiData = {
  todayRevenue: number;
  monthForecast: number;
  adRatio: number;
};

function formatYen(value: number): string {
  if (value >= 100000000) {
    return `¥${(value / 100000000).toFixed(1)}億`;
  }
  if (value >= 10000) {
    return `¥${(value / 10000).toFixed(0)}万`;
  }
  return `¥${value.toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function MobileKpiBar() {
  const path = usePathname();
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/mobile-kpi");
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (path === "/login") return null;

  const cards = [
    {
      label: "本日売上",
      value: data ? formatYen(data.todayRevenue) : loading ? "..." : "—",
      accent: "#FF8C42",
    },
    {
      label: "月着地予測",
      value: data ? formatYen(data.monthForecast) : loading ? "..." : "—",
      accent: "#1B5E3F",
    },
    {
      label: "売上対広告比率",
      value: data ? formatPercent(data.adRatio) : loading ? "..." : "—",
      accent: "#3B82F6",
    },
  ];

  return (
    <div
      className="show-mobile"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: "white",
        borderTop: "1px solid #E5E5E5",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.05)",
        padding: "8px 8px",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)",
        gap: 6,
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            flex: 1,
            background: "#FAFAFA",
            borderLeft: `3px solid ${card.accent}`,
            borderRadius: 4,
            padding: "6px 8px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#666",
              fontWeight: 500,
              marginBottom: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#171717",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
