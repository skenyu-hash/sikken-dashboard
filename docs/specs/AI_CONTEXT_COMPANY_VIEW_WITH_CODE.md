# AI設計相談コンテキスト（コード結合版）— 会社別ビュー完成設計

> 生成日: 2026-06-13  
> 用途: Gemini / Web Claude に渡して「会社別ビューの完成設計」を相談する。コード結合済み。  
> 機密: ソースコードのみ。実データ・DB接続情報は含まない。

---

## ★ AIへの質問（最初に読んでください）

あなたはNext.js (App Router) + TypeScript の専門家です。
以下のコンテキストとソースコードを読んで、設計上の判断を手伝ってください。

### 背景
SIKKENグループ（水道・電気・鍵・ロード・探偵の5業態、7社+未割当）の経営ダッシュボードです。
「事業別」ビューは完成済みです。「会社別」ビューが半完成で、以下の問題があります。

### 現在の問題（詳細はコード内のコメントを参照）
1. **達成率が嘘の数字** — `targets` state が事業別ビューの値のまま残り、全社売上と比較されてしまう（達成率464%等）
2. **業態別セクションが空データで描画される** — `WaterDashboardSection`等が会社別ビューでも描画されるが、データが取得されないため全項目「—」
3. **CSV出力が事業別エリアのデータを吐く** — 会社別ビューでは意味のないデータが出力される
4. **前年同月比・過去データバッジが混入** — 事業別専用stateが会社別切替時にクリアされない

### 設計案を評価してほしい

**案A（シンプル）**: 会社別ビュー = ヒーロー（バグ修正）+ CompanyBreakdownTable のみ。業態別セクションは会社別では非表示にする。

**案B（複雑）**: 会社別ビュー = ヒーロー + CompanyBreakdownTable + 会社が持つ各業態のセクション（業態別に独立表示）。例：DUNKを選ぶと水道セクション・ロードセクション・電気セクションが並ぶ。

**案C（中間）**: 会社別ビュー = ヒーロー + CompanyBreakdownTable + 業態をまたいだ共通指標のみのサマリーカード（売上/粗利/件数/広告費）。業態固有の指標（分電盤件数・コンサル費等）は表示しない。

**お願いしたいこと:**
1. 3案のうちどれが最もこのアーキテクチャ・運用規模に適しているか、理由付きで意見をください
2. 採用した案をPR単位のスライスに分割すると何ステップになるか教えてください
3. バグ修正（問題1〜4）の最小変更案も教えてください

回答は日本語で、実装コスト・保守コスト・ユーザーの使い勝手の3軸で評価してください。

---

## プロジェクト概要

- スタック: Next.js (App Router) / Vercel / Neon Postgres
- 規模: 7社 × 5業態 × 8エリア = 最大32 (category, area) ペア
- ユーザー: 経営陣 + エリアマネージャー46名

### ドメイン定義（粗利計算）
- **water/electric/road/detective**: 粗利 = 売上 − 職人費 − 材料費 − 広告費 − 営業外注費 − カード手数料
- **locksmith（鍵）**: 粗利 = 売上 − 工事費 − 材料費 − 広告費 − 手数料（別経路）
- **water のみ**: 2026年5月以降、手入力 `consultant_fee` をさらに控除

### 業態ごとの指標の違い

| 指標 | water | electric | locksmith | road | detective |
|---|:---:|:---:|:---:|:---:|:---:|
| 職人費 | ✅ | ✅ | ❌(工事費) | ✅ | ✅ |
| 営業外注費 | ✅ | ✅ | ❌ | ✅ | ✅ |
| カード手数料 | ✅ | ✅ | ❌(手数料) | ✅ | ✅ |
| HELP部門 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 分電盤件数 | ❌ | ✅ | ❌ | ❌ | ❌ |
| コンサル費控除 | ✅(5月〜) | ❌ | ❌ | ❌ | ❌ |

---

## 変更禁止項目（どの案でも触らないこと）

- `AUTOSAVE_DISABLED_C89_P1 = true`（useDebouncedAutoSave.ts）
- 2026年4月以前データ（entries + monthly_summaries 133行）
- `calculations.ts` の camelCase `vehicleCount`
- c94 / c95-A / c95-B の全機能（月次集計・コンサル費控除）

---

## ソースコード

### [1] app/lib/businesses.ts — 業態×エリア マスター定義

```typescript
export type BusinessCategory = 'water' | 'electric' | 'locksmith' | 'road' | 'detective';

export const BUSINESSES: { id: BusinessCategory; label: string; areas: string[] }[] = [
  { id: 'water',     label: '水道',   areas: ['kansai','kanto','nagoya','kyushu','kitakanto','hokkaido','chugoku','shizuoka'] },
  { id: 'electric',  label: '電気',   areas: ['kansai','kanto','kitakanto','kyushu','nagoya','chugoku','hokkaido'] },
  { id: 'locksmith', label: '鍵',     areas: ['kansai','kanto','nagoya','kyushu','kitakanto','chugoku','hokkaido'] },
  { id: 'road',      label: 'ロード', areas: ['kansai','kanto','nagoya','kyushu','hokkaido'] },
  { id: 'detective', label: '探偵',   areas: ['kansai','nagoya','kanto','kyushu','hokkaido'] },
];

export const AREA_NAMES: Record<string, string> = {
  kansai: '関西', kanto: '関東', nagoya: '名古屋', kyushu: '九州',
  kitakanto: '北関東', hokkaido: '北海道', chugoku: '中国', shizuoka: '静岡',
};

export const DEFAULT_AREA_FOR_CLAMP = 'kansai';

export function getAreasForCategory(cat: BusinessCategory): string[] {
  return BUSINESSES.find((b) => b.id === cat)?.areas ?? [];
}

export function clampAreaToCategory(area: string, cat: BusinessCategory): string {
  const areas = getAreasForCategory(cat);
  if (areas.includes(area)) return area;
  if (areas.includes(DEFAULT_AREA_FOR_CLAMP)) return DEFAULT_AREA_FOR_CLAMP;
  return areas[0] ?? area;
}
```

---

### [2] app/lib/companies.ts — 会社×(業態,エリア) マッピング定義

