"use client";
// セクション共通の見た目シェル (見出し付きカード)。

import React from "react";

type Props = {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
};

export default function SectionShell({ title, subtitle, children }: Props) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 10,
      border: "1px solid #d1fae5",
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        background: "#ecfdf5",
        padding: "8px 14px",
        borderBottom: "1px solid #d1fae5",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46", letterSpacing: "0.04em" }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: 10, color: "#6b7280" }}>{subtitle}</span>
        )}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
