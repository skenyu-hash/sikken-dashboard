"use client";
// PR c95-C-3: モバイル B 案 — 日報セクションを折りたたみ可能にするラッパー。
//
// 設計原則 (反さん条件「PC 1 ピクセル不変」厳守):
//   - **PC モード (width > 768px)**: title を旧版と verbatim 同一の style で render +
//     children を素通し → 旧 (c95-C-1/C-2) と DOM 構造・style 完全同一
//   - **モバイルモード (width <= 768px)**: toggle button (title + summary) + 折りたたみ展開
//   - SSR セーフ: 初期は PC として render → mount 後に matchMedia で判定 →
//     モバイルなら再 render (初回 flash 可能性ありだが許容、PC ユーザーは無影響)
//   - **既存業態 Section 改修なし** — children 内 DOM・style 無 touch
//
// 詳細仕様 (「①と⑤展開・③④⑥折りたたみ」の各サブセクション粒度) は反さん不在中 CC が
// 設計確定不可、本 PR では全 defaultOpenMobile=true で常時展開、後続 PR で詳細詰め予定。

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/** 768px 以下をモバイル判定。SSR 中は false (= PC 扱い)、mount 後に matchMedia で更新。 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

type Props = {
  /** セクション見出し (PC では styled div、モバイルでは toggle button に表示) */
  title: ReactNode;
  /** モバイル時に見出し横に出す要約値 (例: 売上 / 件数等)。PC では非表示 */
  summary?: ReactNode;
  /** モバイル時のデフォルト展開状態 (default: true) */
  defaultOpenMobile?: boolean;
  /** 子要素 */
  children: ReactNode;
  /**
   * PC モードで title を render するときの style。
   * 旧 DailyReportContent.tsx L262 と verbatim 同一の `padding: "18px 36px 6px"` /
   * `fontSize: 14` / `fontWeight: 700` / `color: "#2a3d36"` をデフォルト。
   * 上書きしたい場合のみ指定。
   */
  pcTitleStyle?: CSSProperties;
};

/** 旧版 DailyReportContent.tsx L262 / L280 と verbatim 同一の title style */
const DEFAULT_PC_TITLE_STYLE: CSSProperties = {
  padding: "18px 36px 6px",
  fontSize: 14,
  fontWeight: 700,
  color: "#2a3d36",
};

/**
 * 日報セクションを折りたたみ可能にするラッパー。
 * PC では title (旧と verbatim) + children を render、モバイルでは toggle button + 折りたたみ。
 */
export default function CollapsibleReportSection({
  title, summary, defaultOpenMobile = true, children, pcTitleStyle,
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpenMobile);

  // PC モード: 旧 DailyReportContent の title div + children を render (DOM 構造完全同一)
  if (!isMobile) {
    return (
      <>
        <div style={pcTitleStyle ?? DEFAULT_PC_TITLE_STYLE}>{title}</div>
        {children}
      </>
    );
  }

  // モバイルモード: toggle button + 折りたたみ展開
  return (
    <div style={{ marginBottom: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "10px 16px",
          background: "#f7fafc",
          border: "none",
          borderBottom: "1px solid #e5e7eb",
          textAlign: "left",
          fontSize: 13,
          fontWeight: 700,
          color: "#2a3d36",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>
          <span style={{ marginRight: 6, fontSize: 11, color: "#6b7280" }}>{open ? "▼" : "▶"}</span>
          {title}
        </span>
        {summary && (
          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>{summary}</span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