```typescript
import type { BusinessCategory } from "./businesses";
import { BUSINESSES } from "./businesses";

export type CompanyId =
  | "sikken" | "mavericks" | "toplevel" | "rexia" | "dunk" | "ulua" | "grits" | "unassigned";

export type CompanyAreaAssignment = {
  category: BusinessCategory;
  areaId: string;
};

export type Company = {
  id: CompanyId;
  name: string;
  areas: readonly CompanyAreaAssignment[];
};

export const UNASSIGNED_COMPANY_ID: CompanyId = "unassigned";

/**
 * 7社の (category, areaId) 担当マッピング
 *   Mavericks   : water×kansai, water×hokkaido
 *   TOPLEVEL    : water×nagoya, water×shizuoka
 *   REXIA       : water×kanto, water×kitakanto, electric×kitakanto
 *   DUNK        : water×kyushu, water×chugoku, road×kansai, electric×kyushu
 *   ULUA        : electric×kansai, electric×kanto
 *   GriT's      : detective×kansai, detective×nagoya
 *   SIKKEN Group: locksmith×kansai
 */
const ASSIGNED_COMPANIES: Company[] = [
  { id: 'mavericks', name: 'Mavericks',    areas: [{ category: 'water', areaId: 'kansai' }, { category: 'water', areaId: 'hokkaido' }] },
  { id: 'toplevel',  name: 'TOPLEVEL',     areas: [{ category: 'water', areaId: 'nagoya' }, { category: 'water', areaId: 'shizuoka' }] },
  { id: 'rexia',     name: 'REXIA',        areas: [{ category: 'water', areaId: 'kanto' }, { category: 'water', areaId: 'kitakanto' }, { category: 'electric', areaId: 'kitakanto' }] },
  { id: 'dunk',      name: 'DUNK',         areas: [{ category: 'water', areaId: 'kyushu' }, { category: 'water', areaId: 'chugoku' }, { category: 'road', areaId: 'kansai' }, { category: 'electric', areaId: 'kyushu' }] },
  { id: 'ulua',      name: 'ULUA',         areas: [{ category: 'electric', areaId: 'kansai' }, { category: 'electric', areaId: 'kanto' }] },
  { id: 'grits',     name: "GriT's",       areas: [{ category: 'detective', areaId: 'kansai' }, { category: 'detective', areaId: 'nagoya' }] },
  { id: 'sikken',    name: 'SIKKEN Group', areas: [{ category: 'locksmith', areaId: 'kansai' }] },
];

function computeUnassignedAreas(): CompanyAreaAssignment[] {
  const assigned = new Set<string>();
  for (const c of ASSIGNED_COMPANIES) for (const a of c.areas) assigned.add(`${a.category}|${a.areaId}`);
  const result: CompanyAreaAssignment[] = [];
  for (const b of BUSINESSES) for (const area of b.areas) {
    if (!assigned.has(`${b.id}|${area}`)) result.push({ category: b.id, areaId: area });
  }
  return result;
}

export const COMPANIES: readonly Company[] = [
  ...ASSIGNED_COMPANIES,
  { id: UNASSIGNED_COMPANY_ID, name: '未割当', areas: computeUnassignedAreas() },
];

export function getCompany(id: string): Company | undefined {
  return COMPANIES.find((c) => c.id === id);
}

export function getCompanyAssignments(companyId: string): CompanyAreaAssignment[] {
  const company = getCompany(companyId);
  return company ? Array.from(company.areas) : [];
}

export function getCompanyCategoriesAndAreas(companyId: string): { categories: BusinessCategory[]; areas: string[] } {
  const company = getCompany(companyId);
  if (!company) return { categories: [], areas: [] };
  const cats = new Set<BusinessCategory>();
  const areas = new Set<string>();
  for (const a of company.areas) { cats.add(a.category); areas.add(a.areaId); }
  return { categories: Array.from(cats), areas: Array.from(areas) };
}
```

---

### [3] app/lib/calculations.ts — Targets型とemptyTargets（抜粋）

```typescript
// ============ 目標管理 ============
export type Targets = {
  targetSales: number;
  targetProfit: number;
  targetCount: number;
  targetCpa: number;
  targetConversionRate: number;
  targetHelpSales: number;
  targetHelpCount: number;
  targetHelpUnitPrice: number;
  targetSelfSales: number;   targetSelfProfit: number;   targetSelfCount: number;
  targetNewSales: number;    targetNewProfit: number;    targetNewCount: number;
  targetAdCost: number;      targetAdRate: number;
  targetLaborRate: number;   targetMaterialRate: number;
  targetVehicleCount: number; targetTraineeCount: number;
  targetCallCount: number;
  targetConstructionRate: number; targetPassRate: number;
  targetUnitPrice: number;   targetCallUnitPrice: number; targetHelpRate: number;
  targetMeetingCount: number;    // 探偵業態専用
  targetMeetingRate: number;     // 探偵業態専用
  targetSwitchboardCount: number; // 電気業態専用
};

export const emptyTargets = (): Targets => ({
  targetSales: 0, targetProfit: 0, targetCount: 0, targetCpa: 0, targetConversionRate: 0,
  targetHelpSales: 0, targetHelpCount: 0, targetHelpUnitPrice: 0,
  targetSelfSales: 0, targetSelfProfit: 0, targetSelfCount: 0,
  targetNewSales: 0, targetNewProfit: 0, targetNewCount: 0,
  targetAdCost: 0, targetAdRate: 0, targetLaborRate: 0, targetMaterialRate: 0,
  targetVehicleCount: 0, targetTraineeCount: 0, targetCallCount: 0,
  targetConstructionRate: 0, targetPassRate: 0,
  targetUnitPrice: 0, targetCallUnitPrice: 0, targetHelpRate: 0,
  targetMeetingCount: 0, targetMeetingRate: 0, targetSwitchboardCount: 0,
});

// 万円単位で保存されているフィールドを円に変換（表示用）
export function manToYen(targets: Targets): Targets {
  return {
    ...targets,
    targetSales: targets.targetSales * 10000,
    targetProfit: targets.targetProfit * 10000,
    targetHelpSales: targets.targetHelpSales * 10000,
    targetSelfSales: targets.targetSelfSales * 10000,
    targetSelfProfit: targets.targetSelfProfit * 10000,
    targetNewSales: targets.targetNewSales * 10000,
    targetNewProfit: targets.targetNewProfit * 10000,
    targetAdCost: targets.targetAdCost * 10000,
  };
}
```

---

### [4] app/api/monthly-summary/route.ts — 月次サマリー取得API

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area");
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const category = searchParams.get("category") ?? "water";

  const sql = getSql();
  const rows = await sql`
    SELECT * FROM monthly_summaries
    WHERE area_id = ${area} AND year = ${year} AND month = ${month}
      AND COALESCE(business_category, 'water') = ${category}
    LIMIT 1
  `;

  return NextResponse.json({ summary: rows[0] ?? null });
}
```

---

### [5] app/components/dashboard/CompanyBreakdownTable.tsx — 会社別内訳テーブル（完成済み）

```typescript
"use client";
// PR-2a (2026-06-07): 会社別ダッシュボードの事業×エリア内訳テーブル。
// 列: 事業 / エリア / 売上 / 粗利 / 対応件数 / 客単価 / 広告費 / 「事業別で編集→」ボタン
// データ取得: monthly-summary N並列fetch (ヒーローと同経路、4月以前安全)
// 「事業別で編集→」押下で viewMode=business + activeBusiness/activeTab を切替

import { useEffect, useState } from "react";
import type { BusinessCategory } from "../../lib/businesses";
import { BUSINESSES, AREA_NAMES } from "../../lib/businesses";
import { COMPANIES, getCompanyAssignments } from "../../lib/companies";
import { resolveTotalProfit } from "../../lib/profit";

function normalizeNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtYen(v: unknown): string {
  if (v == null) return "—";
  const n = normalizeNum(v);
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function fmtCount(v: unknown): string {
  if (v == null) return "—";
  const n = normalizeNum(v);
  return `${Math.round(n).toLocaleString("ja-JP")}件`;
}

function fmtUnitPrice(revenue: unknown, count: unknown): string {
  const r = normalizeNum(revenue);
  const c = normalizeNum(count);
  if (c <= 0 || r <= 0) return "—";
  return `¥${Math.round(r / c).toLocaleString("ja-JP")}`;
}

export type BreakdownPair = { category: BusinessCategory; areaId: string; };

export function getBreakdownPairs(activeCompany: string): BreakdownPair[] {
  if (activeCompany === "__all__") {
    return COMPANIES.flatMap((c) => c.areas.map((a) => ({ category: a.category, areaId: a.areaId })));
  }
  const assignments = getCompanyAssignments(activeCompany);
  return assignments.map((a) => ({ category: a.category, areaId: a.areaId }));
}

type Props = {
  activeCompany: string;
  viewYear: number;
  viewMonth: number;
  onChangeBusinessRequest: (category: BusinessCategory, areaId: string) => void;
};

export default function CompanyBreakdownTable({ activeCompany, viewYear, viewMonth, onChangeBusinessRequest }: Props) {
  const [rows, setRows] = useState<Array<{ category: BusinessCategory; areaId: string; summary: Record<string, unknown> | null; }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const pairs = getBreakdownPairs(activeCompany);
    if (pairs.length === 0) { setRows([]); setLoading(false); return; }
    Promise.all(
      pairs.map(async (p) => {
        const res = await fetch(
          `/api/monthly-summary?area=${p.areaId}&year=${viewYear}&month=${viewMonth}&category=${p.category}`,
        ).then((r) => (r.ok ? r.json() : { summary: null }));
        return { category: p.category, areaId: p.areaId, summary: res.summary };
      }),
    ).then((results) => {
      if (cancelled) return;
      setRows(results);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeCompany, viewYear, viewMonth]);

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>読み込み中...</div>;
  if (rows.length === 0) return <div style={{ padding: 20, textAlign: "center" }}>担当範囲なし</div>;

  return (
    <div style={{ margin: "16px 20px", background: "#fff", border: "1px solid #d1fae5", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ background: "#ecfdf5", padding: "8px 14px", borderBottom: "1px solid #d1fae5", fontSize: 11, fontWeight: 700, color: "#065f46" }}>
        事業 × エリア 内訳 ({viewYear}年{viewMonth}月)
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "left" }}>事業</th>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "left" }}>エリア</th>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "right" }}>売上</th>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "right" }}>粗利</th>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "right" }}>対応件数</th>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "right" }}>客単価</th>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "right" }}>広告費</th>
              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "center" }}>編集</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.summary;
              return (
                <tr key={`${r.category}::${r.areaId}`}>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{BUSINESSES.find(b => b.id === r.category)?.label ?? r.category}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{AREA_NAMES[r.areaId] ?? r.areaId}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, textAlign: "right" }}>{fmtYen(s?.total_revenue)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, textAlign: "right" }}>{s ? fmtYen(resolveTotalProfit(s)) : "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, textAlign: "right" }}>{fmtCount(s?.total_count)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, textAlign: "right" }}>{fmtUnitPrice(s?.total_revenue, s?.total_count)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, textAlign: "right" }}>{fmtYen(s?.ad_cost)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, textAlign: "center" }}>
                    <button type="button" onClick={() => onChangeBusinessRequest(r.category, r.areaId)}
                      style={{ fontSize: 10, padding: "4px 10px", borderRadius: 6, background: "#fff", border: "1px solid #1B5E3F", color: "#1B5E3F", cursor: "pointer", fontWeight: 700 }}>
                      事業別で編集 →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

### [6] app/components/Dashboard.tsx — 会社別ビュー関連部分（抜粋）

#### 6-A. state 定義（L160-210）
```typescript
const [targets, setTargets] = useState<Targets>(emptyTargets());
const [viewMode, setViewMode] = useState<"business" | "company">("business");
const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
const [activeCompany, setActiveCompany] = useState<string>("__all__");
const [activeTab, setActiveTab] = useState<string>(AREAS[0].id);  // 事業別エリアタブ

// isGroup は "事業別のグループ全体タブ" か否か。会社別ビューとは独立した概念。
const isGroup = activeTab === GROUP_TAB;

const [companyData, setCompanyData] = useState<{
  totalRevenue: number; totalProfit: number; totalCount: number; totalAdCost: number;
  helpRevenue: number; helpCount: number; vehicleCount: number;
} | null>(null);

const [monthlySummary, setMonthlySummary] = useState<Record<string, unknown> | null>(null);
const [yoyMonthlySummary, setYoyMonthlySummary] = useState<Record<string, unknown> | null>(null);
```

#### 6-B. データ取得 useEffect（L229-397）— ★バグの根本原因★

```typescript
// ★バグ1の原因: 会社別ビューでは targets を fetch しない。
// 直前に事業別ビューで取得した targets が残ったまま会社別に切り替わる。
useEffect(() => {
  if (isGroup || viewMode === "company") return;  // ← company では早期return（resetなし）
  fetch(`/api/targets?area=${activeTab}&year=${viewYear}&month=${viewMonth}&category=${activeBusiness}`)
    .then(j => setTargets(manToYen(j.targets)));
}, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

// ★バグ4の原因: monthlySummary は事業別ビュー専用。会社別では null にセットされる。
// しかしヘッダーに「過去データ」バッジを表示する条件が `{monthlySummary && ...}` のため、
// 切替直後（setState の非同期タイミング）に旧値が一瞬表示される可能性がある。
useEffect(() => {
  if (!isGroup && activeTab && viewMode === "business") {
    fetch(`/api/monthly-summary?area=${activeTab}&year=${viewYear}&month=${viewMonth}&category=${activeBusiness}`)
      .then(j => setMonthlySummary(j.summary ?? null));
  } else {
    setMonthlySummary(null);  // ← company切替時にnullはセットされる
  }
}, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

// yoyMonthlySummary も同様
useEffect(() => {
  if (!isGroup && activeTab && viewMode === "business") {
    fetch(`/api/monthly-summary?area=${activeTab}&year=${viewYear - 1}&month=${viewMonth}&category=${activeBusiness}`)
      .then(j => setYoyMonthlySummary(j.summary ?? null));
  } else {
    setYoyMonthlySummary(null);
  }
}, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

// 会社別ビューのデータ取得: companyData に売上/粗利/件数/広告費/HELP/車両数を集計
useEffect(() => {
  if (viewMode !== "company") { setCompanyData(null); return; }
  const company = COMPANIES.find(c => c.id === activeCompany);
  const pairs = company ? company.areas : COMPANIES.flatMap(c => c.areas);
  Promise.all(
    pairs.map(async ({ category, areaId }) => {
      const res = await fetch(`/api/monthly-summary?area=${areaId}&year=${viewYear}&month=${viewMonth}&category=${category}`)
        .then(r => r.ok ? r.json() : { summary: null });
      return res.summary;
    })
  ).then((summaries) => {
    const result = { totalRevenue: 0, totalProfit: 0, totalCount: 0, totalAdCost: 0, helpRevenue: 0, helpCount: 0, vehicleCount: 0 };
    for (const s of summaries) {
      if (!s) continue;
      result.totalRevenue += Number(s.total_revenue ?? 0);
      result.totalProfit += resolveTotalProfit(s);
      result.totalCount += Number(s.total_count ?? 0);
      result.totalAdCost += Number(s.ad_cost ?? 0);
      result.helpRevenue += Number(s.help_revenue ?? 0);
      result.helpCount += Number(s.help_count ?? 0);
      result.vehicleCount += Number(s.vehicle_count ?? 0);
    }
    setCompanyData(result);
  });
}, [viewMode, activeCompany, viewYear, viewMonth]);
```

#### 6-C. displaySummary（L416-440）— 会社別は companyData を使う

```typescript
const displaySummary = useMemo(() => {
  // 会社別ビュー: companyData から集計（売上/粗利/件数/広告費/HELP のみ、コスト内訳は0）
  if (viewMode === "company" && companyData) {
    const dim = getDaysInMonth(viewYear, viewMonth);
    return {
      ...summary,
      totalRevenue: companyData.totalRevenue,
      totalProfit: companyData.totalProfit,
      totalCount: companyData.totalCount,
      totalAdCost: companyData.totalAdCost,
      companyUnitPrice: companyData.totalCount > 0 ? Math.round(companyData.totalRevenue / companyData.totalCount) : 0,
      vehicleCount: companyData.vehicleCount,
      help: { revenue: companyData.helpRevenue, profit: 0, count: companyData.helpCount, unitPrice: ... },
      totalLaborCost: 0,        // ← コスト内訳は会社別では取得されていない
      totalMaterialCost: 0,     // ← 同上
      totalSalesOutsourcingCost: 0, // ← 同上
      daysElapsed: dim, daysInMonth: dim,  // ← 注意: 経過日数が月全体になっている
      grossMargin: companyData.totalRevenue > 0 ? Math.round(companyData.totalProfit / companyData.totalRevenue * 1000) / 10 : 0,
    };
  }
  // ... 事業別ビューの処理
}, [...]);
```

#### 6-D. ヒーロー表示（L871-906）— ★バグ1・4の表示箇所★

```tsx
{/* ★バグ1: targets.targetSales は事業別ビューの前の値が残っている可能性がある */}
<p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
  {viewYear}年{viewMonth}月 / {isCurrentMonth ? now.getDate() : displaySummary.daysInMonth}日時点
  ｜ 月末着地予測 {(() => {
    const forecastRevenue = isCurrentMonth && now.getDate() > 0
      ? Math.round(displaySummary.totalRevenue / now.getDate() * displaySummary.daysInMonth)
      : displaySummary.totalRevenue;
    return forecastRevenue > 0 ? yen(forecastRevenue) : "¥0";
  })()}
  ｜ 達成率{" "}
  <strong style={{ color: "#86efac" }}>
    {targets.targetSales > 0 ? (   // ← targets は事業別の古い値かもしれない
      isCurrentMonth && now.getDate() > 0
        ? Math.round(displaySummary.totalRevenue / now.getDate() * displaySummary.daysInMonth / targets.targetSales * 100)
        : Math.round(displaySummary.totalRevenue / Math.max(targets.targetSales, 1) * 100)
    ) + "%" : "未設定"}
  </strong>
  {/* ★バグ4: monthlySummary は null のはずだが切替タイミングで旧値が表示されうる */}
  {monthlySummary && <span>過去データ</span>}
  {yoyMonthlySummary && Number(yoyMonthlySummary.total_revenue ?? 0) > 0 && (() => {
    // 前年同月比バッジ — 会社別でも表示されうる
    ...
  })()}
</p>
```

#### 6-E. KPIストリップ（L986）— ★バグ2・3の境界条件★

```tsx
{/* ★バグ2の原因: !isGroup だけで判定。viewMode !== "company" のガードがない。
    会社別ビューで isGroup=false なら KPIストリップが表示され、
    stale な targets の目標値が使われる */}
{!isGroup && (() => {
  const dim = displaySummary.daysInMonth;
  const elapsed = isCurrentMonth ? now.getDate() : dim;
  const landing = (v: number) => isCurrentMonth && elapsed > 0 ? Math.round(v / elapsed * dim) : v;
  const kpis = [
    { label: "売上", val: yen(displaySummary.totalRevenue),
      targetRatio: targets.targetSales > 0 ? Math.round(displaySummary.totalRevenue / targets.targetSales * 1000) / 10 : null,
      ... },
    ...
  ];
  return <div>{/* KPIカード5枚 */}</div>;
})()}
```

#### 6-F. CSV出力（L909-957）— ★バグ3の箇所★

```tsx
<button onClick={() => {
  const area = activeTab;  // ★バグ3: 事業別のエリアタブが使われる（会社別では無意味）
  const areaName = isGroup ? "グループ全体" : (AREAS.find(a => a.id === area)?.name ?? area);
  // ... activeTab × activeBusiness の月次サマリーをCSV出力
  // 会社別ビューで「全社合計」を見ていても、直前に事業別で見ていたエリアのデータが出力される
}}>
  CSV出力
</button>
```

#### 6-G. 業態別セクション（L1237-1251）— ★バグ2の描画箇所★

```tsx
{/* ★バグ2の描画箇所:
    !isGroup のみで判定 → viewMode="company" + isGroup=false のとき描画される
    monthlySummary=null（会社別では取得されない）→ 全項目「—」 */}
{!isGroup && activeBusiness === "locksmith" && (
  <LocksmithDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
)}
{!isGroup && activeBusiness === "road" && (
  <RoadDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
)}
{!isGroup && activeBusiness === "detective" && (
  <DetectiveDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
)}
{!isGroup && activeBusiness === "electric" && (
  <ElectricDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
)}
{!isGroup && activeBusiness === "water" && (
  <WaterDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
)}

{/* 会社別ビュー: CompanyBreakdownTable — 正しく動いている */}
{viewMode === "company" && (
  <CompanyBreakdownTable
    activeCompany={activeCompany}
    viewYear={viewYear}
    viewMonth={viewMonth}
    onChangeBusinessRequest={(category, areaId) => {
      setViewMode("business");
      setActiveBusiness(category);
      setActiveTab(areaId);
    }}
  />
)}
```

---

## 現在の画面構成まとめ

```
会社別ビュー（現状）:
  [緑ヘッダー]
    会社タブ: [全社合計] [Mavericks] ... [未割当]
    ヒーロー:
      ◀ 年月 ▶ | 会社名
      月末着地予測 ¥398M | 達成率 464%  ← ❌ 嘘の数字
      CSV出力                             ← ❌ 間違ったデータ
  [ボディ]
    CompanyBreakdownTable               ← ✅ 正常（売上/粗利/件数/客単価/広告費 × 32行）
    WaterDashboardSection               ← ❌ 全項目「—」（monthlySummary=null）
    ※業態タブ(水道/電気/鍵...)の選択に応じて変わる

事業別ビュー（完成済み、参考）:
  [緑ヘッダー]
    業態タブ: [水道] [電気] [鍵] [ロード] [探偵]
    エリアタブ: [関西] [関東] ... [グループ全体]
    ヒーロー:
      月末着地予測 ¥XXX | 達成率 XX%    ← ✅ 正しい
      KPIストリップ（5カード）           ← ✅ 正しい
  [ボディ]
    WaterDashboardSection（または各業態）← ✅ 完成済み
    ① 新規対応・コスト・粗利
    ② 広告・効率指標
    ③ 車両・人員
    ④ HELP部門
    ⑤ 業態専用（分電盤件数等）
```

---

## 業態別セクション 全コード（参考実装）

以下は「事業別ビューで完成している」業態別セクションの完全なコードです。
会社別ビューで再利用するか（案B/C）、非表示にするか（案A）を判断する材料にしてください。

---

### [7] app/lib/profit.ts — 粗利計算フォールバック（完全版）

```typescript
// monthly_summaries.total_profit が 0 の legacy 行（旧集計なし）を
// 構成要素から再計算するフォールバック関数。category-aware。

type SummaryLike = {
  total_profit?: number | string | null;
  total_revenue?: number | string | null;
  business_category?: string | null;
  total_labor_cost?: number | string | null;
  material_cost?: number | string | null;
  ad_cost?: number | string | null;
  sales_outsourcing_cost?: number | string | null;
  card_processing_fee?: number | string | null;
  locksmith_construction_cost?: number | string | null;
  locksmith_commission_fee?: number | string | null;
  year?: number | string | null;
  month?: number | string | null;
  consultant_fee?: number | string | null; // water 手入力コンサル費（c95-D-5）
};

import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM, toYyyyMm } from "./consultantFee";

const numOf = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * monthly_summaries 行から total_profit を解決する。
 * total_profit=0 の legacy 行は構成要素から再計算するフォールバック付き。
 */
export function resolveTotalProfit(summary: SummaryLike | null | undefined): number {
  if (!summary) return 0;
  const dbProfit = numOf(summary.total_profit);
  if (dbProfit > 0) return dbProfit;
  const revenue = numOf(summary.total_revenue);
  if (revenue <= 0) return 0;
  const category = typeof summary.business_category === "string" ? summary.business_category : "water";
  let derived: number;
  if (category === "locksmith") {
    derived = revenue
      - numOf(summary.locksmith_construction_cost)
      - numOf(summary.material_cost)
      - numOf(summary.ad_cost)
      - numOf(summary.locksmith_commission_fee);
  } else {
    // water / electric / road / detective
    derived = revenue
      - numOf(summary.total_labor_cost)
      - numOf(summary.material_cost)
      - numOf(summary.ad_cost)
      - numOf(summary.sales_outsourcing_cost)
      - numOf(summary.card_processing_fee);
  }
  // water + 2026/5 以降: 手入力コンサル費を末尾控除
  if (category === "water") {
    const yyyymm = toYyyyMm(numOf(summary.year), numOf(summary.month));
    if (yyyymm >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM) {
      derived -= numOf(summary.consultant_fee);
    }
  }
  return Math.max(0, Math.round(derived));
}
```

---

### [8] app/components/WaterDashboardSection.tsx — 水道業態セクション（完全版）

```typescript
"use client";
// 構成: ①新規対応・コスト・粗利(7行) ②広告・効率指標(8行) ③施工(6行) ④HELP(4行)
//       ⑤水道専用(4行: 対応率/リピート/再訪問/口コミ) ⑥体制(2行: 車両数/研修生)
// Props: { monthlySummary, targets, prevCalc }
// 粗利: resolveTotalProfit(monthlySummary) — DB値 > 0 ならDB値採用、0なら構成要素から再計算

import React from "react";
import { yen, momLabel, type Targets, type SameDayAggregate } from "../lib/calculations";
import { resolveTotalProfit } from "../lib/profit";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";
import { SECTION } from "./sectionStyles";
import ConsultantFeeBadge from "./ConsultantFeeBadge";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
  prevCalc: SameDayAggregate | null;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function WaterDashboardSection({ monthlySummary, targets, prevCalc }: Props) {
  const p = prevCalc;
  const sales = numOf(monthlySummary?.total_revenue);
  const laborCost = numOf(monthlySummary?.total_labor_cost);
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.sales_outsourcing_cost);
  const cardFee = numOf(monthlySummary?.card_processing_fee);
  const profit = resolveTotalProfit(monthlySummary);

  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const totalCount = numOf(monthlySummary?.total_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;
  const adRate = safeDiv(adCost, sales) * 100;
  const unitPrice = Math.round(safeDiv(sales, totalCount));

  const constructionCount = numOf(monthlySummary?.construction_count);
  const internalConstructionCount = numOf(monthlySummary?.internal_construction_count);
  const constructionRate = safeDiv(constructionCount, totalCount) * 100;
  const internalConstructionRatio = safeDiv(internalConstructionCount, constructionCount) * 100;
  const outsourcedConstructionCost = numOf(monthlySummary?.outsourced_construction_cost);
  const internalConstructionProfit = numOf(monthlySummary?.internal_construction_profit);

  const helpRevenue = numOf(monthlySummary?.help_revenue);
  const helpCount = numOf(monthlySummary?.help_count);
  const helpUnitPrice = Math.round(safeDiv(helpRevenue, helpCount));
  const helpRate = safeDiv(helpRevenue, sales) * 100;

  const responseRate = safeDiv(totalCount, callCount) * 100;
  const repeatCount = numOf(monthlySummary?.repeat_count);
  const revisitCount = numOf(monthlySummary?.revisit_count);
  const reviewCount = numOf(monthlySummary?.review_count);
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  const targetSales = numOf(targets.targetSales);
  const targetProfit = numOf(targets.targetProfit);
  const targetCount = numOf(targets.targetCount);
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetAdRate = numOf(targets.targetAdRate);
  const targetCallCount = numOf(targets.targetCallCount);
  const targetCpa = numOf(targets.targetCpa);
  const targetConstructionRate = numOf(targets.targetConstructionRate);
  const targetConvRate = numOf(targets.targetConversionRate);
  const targetHelpSales = numOf(targets.targetHelpSales);
  const targetHelpCount = numOf(targets.targetHelpCount);
  const targetHelpUnitPrice = numOf(targets.targetHelpUnitPrice);
  const targetHelpRate = numOf(targets.targetHelpRate);
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  return (
    <section style={{ marginBottom: SECTION.MARGIN }}>
      <div style={{ marginBottom: SECTION.GAP }}>
        <ConsultantFeeBadge category="water" year={monthlySummary?.year as number | string | null | undefined} month={monthlySummary?.month as number | string | null | undefined} />
      </div>
      <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
        {/* ① 新規対応・コスト・粗利 */}
        <Card title="① 新規対応・コスト・粗利" group="rev">
          <Row label="売上"         actual={fmtYen(sales)}        target={fmtYen(targetSales)}  achievement={achv(sales, targetSales)}
            mom={momLabel(sales, p?.total_revenue ?? 0, "yen")} />
          <Row label="職人費"       actual={fmtYen(laborCost)}    target="—" sub={`売上比 ${fmtPct(ratio(laborCost))}`}
            mom={momLabel(laborCost, p?.total_labor_cost ?? 0, "yen")} momInvert />
          <Row label="材料費"       actual={fmtYen(materialCost)} target="—" sub={`売上比 ${fmtPct(ratio(materialCost))}`}
            mom={momLabel(materialCost, p?.material_cost ?? 0, "yen")} momInvert />
          <Row label="広告費"       actual={fmtYen(adCost)}       target={fmtYen(targetAdCost)} achievement={achv(adCost, targetAdCost, true)} sub={`売上比 ${fmtPct(ratio(adCost))}`}
            mom={momLabel(adCost, p?.ad_cost ?? 0, "yen")} momInvert />
          <Row label="営業外注費"   actual={fmtYen(commission)}   target="—" sub={`売上比 ${fmtPct(ratio(commission))}`}
            mom={momLabel(commission, p?.sales_outsourcing_cost ?? 0, "yen")} momInvert />
          <Row label="カード手数料" actual={fmtYen(cardFee)}      target="—" sub={`売上比 ${fmtPct(ratio(cardFee))}`}
            mom={momLabel(cardFee, p?.card_processing_fee ?? 0, "yen")} momInvert />
          <Row label="粗利"         actual={fmtYen(profit)}       target={fmtYen(targetProfit)} achievement={achv(profit, targetProfit)} highlight
            mom={momLabel(profit, p?.total_profit ?? 0, "yen")} />
        </Card>

        {/* ② 広告・効率指標 */}
        <Card title="② 広告・効率指標" group="acq">
          <Row label="広告費率"  actual={fmtPct(adRate)}             target={fmtPct(targetAdRate)}     achievement={achv(adRate, targetAdRate, true)}
            mom={momLabel(adRate, p ? safeDiv(p.ad_cost, p.total_revenue) * 100 : 0, "pct")} momInvert />
          <Row label="入電件数"  actual={fmtCount(callCount)}        target={fmtCount(targetCallCount)} achievement={achv(callCount, targetCallCount)}
            mom={momLabel(callCount, p?.call_count ?? 0, "count")} />
          <Row label="入電単価"  actual={fmtYen(callUnitPrice)}      target="—" sub="= 広告費 ÷ 入電件数"
            mom={momLabel(callUnitPrice, p ? Math.round(safeDiv(p.ad_cost, p.call_count)) : 0, "yen")} momInvert />
          <Row label="獲得件数"  actual={fmtCount(acquisitionCount)} target={fmtCount(targetCount)}    achievement={achv(acquisitionCount, targetCount)}
            mom={momLabel(acquisitionCount, p?.acquisition_count ?? 0, "count")} />
          <Row label="CPA"       actual={fmtYen(cpa)}                target={fmtYen(targetCpa)}        achievement={achv(cpa, targetCpa, true)} sub="= 広告費 ÷ 獲得件数"
            mom={momLabel(cpa, p ? Math.round(safeDiv(p.ad_cost, p.acquisition_count)) : 0, "yen")} momInvert />
          <Row label="成約率"    actual={fmtPct(convRate)}           target={fmtPct(targetConvRate)}   achievement={achv(convRate, targetConvRate)} sub="= 獲得件数 ÷ 入電件数"
            mom={momLabel(convRate, p ? safeDiv(p.acquisition_count, p.call_count) * 100 : 0, "pct")} />
          <Row label="客単価"    actual={fmtYen(unitPrice)}          target={fmtYen(targetUnitPrice)}  achievement={achv(unitPrice, targetUnitPrice)} sub="= 売上 ÷ 対応件数"
            mom={momLabel(unitPrice, p ? Math.round(safeDiv(p.total_revenue, p.total_count)) : 0, "yen")} />
          <Row label="対応件数"  actual={fmtCount(totalCount)}       target={fmtCount(targetCount)}    achievement={achv(totalCount, targetCount)}
            mom={momLabel(totalCount, p?.total_count ?? 0, "count")} />
        </Card>

        {/* ③ 施工 */}
        <Card title="③ 施工" group="cnt">
          <Row label="工事件数"     actual={fmtCount(constructionCount)}         target="—"
            mom={momLabel(constructionCount, p?.construction_count ?? 0, "count")} />
          <Row label="自社工事件数" actual={fmtCount(internalConstructionCount)} target="—"
            mom={momLabel(internalConstructionCount, p?.internal_construction_count ?? 0, "count")} />
          <Row label="自社工事比率" actual={fmtPct(internalConstructionRatio)}   target="—" sub="= 自社工事件数 ÷ 工事件数 × 100"
            mom={momLabel(internalConstructionRatio, p ? safeDiv(p.internal_construction_count, p.construction_count) * 100 : 0, "pct")} />
          <Row label="工事取得率"   actual={fmtPct(constructionRate)}            target={fmtPct(targetConstructionRate)} achievement={achv(constructionRate, targetConstructionRate)} sub="= 工事件数 ÷ 対応件数"
            mom={momLabel(constructionRate, p ? safeDiv(p.construction_count, p.total_count) * 100 : 0, "pct")} />
          <Row label="外注工事費"   actual={fmtYen(outsourcedConstructionCost)}  target="—"
            mom={momLabel(outsourcedConstructionCost, p?.outsourced_construction_cost ?? 0, "yen")} momInvert />
          <Row label="自社工事利益" actual={fmtYen(internalConstructionProfit)}  target="—"
            mom={momLabel(internalConstructionProfit, p?.internal_construction_profit ?? 0, "yen")} />
        </Card>

        {/* ④ HELP */}
        <Card title="④ HELP 部門" group="help">
          <Row label="HELP 売上"   actual={fmtYen(helpRevenue)}   target={fmtYen(targetHelpSales)}    achievement={achv(helpRevenue, targetHelpSales)}
            mom={momLabel(helpRevenue, p?.help_revenue ?? 0, "yen")} />
          <Row label="HELP 件数"   actual={fmtCount(helpCount)}   target={fmtCount(targetHelpCount)}  achievement={achv(helpCount, targetHelpCount)}
            mom={momLabel(helpCount, p?.help_count ?? 0, "count")} />
          <Row label="HELP 客単価" actual={fmtYen(helpUnitPrice)} target={fmtYen(targetHelpUnitPrice)} achievement={achv(helpUnitPrice, targetHelpUnitPrice)} sub="= HELP売上 ÷ HELP件数"
            mom={momLabel(helpUnitPrice, p ? Math.round(safeDiv(p.help_revenue, p.help_count)) : 0, "yen")} />
          <Row label="HELP 率"     actual={fmtPct(helpRate)}      target={fmtPct(targetHelpRate)}      achievement={achv(helpRate, targetHelpRate)} sub="= HELP売上 ÷ 売上 × 100"
            mom={momLabel(helpRate, p ? safeDiv(p.help_revenue, p.total_revenue) * 100 : 0, "pct")} />
        </Card>

        {/* ⑤ 水道専用 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="⑤ 水道専用" group="cnt">
            <Row label="対応率"       actual={fmtPct(responseRate)}    target="—" sub="= 対応件数 ÷ 入電件数 × 100"
              mom={momLabel(responseRate, p ? safeDiv(p.total_count, p.call_count) * 100 : 0, "pct")} />
            <Row label="リピート件数" actual={fmtCount(repeatCount)}   target="—"
              mom={momLabel(repeatCount, p?.repeat_count ?? 0, "count")} />
            <Row label="再訪問件数"   actual={fmtCount(revisitCount)}  target="—"
              mom={momLabel(revisitCount, p?.revisit_count ?? 0, "count")} />
            <Row label="口コミ件数"   actual={fmtCount(reviewCount)}   target="—"
              mom={momLabel(reviewCount, p?.review_count ?? 0, "count")} />
          </Card>
        </div>

        {/* ⑥ 体制 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="⑥ 体制" group="cnt">
            <Row label="車両数"           actual={vehicleCount > 0 ? `${vehicleCount}台` : "—"} target={targetVehicleCount > 0 ? `${targetVehicleCount}台` : "—"} achievement={achv(vehicleCount, targetVehicleCount)} />
            <Row label="研修生（営業マン）" actual={traineeCount > 0 ? `${traineeCount}人` : "—"} target={targetTraineeCount > 0 ? `${targetTraineeCount}人` : "—"} achievement={achv(traineeCount, targetTraineeCount)} />
          </Card>
        </div>
      </div>
    </section>
  );
}

// ===== UI 部品 =====
function Card({ title, group, children }: { title: string; group: GroupType; children: React.ReactNode }) {
  const childrenWithGroup = React.Children.map(children, (child) =>
    React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<{ group?: GroupType }>, { group }) : child
  );
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
      <div style={{ background: "#ecfdf5", padding: `8px ${SECTION.PADDING_H}px`, borderBottom: "1px solid #d1fae5", fontSize: SECTION.HEADER_FONT_SIZE, fontWeight: SECTION.HEADER_FONT_WEIGHT, color: SECTION.HEADER_COLOR }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup><col style={{ width: "34%" }} /><col style={{ width: "16%" }} /><col style={{ width: "14%" }} /><col style={{ width: "14%" }} /><col style={{ width: "22%" }} /></colgroup>
        <thead><tr style={{ background: "#fafffe" }}>{["指標","実績","目標","達成率","前月同日比"].map((h,i)=><th key={h} style={{ padding:`7px ${SECTION.PADDING_H}px`,fontSize:10,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid #d1fae5",textAlign:i===0?"left":"right",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
        <tbody>{childrenWithGroup}</tbody>
      </table>
    </div>
  );
}

function Row({ label, actual, target, achievement, sub, highlight, group, mom, momInvert }:
  { label:string; actual:string; target:string; achievement?:{pct:number;status:"good"|"warn"|"bad"}|null; sub?:string; highlight?:boolean; group?:GroupType; mom?:string|null; momInvert?:boolean }) {
  const td: React.CSSProperties = { padding:`9px ${SECTION.PADDING_H}px`,fontSize:12,color:"#374151",borderBottom:"1px solid #f5faf5",whiteSpace:"nowrap" };
  const bg = highlight ? "#f0fdf4" : "transparent";
  const borderColor = group ? getGroupBorderColor(group) : "transparent";
  const momColor = mom ? (() => { let up:boolean; if(mom.includes("→")){const parts=mom.split("→");up=parseFloat(parts[1])>=parseFloat(parts[0]);}else{up=mom.startsWith("+");} return (momInvert?!up:up)?"#059669":"#dc2626"; })() : "#9ca3af";
  return (
    <tr style={{ background: bg }}>
      <td style={{ ...td,textAlign:"left",fontWeight:highlight?800:700,color:highlight?"#065f46":"#111",borderLeft:`3px solid ${borderColor}` }}>
        <div style={{ whiteSpace:"nowrap" }}>{label}</div>
        {sub && <div style={{ fontSize:10,color:"#9ca3af",fontWeight:400,whiteSpace:"normal",lineHeight:1.4,marginTop:2 }}>{sub}</div>}
      </td>
      <td style={{ ...td,textAlign:"right",fontWeight:700,color:highlight?"#065f46":"#111" }}>{actual}</td>
      <td style={{ ...td,textAlign:"right",color:"#6b7280" }}>{target}</td>
      <td style={{ ...td,textAlign:"right" }}>{achievement ? <MetricBadge color={achievement.status==="good"?"green":achievement.status==="warn"?"yellow":"red"} minWidth={false}>{achievement.pct.toFixed(1)}%</MetricBadge> : <span style={{ color:"#d1d5db" }}>—</span>}</td>
      <td style={{ ...td,textAlign:"right" }}>{mom ? <span style={{ fontSize:11,fontWeight:700,color:momColor }}>{mom}</span> : <span style={{ color:"#d1d5db" }}>—</span>}</td>
    </tr>
  );
}

function achv(actual: number, target: number, invert = false): { pct: number; status: "good" | "warn" | "bad" } | null {
  if (target <= 0 || actual <= 0) return null;
  const pct = (actual / target) * 100;
  let status: "good" | "warn" | "bad";
  if (invert) { status = pct <= 100 ? "good" : pct <= 120 ? "warn" : "bad"; }
  else { status = pct >= 100 ? "good" : pct >= 80 ? "warn" : "bad"; }
  return { pct, status };
}
```

---

### [9] app/components/ElectricDashboardSection.tsx — 電気業態セクション（完全版）

```typescript
"use client";
// 構成: ①新規対応・コスト・粗利(7行) ②広告・効率指標(8行) ③施工(6行) ④HELP(4行)
//       ⑤電気専用(1行: 分電盤件数) ⑥体制(2行)
// 水道と同じ粗利式（職人費/材料費/広告費/営業外注費/カード手数料）
// 電気専用追加列: switchboard_count (分電盤件数)

import React from "react";
import { yen, momLabel, type Targets, type SameDayAggregate } from "../lib/calculations";
import { resolveTotalProfit } from "../lib/profit";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";
import { SECTION } from "./sectionStyles";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
  prevCalc: SameDayAggregate | null;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function ElectricDashboardSection({ monthlySummary, targets, prevCalc }: Props) {
  const p = prevCalc;
  const sales = numOf(monthlySummary?.total_revenue);
  const laborCost = numOf(monthlySummary?.total_labor_cost);
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.sales_outsourcing_cost);
  const cardFee = numOf(monthlySummary?.card_processing_fee);
  const profit = resolveTotalProfit(monthlySummary);

  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const totalCount = numOf(monthlySummary?.total_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;
  const adRate = safeDiv(adCost, sales) * 100;
  const unitPrice = Math.round(safeDiv(sales, totalCount));

  const constructionCount = numOf(monthlySummary?.construction_count);
  const internalConstructionCount = numOf(monthlySummary?.internal_construction_count);
  const constructionRate = safeDiv(constructionCount, totalCount) * 100;
  const internalConstructionRatio = safeDiv(internalConstructionCount, constructionCount) * 100;
  const outsourcedConstructionCost = numOf(monthlySummary?.outsourced_construction_cost);
  const internalConstructionProfit = numOf(monthlySummary?.internal_construction_profit);

  const helpRevenue = numOf(monthlySummary?.help_revenue);
  const helpCount = numOf(monthlySummary?.help_count);
  const helpUnitPrice = Math.round(safeDiv(helpRevenue, helpCount));
  const helpRate = safeDiv(helpRevenue, sales) * 100;

  const switchboardCount = numOf(monthlySummary?.switchboard_count); // ⑤電気専用

  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  const targetSales = numOf(targets.targetSales);
  const targetProfit = numOf(targets.targetProfit);
  const targetCount = numOf(targets.targetCount);
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetAdRate = numOf(targets.targetAdRate);
  const targetCallCount = numOf(targets.targetCallCount);
  const targetCpa = numOf(targets.targetCpa);
  const targetConstructionRate = numOf(targets.targetConstructionRate);
  const targetConvRate = numOf(targets.targetConversionRate);
  const targetHelpSales = numOf(targets.targetHelpSales);
  const targetHelpCount = numOf(targets.targetHelpCount);
  const targetHelpUnitPrice = numOf(targets.targetHelpUnitPrice);
  const targetHelpRate = numOf(targets.targetHelpRate);
  const targetSwitchboardCount = numOf(targets.targetSwitchboardCount); // ⑤電気専用
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  // JSX は WaterDashboardSection と同構造。⑤ のみ異なる（分電盤件数 1 行）。
  // 省略: ①②③④⑥ は Water と完全同パターン、⑤ だけ以下:
  // <Card title="⑤ 電気専用" group="cnt">
  //   <Row label="分電盤件数" actual={fmtCount(switchboardCount)} target={fmtCount(targetSwitchboardCount)}
  //     achievement={achv(switchboardCount, targetSwitchboardCount)} highlight
  //     mom={momLabel(switchboardCount, p?.switchboard_count ?? 0, "count")} />
  // </Card>
  return <section>{/* ①〜⑥ Water と同パターン、⑤のみ分電盤件数 */}</section>;
}
// achv / Card / Row は Water と完全同実装
```

---

### [10] app/components/LocksmithDashboardSection.tsx — 鍵業態セクション（完全版）

```typescript
"use client";
// 構成: ①新規対応(売上/工事費/材料費/広告費/手数料/粗利) ②入電(4行)
//       ③獲得(5内訳+総獲得/客単価/CPA/成約率) ④HELP(4行) ⑥体制(2行)
// 粗利式: 売上 - 工事費 - 材料費 - 広告費 - 手数料（water と異なる！）
// DB列: locksmith_construction_cost / locksmith_commission_fee （専用列）
// ③施工セクション（水道・電気の③）は鍵には存在しない

import React from "react";
import { yen, momLabel, type Targets, type SameDayAggregate } from "../lib/calculations";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";
import { SECTION } from "./sectionStyles";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
  prevCalc: SameDayAggregate | null;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function LocksmithDashboardSection({ monthlySummary, targets, prevCalc }: Props) {
  const p = prevCalc;
  const sales = numOf(monthlySummary?.total_revenue);
  const constructionCost = numOf(monthlySummary?.locksmith_construction_cost); // 専用列
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.locksmith_commission_fee); // 専用列
  const profit = sales - constructionCost - materialCost - adCost - commission; // water と別式

  const callCount = numOf(monthlySummary?.call_count);
  // 獲得 5 内訳
  const acqLpMail = numOf(monthlySummary?.locksmith_car_lp_email_count);
  const acqInhouse = numOf(monthlySummary?.locksmith_inhouse_count);
  const acqRepeat = numOf(monthlySummary?.locksmith_repeat_count);
  const acqRevisit = numOf(monthlySummary?.locksmith_revisit_count);
  const acqHelp = numOf(monthlySummary?.help_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;

  const helpRevenue = numOf(monthlySummary?.help_revenue);
  const helpCount = numOf(monthlySummary?.help_count);
  const helpUnitPrice = Math.round(safeDiv(helpRevenue, helpCount));
  const helpRate = safeDiv(helpRevenue, sales) * 100;

  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  const targetSales = numOf(targets.targetSales);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetCount = numOf(targets.targetCount);
  const targetHelpSales = numOf(targets.targetHelpSales);
  const targetHelpCount = numOf(targets.targetHelpCount);
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetCpa = numOf(targets.targetCpa);
  const targetConvRate = numOf(targets.targetConversionRate);
  const targetCallCount = numOf(targets.targetCallCount);
  const targetHelpUnitPrice = numOf(targets.targetHelpUnitPrice);
  const targetHelpRate = numOf(targets.targetHelpRate);
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  // セクション構成（簡略表示）:
  // ① Card "① 新規対応": 売上/工事費/材料費/広告費/手数料/粗利
  // ② Card "② 入電": 車LP+メール入電(—)/インハウス入電(—)/総入電件数/入電単価
  // ③ Card "③ 獲得(5内訳)": 車LP/インハウス/リピート/再訪問/HELP/総獲得/客単価/CPA/成約率
  // ④ Card "④ HELP": HELP売上/HELP件数/HELP客単価/HELP率
  // ⑥ Card "⑥ 体制": 車両数/研修生
  // ※ ③施工 セクションは鍵には存在しない

  return <section>{/* ①②③④⑥ */}</section>;
}
// Card / Row / achv は Water と完全同実装
```

---

### [11] app/components/RoadDashboardSection.tsx — ロード業態セクション（完全版）

```typescript
"use client";
// 構成: ①新規対応(売上/保険売上/無保険売上/広告費/手数料/販管費/粗利)
//       ②入電(7内訳+総入電/入電単価) ③獲得(7内訳+総獲得/客単価/CPA/成約率) ⑥体制
// 粗利式: 売上 - 広告費 - 手数料（販管費は記録のみ、粗利式に含めない）
// HELP セクションなし（ロード・探偵は HELP 非対応）
// 売上 2 分割: road_insurance_revenue / road_non_insurance_revenue
// 入電 7 内訳: road_ad_call_count / road_repeat_call_count / road_referral_call_count /
//             road_revisit_call_count / road_wellnest_call_count / road_seo_call_count / road_insurance_call_count
// 獲得 7 内訳: road_ad_count / road_repeat_count / road_referral_count /
//             road_revisit_count / road_wellnest_count / road_seo_count / road_insurance_count

import React from "react";
import { yen, momLabel, type Targets, type SameDayAggregate } from "../lib/calculations";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";
import { SECTION } from "./sectionStyles";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
  prevCalc: SameDayAggregate | null;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function RoadDashboardSection({ monthlySummary, targets, prevCalc }: Props) {
  const p = prevCalc;
  const sales = numOf(monthlySummary?.total_revenue);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.sales_outsourcing_cost);
  const profit = sales - adCost - commission; // 販管費は含めない

  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;

  // 獲得 7 内訳
  const acqAd = numOf(monthlySummary?.road_ad_count);
  const acqRepeat = numOf(monthlySummary?.road_repeat_count);
  const acqReferral = numOf(monthlySummary?.road_referral_count);
  const acqRevisit = numOf(monthlySummary?.road_revisit_count);
  const acqWellnest = numOf(monthlySummary?.road_wellnest_count);
  const acqSeo = numOf(monthlySummary?.road_seo_count);
  const acqInsurance = numOf(monthlySummary?.road_insurance_count);

  // 入電 7 内訳
  const callAd = numOf(monthlySummary?.road_ad_call_count);
  const callRepeat = numOf(monthlySummary?.road_repeat_call_count);
  const callReferral = numOf(monthlySummary?.road_referral_call_count);
  const callRevisit = numOf(monthlySummary?.road_revisit_call_count);
  const callWellnest = numOf(monthlySummary?.road_wellnest_call_count);
  const callSeo = numOf(monthlySummary?.road_seo_call_count);
  const callInsurance = numOf(monthlySummary?.road_insurance_call_count);
  const insuranceRevenue = numOf(monthlySummary?.road_insurance_revenue);
  const nonInsuranceRevenue = numOf(monthlySummary?.road_non_insurance_revenue);
  const sellingAdminCost = numOf(monthlySummary?.road_selling_admin_cost);

  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  const targetSales = numOf(targets.targetSales);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetCount = numOf(targets.targetCount);
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetCpa = numOf(targets.targetCpa);
  const targetConvRate = numOf(targets.targetConversionRate);
  const targetCallCount = numOf(targets.targetCallCount);
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  // セクション構成:
  // ① Card "① 新規対応": 売上/保険売上/無保険売上/広告費/手数料/販管費(記録のみ)/粗利
  // ② Card "② 入電(7内訳)": 広告/リピート/紹介/再訪問/ウェルネスト/SEO/保険会社/総入電/入電単価
  // ③ Card "③ 獲得(7内訳)": 上記同7種+総獲得/客単価/CPA/成約率 (full-width)
  // ⑥ Card "⑥ 体制": 車両数/研修生
  // ※ HELP セクション（④）はロードに存在しない

  return <section>{/* ①②③⑥ */}</section>;
}
// Card / Row / achv は Water と完全同実装
```

---

### [12] app/components/DetectiveDashboardSection.tsx — 探偵業態セクション（完全版）

```typescript
"use client";
// 構成: ①新規対応(売上/広告費/販管費/営業利益) ②入電(4内訳+総入電/入電単価)
//       ③獲得(6内訳+合計/客単価/CPA) ④面談プロセス(探偵専用ファネル) ⑥体制
// 粗利式: 売上 - 広告費（探偵は最もシンプル）
// ④面談プロセス（探偵専用）:
//   アポ獲得率 / 面談事前キャンセル数 / キャンセル率 / 面談数 / 面談率 / 成約件数 / 成約率
// HELP セクションなし

import React from "react";
import { yen, momLabel, type Targets, type SameDayAggregate } from "../lib/calculations";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";
import { SECTION } from "./sectionStyles";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
  prevCalc: SameDayAggregate | null;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function DetectiveDashboardSection({ monthlySummary, targets, prevCalc }: Props) {
  const p = prevCalc;
  const sales = numOf(monthlySummary?.total_revenue);
  const adCost = numOf(monthlySummary?.ad_cost);
  const profit = sales - adCost; // 探偵: 売上 - 広告費 = 営業利益（最もシンプル）

  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count); // = アポ獲得数
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));

  // 入電 4 内訳
  const phoneOnlyCount = numOf(monthlySummary?.detective_phone_only_call_count);
  const mailOnlyCount = numOf(monthlySummary?.detective_mail_only_call_count);
  const lineOnlyCount = numOf(monthlySummary?.detective_line_only_call_count);
  const wrongCount = numOf(monthlySummary?.detective_wrong_call_count);

  // 獲得 6 内訳
  const acqPhoneUwaki = numOf(monthlySummary?.detective_phone_uwaki_acquisition_count);
  const acqPhoneOther = numOf(monthlySummary?.detective_phone_other_acquisition_count);
  const acqMailUwaki = numOf(monthlySummary?.detective_mail_uwaki_acquisition_count);
  const acqMailOther = numOf(monthlySummary?.detective_mail_other_acquisition_count);
  const acqLineUwaki = numOf(monthlySummary?.detective_line_uwaki_acquisition_count);
  const acqLineOther = numOf(monthlySummary?.detective_line_other_acquisition_count);
  const sellingAdminCost = numOf(monthlySummary?.detective_selling_admin_cost);

  // 面談ファネル（④ 探偵専用）
  const meetingCount = numOf(monthlySummary?.detective_meeting_count);
  const cancelCount = numOf(monthlySummary?.detective_cancel_count);
  const closeCount = numOf(monthlySummary?.total_count); // 成約件数

  const appointmentRate = safeDiv(acquisitionCount, callCount) * 100;
  const cancelRate = safeDiv(cancelCount, acquisitionCount) * 100;
  const meetingRate = safeDiv(meetingCount, acquisitionCount) * 100;
  const closeRate = safeDiv(closeCount, meetingCount) * 100;

  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  const targetSales = numOf(targets.targetSales);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetCount = numOf(targets.targetCount); // 成約件数目標
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetCpa = numOf(targets.targetCpa);
  const targetConvRate = numOf(targets.targetConversionRate); // アポ獲得率目標として流用
  const targetCallCount = numOf(targets.targetCallCount);
  const targetMeetingCount = numOf(targets.targetMeetingCount); // 探偵専用
  const targetMeetingRate = numOf(targets.targetMeetingRate);   // 探偵専用
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  // セクション構成:
  // ① Card "① 新規対応": 売上/広告費/販管費(記録のみ)/営業利益
  // ② Card "② 入電": 電のみ/メールのみ/LINEのみ/間違い/入電数/入電単価
  // ③ Card "③ 獲得(6内訳)": 電話×浮気/電話×その他/メール×浮気/メール×その他/LINE×浮気/LINE×その他/合計/客単価/CPA
  // ④ Card "④ 面談プロセス(探偵専用ファネル)":
  //   アポ獲得率/面談事前キャンセル数/キャンセル率/面談数/面談率/成約件数/成約率
  // ⑥ Card "⑥ 体制": 車両数/研修生
  // ※ HELP セクション（④→⑤）はロードと同様に探偵には存在しない

  return <section>{/* ①②③④⑥ */}</section>;
}
// Card / Row / achv は Water と完全同実装
```

---

## まとめ: 5業態の粗利計算式の違い（重要）

| 業態 | 粗利式 | 特殊事項 |
|---|---|---|
| water (水道) | 売上 − 職人費 − 材料費 − 広告費 − 営業外注費 − カード手数料 [− consultant_fee※] | ※2026/5〜のみ手入力控除 |
| electric (電気) | 売上 − 職人費 − 材料費 − 広告費 − 営業外注費 − カード手数料 | 分電盤件数追加 |
| locksmith (鍵) | 売上 − **工事費** − 材料費 − 広告費 − **手数料** | 専用DB列使用 |
| road (ロード) | 売上 − 広告費 − 手数料 | 販管費は記録のみ。HELPなし |
| detective (探偵) | 売上 − 広告費 | 最もシンプル。HELPなし。面談ファネルあり |

会社別ビュー(案B)で業態別セクションを並列表示する場合、
**同じ会社に複数業態がある（DUNK=water+road+electric）場合の扱いが最も重要な設計決定です。**
各業態セクションに渡す `monthlySummary` をどうやって取得・区別するか（今の companyData は全社合算のため業態別に分離されていない）を中心に設計してください。
