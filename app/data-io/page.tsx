"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "../components/RoleProvider";
import { canAccessPage } from "../lib/roles";
import TemplatePanel from "./components/TemplatePanel";
import ImportPanel from "./components/ImportPanel";

type TabId = "export" | "template" | "import";

const TABS: { id: TabId; label: string }[] = [
  { id: "export",   label: "エクスポート" },
  { id: "template", label: "テンプレート" },
  { id: "import",   label: "取込" },
];

export default function DataIoPage() {
  const role = useRole();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("export");

  if (role === null) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        認証情報を確認中...
      </div>
    );
  }
  if (!canAccessPage(role, "/data-io")) {
    router.replace("/");
    return null;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      <div style={{ padding: "20px 20px" }}>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            padding: "24px 28px",
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: "#111827",
              letterSpacing: "-0.01em",
            }}
          >
            データ入出力センター
          </h1>
          <p style={{ margin: "6px 0 16px", fontSize: 12, color: "#6B7280" }}>
            月次・日次データのエクスポート、入力テンプレート、取込ガイド
          </p>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "none",
                  background: activeTab === t.id ? "#1B5E3F" : "transparent",
                  color: activeTab === t.id ? "#FFFFFF" : "#6B7280",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "export" && (
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
              Phase 9.2.1 で実装予定（5種類のエクスポート機能）
            </div>
          </div>
        )}
        {activeTab === "template" && <TemplatePanel />}
        {activeTab === "import" && <ImportPanel />}
      </div>
    </div>
  );
}
