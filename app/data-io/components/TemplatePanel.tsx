"use client";

export default function TemplatePanel() {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: "48px 24px",
        textAlign: "center",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
        準備中
      </div>
      <div style={{ fontSize: 12, color: "#6B7280" }}>
        Phase 9.2.2 で実装予定（入力テンプレート機能）
      </div>
    </div>
  );
}
