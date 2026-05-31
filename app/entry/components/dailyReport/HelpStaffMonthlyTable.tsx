"use client";
// PR c95-A-3: ⑤ HELP 統計セクション (月累積)、水道・電気・鍵のみ表示。
// モック docs/mocks/daily_report_kansai_0530.html の .help-panel に準拠。
//
// 構成:
//   左 (.help-left): HELP合計カード (深緑 6 セル) + 会社参照・指標 (7 セル grid)
//   右 (.help-staff): 個人成績テーブル (担当者 / 売上 / 件数 / 成約 / 単価 / 成約率)
//
// 閾値判定 (赤 #dc2626): helpStats.evaluateThresholds 経由。
//   顧客単価 ≤ 650,000 / 成約率 ≤ 70% / 引継率対総件数 ≤ 5% / 引継率対工事数 ≤ 30%。
//   null・0 件は赤にしない。0 件担当者は名前残し「–」。

import type { HelpStaffMonthly } from "../../lib/helpStats";
import {
  helpUnitPriceFromAggregate, closeRate, takeoverRateByTotal, takeoverRateByConstruction,
  helpSalesRatio, evaluateThresholds,
} from "../../lib/helpStats";
import { yen, pct } from "./reportPrimitives";

type Props = {
  helpStaffMonthly: HelpStaffMonthly[];
  /** 月累計の会社参照値 (引継率・売上高率の分母)。null は分母不明扱い → 比率「—」。 */
  companyReference: { totalRevenue: number; totalCount: number; constructionCount: number } | null;
  /** 月範囲表示用 (例: "5/1〜5/30") */
  periodLabel: string;
};

const yenOrDash = (n: number, hasData: boolean): string => (hasData ? yen(n) : "–");
const cntOrDash = (n: number, hasData: boolean): string => (hasData ? `${n}` : "–");

