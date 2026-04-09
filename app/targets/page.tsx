"use client";
import { useEffect, useState } from "react";
import { emptyTargets, type Targets } from "../lib/calculations";
import { useRole } from "../components/RoleProvider";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

export default function TargetsPage() {
  const role = useRole();
  const canEdit = role === "admin" || role === "manager";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [areaId, setAreaId] = useState(AREAS[0].id);
  const [targets, setTargets] = useState<Targets>(emptyTargets());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/targets?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j) => setTargets({ ...emptyTargets(), ...j.targets }));
  }, [areaId, year, month]);

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    const res = await fetch("/api/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ areaId, year, month, targets }),
    });
    setSaving(false);
    setSavedMsg(res.ok ? "保存しました" : "保存に失敗しました");
  }

  const MAN_KEYS = new Set<keyof Targets>([
    "targetSales", "targetProfit", "targetHelpSales", "targetHelpUnitPrice",
    "targetSelfSales", "targetSelfProfit", "targetNewSales", "targetNewProfit",
    "targetAdCost", "targetUnitPrice", "targetCallUnitPrice",
  ]);

  function setField(k: keyof Targets, raw: string) {
    const num = Number(raw.replace(/[^0-9.]/g, "")) || 0;
    const stored = MAN_KEYS.has(k) ? Math.round(num * 10000) : num;
    setTargets((t) => ({ ...t, [k]: stored }));
  }
  function displayVal(k: keyof Targets): string {
    const v = targets[k] ?? 0;
    if (!v) return "";
    return MAN_KEYS.has(k) ? String(v / 10000) : String(v);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px 8px" }}>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)",
              color: "#fff", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", fontWeight: 700,
            }}
          >
            {AREAS.map((a) => (
              <option key={a.id} value={a.id} style={{ color: "#111" }}>{a.name}エリア</option>
            ))}
          </select>
          {canEdit ? (
            <button
              onClick={save}
              disabled={saving}
              style={{
                background: "#fff", color: "#059669", border: "none", borderRadius: "8px",
                padding: "8px 24px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "保存中..." : "目標を保存"}
            </button>
          ) : (
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>閲覧のみ（役員・管理職のみ編集可）</span>
          )}
        </div>
        <div style={{ padding: "0 24px 14px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff" }}>月次目標設定</h1>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", marginTop: "3px" }}>
            {year}年{month}月 ／ {AREAS.find((a) => a.id === areaId)?.name}エリア
          </p>
        </div>
      </div>

      {savedMsg && (
        <div
          style={{
            background: savedMsg.includes("失敗") ? "#fee2e2" : "#d1fae5",
            color: savedMsg.includes("失敗") ? "#7f1d1d" : "#064e3b",
            padding: "10px 24px", fontSize: "13px", fontWeight: 600, textAlign: "center",
          }}
        >
          {savedMsg}
        </div>
      )}

      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
          <FieldSection title="① 全体KPI" fields={[
            { key: "targetSales", label: "売上目標", unit: "万円", color: "#059669" },
            { key: "targetProfit", label: "粗利目標", unit: "万円", color: "#059669" },
            { key: "targetCount", label: "獲得件数目標", unit: "件", color: "#3b82f6" },
            { key: "targetUnitPrice", label: "客単価目標", unit: "円", color: "#3b82f6" },
            { key: "targetCpa", label: "CPA目標", unit: "円", color: "#3b82f6" },
            { key: "targetConversionRate", label: "成約率目標", unit: "%", color: "#3b82f6" },
          ]} setField={setField} displayVal={displayVal} canEdit={canEdit} />

          <FieldSection title="② HELP部門目標" fields={[
            { key: "targetHelpSales", label: "HELP売上目標", unit: "万円", color: "#0891b2" },
            { key: "targetHelpCount", label: "HELP件数目標", unit: "件", color: "#0891b2" },
            { key: "targetHelpUnitPrice", label: "HELP客単価目標", unit: "円", color: "#0891b2" },
            { key: "targetHelpRate", label: "HELP率目標", unit: "%", color: "#0891b2" },
          ]} setField={setField} displayVal={displayVal} canEdit={canEdit} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
          <FieldSection title="③ 部門別目標 — 自社施工" fields={[
            { key: "targetSelfSales", label: "売上目標", unit: "万円", color: "#059669" },
            { key: "targetSelfProfit", label: "粗利目標", unit: "万円", color: "#059669" },
            { key: "targetSelfCount", label: "件数目標", unit: "件", color: "#3b82f6" },
          ]} setField={setField} displayVal={displayVal} canEdit={canEdit} />

          <FieldSection title="③ 部門別目標 — 新規営業" fields={[
            { key: "targetNewSales", label: "売上目標", unit: "万円", color: "#3b82f6" },
            { key: "targetNewProfit", label: "粗利目標", unit: "万円", color: "#3b82f6" },
            { key: "targetNewCount", label: "件数目標", unit: "件", color: "#3b82f6" },
          ]} setField={setField} displayVal={displayVal} canEdit={canEdit} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <FieldSection title="④ コスト指標" fields={[
            { key: "targetAdCost", label: "広告費目標", unit: "万円", color: "#d97706" },
            { key: "targetAdRate", label: "広告費率目標", unit: "%", color: "#d97706" },
            { key: "targetLaborRate", label: "職人費率目標", unit: "%", color: "#d97706" },
            { key: "targetMaterialRate", label: "材料費率目標", unit: "%", color: "#d97706" },
          ]} setField={setField} displayVal={displayVal} canEdit={canEdit} />

          <FieldSection title="⑤ その他KPI" fields={[
            { key: "targetVehicleCount", label: "車両数", unit: "台", color: "#dc2626" },
            { key: "targetCallCount", label: "入電件数目標", unit: "件", color: "#3b82f6" },
            { key: "targetCallUnitPrice", label: "入電単価目標", unit: "円", color: "#3b82f6" },
            { key: "targetConstructionRate", label: "工事取得率目標", unit: "%", color: "#dc2626" },
            { key: "targetPassRate", label: "パス率目標", unit: "%", color: "#dc2626" },
          ]} setField={setField} displayVal={displayVal} canEdit={canEdit} />
        </div>
      </div>
    </div>
  );
}

type FieldDef = {
  key: keyof Targets;
  label: string;
  unit: string;
  color: string;
};

function FieldSection({
  title, fields, setField, displayVal, canEdit,
}: {
  title: string;
  fields: FieldDef[];
  setField: (k: keyof Targets, v: string) => void;
  displayVal: (k: keyof Targets) => string;
  canEdit: boolean;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #d1fae5", overflow: "hidden" }}>
      <div
        style={{
          background: "#ecfdf5", padding: "8px 14px", borderBottom: "1px solid #d1fae5",
          fontSize: "11px", fontWeight: 700, color: "#065f46",
          textTransform: "uppercase", letterSpacing: "0.07em",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "4px 14px 8px" }}>
        {fields.map((f) => (
          <div
            key={f.key}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 0", borderBottom: "1px solid #f5faf5",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <div style={{ width: "3px", height: "14px", borderRadius: "1px", background: f.color, flexShrink: 0 }} />
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>{f.label}</span>
              <span style={{ fontSize: "10px", color: "#9ca3af" }}>（{f.unit}）</span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              disabled={!canEdit}
              value={displayVal(f.key)}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder="0"
              style={{
                width: "130px", height: "32px",
                border: "1px solid #d1fae5", borderRadius: "6px",
                padding: "0 10px", fontSize: "12px", fontWeight: 600,
                textAlign: "right", color: "#111", background: "#fff",
                outline: "none", opacity: canEdit ? 1 : 0.6,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
