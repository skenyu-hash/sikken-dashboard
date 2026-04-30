"use client";

import type { ReactNode } from "react";

export type CardState = {
  loading: boolean;
  error: string | null;
  lastDownloadAt: Date | null;
};

type ExportCardProps = {
  icon: string;
  title: string;
  description: string;
  state: CardState;
  onCsv?: () => void;
  onXlsx?: () => void;
  csvDisabled?: boolean;
  xlsxDisabled?: boolean;
  children?: ReactNode; // 種別固有の追加コントロール
};

export default function ExportCard({
  icon,
  title,
  description,
  state,
  onCsv,
  onXlsx,
  csvDisabled,
  xlsxDisabled,
  children,
}: ExportCardProps) {
  const csvDisabledFinal = state.loading || csvDisabled || !onCsv;
  const xlsxDisabledFinal = state.loading || xlsxDisabled || !onXlsx;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>
            {description}
          </div>
        </div>
      </div>

      {children && (
        <div
          style={{
            paddingTop: 12,
            borderTop: "1px solid #F3F4F6",
            marginBottom: 12,
          }}
        >
          {children}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 12,
          borderTop: "1px solid #F3F4F6",
          flexWrap: "wrap",
        }}
      >
        {onCsv && (
          <DownloadButton
            label="CSV"
            icon="📄"
            disabled={csvDisabledFinal}
            onClick={onCsv}
          />
        )}
        {onXlsx && (
          <DownloadButton
            label="XLSX"
            icon="📊"
            disabled={xlsxDisabledFinal}
            onClick={onXlsx}
          />
        )}
        {state.loading && (
          <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>
            ⏳ 生成中...
          </span>
        )}
        {state.lastDownloadAt && !state.loading && (
          <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: "auto" }}>
            最終DL: {formatTime(state.lastDownloadAt)}
          </span>
        )}
      </div>

      {state.error && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "#FEE2E2",
            color: "#991B1B",
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 6,
          }}
        >
          ⚠ {state.error}
        </div>
      )}
    </div>
  );
}

function DownloadButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 16px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "1px solid #1B5E3F",
        background: disabled ? "#F3F4F6" : "#FFFFFF",
        color: disabled ? "#9CA3AF" : "#1B5E3F",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s ease",
      }}
    >
      {icon} {label}
    </button>
  );
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
