"use client";
import { useEffect, useMemo, useState } from "react";
import { emptyTargets, type Targets } from "../lib/calculations";
import { useRole } from "../components/RoleProvider";
import { hasPageAccess } from "../lib/permissions";
import { BUSINESSES, type BusinessCategory } from "../lib/businesses";
import { COMPANIES } from "../lib/companies";
import TargetsMatrix, { TARGETS_METRICS, formatByUnit } from "./components/TargetsMatrix";
import TargetsGroupView from "./components/TargetsGroupView";
import TargetsCompanyView from "./components/TargetsCompanyView";
import { useSaveStatus, type SaveStatus } from "./lib/useDebounceSave";
import { buildTargetsCsv, buildTargetsFilename, downloadTargetsCsv } from "./lib/csvExport";

const ALL_AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

const GROUP_TAB_ID = "__group__";
type ViewMode = "business" | "company";

export default function TargetsPage() {
  const now = new Date();
  const role = useRole();
  const canEdit = role !== null && hasPageAccess({ role }, "targets", "edit");

  // 月選択（無制限、PR #19 と同パターン）
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  function gotoPrevMonth() {
    const d = new Date(year, month - 2, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }
  function gotoNextMonth() {
    const d = new Date(year, month, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  // 表示モード
  const [viewMode, setViewMode] = useState<ViewMode>("business");

  // 事業別モード state
  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
  const businessAreas = useMemo(() => {
    const biz = BUSINESSES.find((b) => b.id === activeBusiness);
    if (!biz) return ALL_AREAS;
    return biz.areas.map((id) => ALL_AREAS.find((a) => a.id === id)).filter(Boolean) as typeof ALL_AREAS;
  }, [activeBusiness]);
  // 事業別エリアタブ: areaId or GROUP_TAB_ID
  const [activeAreaTab, setActiveAreaTab] = useState<string>(GROUP_TAB_ID);

  // 会社別モード state
  const [activeCompanyId, setActiveCompanyId] = useState<string>(COMPANIES[0]?.id ?? "");

  // 保存状態（TargetsMatrix から伝播）
  const { status: matrixStatus, flash: matrixFlash } = useSaveStatus();
  const [bubbledStatus, setBubbledStatus] = useState<SaveStatus>("idle");
  const [bubbledFlash, setBubbledFlash] = useState(false);
  const displayStatus: SaveStatus = bubbledStatus !== "idle" ? bubbledStatus : matrixStatus;
  const displayFlash = bubbledFlash || matrixFlash;

  // 「前月の値をコピー」: confirm → /api/targets-bulk から前月取得 → 全エリア upsert
  const [copyingPrev, setCopyingPrev] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  async function copyPreviousMonth() {
    if (!canEdit) return;
    if (!confirm(`前月（${month === 1 ? year - 1 : year}年${month === 1 ? 12 : month - 1}月）の値を ${year}年${month}月 の全エリアに上書きコピーします。よろしいですか？`)) return;
    setCopyingPrev(true);
    setCopyMsg(null);
    try {
      const prevY = month === 1 ? year - 1 : year;
      const prevM = month === 1 ? 12 : month - 1;
      const fetched = await Promise.all(
        businessAreas.map(async (a) => {
          const r = await fetch(
            `/api/targets?area=${a.id}&year=${prevY}&month=${prevM}&category=${activeBusiness}`
          );
          const j = r.ok ? await r.json() : { targets: emptyTargets() };
          return { areaId: a.id, targets: { ...emptyTargets(), ...(j.targets ?? {}) } };
        })
      );
      const results = await Promise.all(
        fetched.map((row) =>
          fetch("/api/targets", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ areaId: row.areaId, year, month, targets: row.targets, category: activeBusiness }),
          }).then((r) => r.ok)
        )
      );
      const okCount = results.filter(Boolean).length;
      setCopyMsg(`${okCount}/${results.length} エリアにコピーしました（要画面リロードで反映確認）`);
    } catch {
      setCopyMsg("コピー中にエラーが発生しました");
    }
    setCopyingPrev(false);
  }

  // 「全エリア同じ値を設定」: 簡易 prompt 実装
  const [bulkSetting, setBulkSetting] = useState(false);
  async function setAllAreasSameValue() {
    if (!canEdit) return;
    const fieldList = TARGETS_METRICS.map((m) => m.label).join(" / ");
    const fieldLabel = prompt(
      `どの指標を全エリアに同値設定しますか？\n選択肢: ${fieldList}\n（正確な指標名を入力してください）`
    );
    if (!fieldLabel) return;
    const metric = TARGETS_METRICS.find((m) => m.label === fieldLabel.trim());
    if (!metric) {
      alert("指標名が一致しません。キャンセルします。");
      return;
    }
    const valStr = prompt(`「${metric.label}」を全エリアに設定する値（数値）を入力してください`);
    if (valStr === null) return;
    const val = parseFloat(valStr) || 0;
    setBulkSetting(true);
    try {
      const fetched = await Promise.all(
        businessAreas.map(async (a) => {
          const r = await fetch(
            `/api/targets?area=${a.id}&year=${year}&month=${month}&category=${activeBusiness}`
          );
          const j = r.ok ? await r.json() : { targets: emptyTargets() };
          const t = { ...emptyTargets(), ...(j.targets ?? {}), [metric.key]: val };
          return { areaId: a.id, targets: t };
        })
      );
      await Promise.all(
        fetched.map((row) =>
          fetch("/api/targets", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ areaId: row.areaId, year, month, targets: row.targets, category: activeBusiness }),
          })
        )
      );
      setCopyMsg(`「${metric.label}」を全${businessAreas.length}エリアに ${val} を設定しました（要画面リロード）`);
    } catch {
      setCopyMsg("一括設定中にエラーが発生しました");
    }
    setBulkSetting(false);
  }

  // 「CSVエクスポート」: 現在のエリア別ビューを CSV 化
  async function exportCsv() {
    const fetched = await Promise.all(
      businessAreas.map(async (a) => {
        const r = await fetch(
          `/api/targets?area=${a.id}&year=${year}&month=${month}&category=${activeBusiness}`
        );
        const j = r.ok ? await r.json() : { targets: emptyTargets() };
        return { areaId: a.id, areaName: a.name, targets: { ...emptyTargets(), ...(j.targets ?? {}) } };
      })
    );
    const headers = ["エリアID", "エリア", ...TARGETS_METRICS.map((m) => m.label)];
    const rows = fetched.map((row) => [
      row.areaId,
      row.areaName,
      ...TARGETS_METRICS.map((m) => Number(row.targets[m.key as keyof Targets] ?? 0)),
    ]);
    const csv = buildTargetsCsv(headers, rows);
    const filename = buildTargetsFilename(activeBusiness, year, month);
    downloadTargetsCsv(filename, csv);
  }

  // 表示モード変更時にエリアタブ初期化
  useEffect(() => {
    if (viewMode === "business") {
      const biz = BUSINESSES.find((b) => b.id === activeBusiness);
      if (biz && activeAreaTab !== GROUP_TAB_ID && !biz.areas.includes(activeAreaTab)) {
        setActiveAreaTab(GROUP_TAB_ID);
      }
    }
  }, [viewMode, activeBusiness, activeAreaTab]);

  // 業態切替時はグループ全体タブに戻す（既存動作の安全側維持）
  useEffect(() => {
    setActiveAreaTab(GROUP_TAB_ID);
  }, [activeBusiness]);

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      {/* ヘッダー（緑グラデ） */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        {/* 表示モードトグル + タブ列 */}
        <div style={{ padding: "8px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* タブ群（事業 or 会社） */}
          {viewMode === "business" ? (
            <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
              {BUSINESSES.map((b) => (
                <button
                  key={b.id} type="button" onClick={() => setActiveBusiness(b.id)}
                  style={{
                    padding: "5px 12px", borderRadius: "6px 6px 0 0",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                    background: activeBusiness === b.id ? "rgba(255,255,255,0.25)" : "transparent",
                    color: activeBusiness === b.id ? "#fff" : "rgba(255,255,255,0.55)",
                    whiteSpace: "nowrap",
                  }}
                >{b.label}</button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
              {COMPANIES.map((c) => (
                <button
                  key={c.id} type="button" onClick={() => setActiveCompanyId(c.id)}
                  style={{
                    padding: "5px 12px", borderRadius: "6px 6px 0 0",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                    background: activeCompanyId === c.id ? "rgba(255,255,255,0.25)" : "transparent",
                    color: activeCompanyId === c.id ? "#fff" : "rgba(255,255,255,0.55)",
                    whiteSpace: "nowrap",
                  }}
                >{c.name}</button>
              ))}
            </div>
          )}
          {/* 表示モードトグル */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button" onClick={() => setViewMode("business")}
              style={modeBtnStyle(viewMode === "business")}
            >事業別</button>
            <button
              type="button" onClick={() => setViewMode("company")}
              style={modeBtnStyle(viewMode === "company")}
            >会社別</button>
          </div>
        </div>

        {/* エリア + 保存状態 */}
        <div style={{ padding: "10px 24px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          {viewMode === "business" ? (
            <div style={{ display: "flex", gap: 4, overflowX: "auto", flexWrap: "wrap" }}>
              {[...businessAreas, { id: GROUP_TAB_ID, name: "グループ全体" }].map((a) => (
                <button
                  key={a.id} type="button" onClick={() => setActiveAreaTab(a.id)}
                  style={{
                    padding: "5px 14px", borderRadius: 16, fontSize: 11, fontWeight: 700,
                    cursor: "pointer",
                    border: a.id === GROUP_TAB_ID ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.2)",
                    background: activeAreaTab === a.id ? "rgba(255,255,255,0.3)" : "transparent",
                    color: activeAreaTab === a.id ? "#fff" : "rgba(255,255,255,0.75)",
                    whiteSpace: "nowrap",
                  }}
                >{a.name}{a.id === GROUP_TAB_ID && " 🌐"}</button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              ※ 会社別ビューは参照のみ。編集は「事業別」モードに切替えてください。
            </div>
          )}
          {/* 保存ステータス */}
          <SaveIndicator status={displayStatus} flash={displayFlash} />
        </div>

        {/* タイトル + 月ナビ */}
        <div style={{ padding: "0 24px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button type="button" onClick={gotoPrevMonth} style={navBtn()}>◀</button>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
              {year}年{month}月
            </span>
            <button type="button" onClick={gotoNextMonth} style={navBtn()}>▶</button>
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff" }}>月次目標管理</h1>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", marginTop: "3px" }}>
            {viewMode === "business" ? (
              <>
                {year}年{month}月 ／ {BUSINESSES.find((b) => b.id === activeBusiness)?.label}
                {activeAreaTab === GROUP_TAB_ID
                  ? " ／ グループ全体"
                  : ` ／ ${ALL_AREAS.find((a) => a.id === activeAreaTab)?.name ?? ""}エリア`}
              </>
            ) : (
              <>
                {year}年{month}月 ／ {COMPANIES.find((c) => c.id === activeCompanyId)?.name ?? ""}
              </>
            )}
          </p>
        </div>
      </div>

      {/* 便利機能バー（事業別 + 通常エリアタブ時のみ） */}
      {viewMode === "business" && activeAreaTab !== GROUP_TAB_ID && (
        <div style={{ padding: "12px 24px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && (
            <button type="button" onClick={copyPreviousMonth} disabled={copyingPrev} style={utilBtn(copyingPrev)}>
              📋 前月の値をコピー
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={setAllAreasSameValue} disabled={bulkSetting} style={utilBtn(bulkSetting)}>
              📐 全エリア同じ値を設定
            </button>
          )}
          <button type="button" onClick={exportCsv} style={utilBtn(false)}>📤 CSVエクスポート</button>
          {copyMsg && (
            <span style={{ fontSize: 11, color: "#065f46", fontWeight: 700, alignSelf: "center", marginLeft: 8 }}>
              {copyMsg}
            </span>
          )}
        </div>
      )}

      {/* メインビュー */}
      <div style={{ padding: "16px 20px" }}>
        {viewMode === "business" && activeAreaTab === GROUP_TAB_ID && (
          <TargetsGroupView
            areas={businessAreas}
            category={activeBusiness}
            year={year}
            month={month}
          />
        )}
        {viewMode === "business" && activeAreaTab !== GROUP_TAB_ID && (
          <TargetsMatrix
            areas={businessAreas.filter((a) => a.id === activeAreaTab)}
            category={activeBusiness}
            year={year}
            month={month}
            canEdit={canEdit}
            onSaveStatusChange={(s, f) => {
              setBubbledStatus(s);
              setBubbledFlash(f);
            }}
          />
        )}
        {viewMode === "company" && (
          <TargetsCompanyView
            activeCompanyId={activeCompanyId}
            year={year}
            month={month}
            onChangeBusinessRequest={(category, areaId) => {
              setViewMode("business");
              setActiveBusiness(category);
              setActiveAreaTab(areaId);
            }}
          />
        )}
      </div>
    </div>
  );
}

// formatByUnit は意図的に未使用（page.tsx 内では子コンポーネントが使用）
void formatByUnit;

function modeBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 12px", fontSize: 11, fontWeight: 700,
    border: "1px solid rgba(255,255,255,0.4)", borderRadius: 6,
    background: active ? "rgba(255,255,255,0.25)" : "transparent",
    color: "#fff", cursor: "pointer",
  };
}

function navBtn(): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
    borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 14,
  };
}

function utilBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", fontSize: 11, fontWeight: 700,
    border: "1px solid #d1fae5", borderRadius: 8,
    background: disabled ? "#f3f4f6" : "#fff",
    color: disabled ? "#9ca3af" : "#065f46",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function SaveIndicator({ status, flash }: { status: SaveStatus; flash: boolean }) {
  if (status === "idle" && !flash) {
    return <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>—</span>;
  }
  const dotStyle: React.CSSProperties = {
    display: "inline-block", width: 8, height: 8, borderRadius: "50%",
    background: status === "saving" ? "#fbbf24" : status === "error" ? "#ef4444" : "#10b981",
    boxShadow: flash ? "0 0 0 4px rgba(16,185,129,0.3)" : "none",
    transition: "box-shadow 0.4s ease",
  };
  const label =
    status === "saving" ? "保存中..."
    : status === "error" ? "保存失敗"
    : flash ? "保存済み ✓"
    : "保存済み";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#fff", fontWeight: 600 }}>
      <span style={dotStyle} />
      <span>{label}</span>
    </span>
  );
}