export default function HelpStaffMonthlyTable({ helpStaffMonthly, companyReference, periodLabel }: Props) {
  const sumSales = helpStaffMonthly.reduce((s, r) => s + r.help_sales, 0);
  const sumCount = helpStaffMonthly.reduce((s, r) => s + r.help_count, 0);
  const sumClose = helpStaffMonthly.reduce((s, r) => s + r.help_close_count, 0);
  const totalUp = helpUnitPriceFromAggregate(sumSales, sumCount);
  const totalCloseRate = closeRate(sumClose, sumCount);

  // 引継率 / 売上高率 (companyReference 必須)
  const ref = companyReference;
  const ratio = ref ? helpSalesRatio(sumSales, ref.totalRevenue) : null;
  const tk1 = ref ? takeoverRateByTotal(sumCount, ref.totalCount) : null;
  const tk2 = ref ? takeoverRateByConstruction(sumCount, ref.constructionCount) : null;
  const refThresh = evaluateThresholds(null, null, tk1, tk2);

  // 共通スタイル (.help-panel 準拠)
  const panelStyle: React.CSSProperties = {
    background: "#fff", border: "1px solid #e0e8e4", borderRadius: 12, overflow: "hidden",
  };
  const phStyle: React.CSSProperties = {
    background: "#f4f9f7", borderBottom: "1px solid #e8f1ed",
    padding: "11px 16px", fontWeight: 700, fontSize: 13.5, color: "#2a3d36",
    display: "flex", alignItems: "center", gap: 8,
  };
  const nBadge: React.CSSProperties = {
    background: "#c97f2e", width: 21, height: 21, borderRadius: 6,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff",
  };
  const totalBox: React.CSSProperties = {
    background: "#2e8b62", color: "#fff", padding: "14px 18px", borderRadius: 11, marginBottom: 12,
  };
  const subGrid: React.CSSProperties = {
    display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
    border: "1px solid #e3ebe7", borderRadius: 10, background: "#f7faf9", overflow: "hidden",
  };
  const subCell: React.CSSProperties = {
    textAlign: "center", padding: "9px 5px", borderRight: "1px solid #eaf0ed",
  };
  const subCellLast: React.CSSProperties = { ...subCell, borderRight: "none" };
  const subK: React.CSSProperties = { fontSize: 9, color: "#7d8f88", lineHeight: 1.2, marginBottom: 4 };
  const subV: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: "#0e6b4f" };
  const subVAlert: React.CSSProperties = { ...subV, color: "#dc2626" };

  return (
    <div style={panelStyle}>
      <div style={phStyle}>
        <span style={nBadge}>⑤</span>
        <span>HELP 統計</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#8a9c95", fontWeight: 500 }}>月累積({periodLabel})</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr" }}>
        {/* 左: HELP合計カード + 会社参照・指標 */}
        <div style={{ borderRight: "1px solid #eef2f0", padding: 14 }}>
          <div style={totalBox}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, opacity: 0.95 }}>HELP合計(月累積)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
              <TotalCell k="売上" v={sumCount > 0 ? yen(sumSales) : "—"} />
              <TotalCell k="件数" v={sumCount > 0 ? `${sumCount}` : "—"} />
              <TotalCell k="成約数" v={sumCount > 0 ? `${sumClose}` : "—"} />
              <TotalCell k="顧客単価" v={totalUp === null ? "—" : yen(totalUp)} />
              <TotalCell k="成約率" v={totalCloseRate === null ? "—" : pct(totalCloseRate)} />
              <TotalCell k="—" v="—" />
            </div>
          </div>

          <div style={subGrid}>
            <div style={subCell}>
              <div style={subK}>会社総売上(累積)</div>
              <div style={subV}>{ref ? yen(ref.totalRevenue) : "—"}</div>
            </div>
            <div style={subCell}>
              <div style={subK}>会社総件数(累積)</div>
              <div style={subV}>{ref ? `${ref.totalCount}` : "—"}</div>
            </div>
            <div style={subCell}>
              <div style={subK}>会社工事数(累積)</div>
              <div style={subV}>{ref ? `${ref.constructionCount}` : "—"}</div>
            </div>
            <div style={subCell}>
              <div style={subK}>HELP成約率</div>
              <div style={subV}>{totalCloseRate === null ? "—" : pct(totalCloseRate)}</div>
            </div>
            <div style={subCell}>
              <div style={subK}>売上高率</div>
              <div style={subV}>{pct(ratio)}</div>
            </div>
            <div style={subCell}>
              <div style={subK}>引継率(対件数)</div>
              <div style={refThresh.takeoverTotalAlert ? subVAlert : subV}>{pct(tk1)}</div>
            </div>
            <div style={subCellLast}>
              <div style={subK}>引継率(対工事)</div>
              <div style={refThresh.takeoverConstructionAlert ? subVAlert : subV}>{pct(tk2)}</div>
            </div>
          </div>
        </div>

        {/* 右: 個人成績テーブル */}
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#46554e", marginBottom: 8 }}>個人成績(月累積)</div>
          {helpStaffMonthly.length === 0 ? (
            <div style={{
              padding: "16px 12px", fontSize: 12, color: "#7d8f88", textAlign: "center",
              background: "#f9fafb", borderRadius: 8, border: "1px dashed #e5e7eb",
            }}>HELP 対応なし</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <Th align="left">担当者</Th>
                  <Th>HELP売上高</Th>
                  <Th>件数</Th>
                  <Th>成約数</Th>
                  <Th>顧客単価</Th>
                  <Th>成約率</Th>
                </tr>
              </thead>
              <tbody>
                {helpStaffMonthly.map((r) => {
                  const up = helpUnitPriceFromAggregate(r.help_sales, r.help_count);
                  const cr = closeRate(r.help_close_count, r.help_count);
                  const thresh = evaluateThresholds(up, cr, null, null);
                  const hasData = r.help_count > 0;
                  return (
                    <tr key={r.staff_name}>
                      <Td align="left" name>{r.staff_name || "(未設定)"}</Td>
                      <Td>{yenOrDash(r.help_sales, hasData)}</Td>
                      <Td>{cntOrDash(r.help_count, hasData)}</Td>
                      <Td>{cntOrDash(r.help_close_count, hasData)}</Td>
                      <Td alert={thresh.unitPriceAlert} autoColor>{up === null ? "–" : yen(up)}</Td>
                      <Td alert={thresh.closeRateAlert} autoColor>{cr === null ? "–" : pct(cr)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function TotalCell({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>{k}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{v}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{
      background: "#f7f3ea", color: "#9a5e1e", padding: "8px 11px",
      textAlign: align ?? "right", fontSize: 11, fontWeight: 700,
    }}>{children}</th>
  );
}
function Td({
  children, align, name, alert, autoColor,
}: {
  children: React.ReactNode; align?: "left" | "right"; name?: boolean; alert?: boolean; autoColor?: boolean;
}) {
  const color = alert ? "#dc2626" : autoColor ? "#b58a4a" : name ? "#46554e" : "#1c2b25";
  const fontWeight = alert || name ? 700 : 600;
  return (
    <td style={{
      padding: "8px 11px", textAlign: align ?? "right",
      borderBottom: "1px solid #f3f5f3", fontVariantNumeric: "tabular-nums",
      color, fontWeight,
    }}>{children}</td>
  );
}
