# AI設計相談コンテキスト — 会社別ビュー完成設計

> 生成日: 2026-06-13
> 用途: Gemini / Web Claude に渡して「会社別ビューの完成設計」を相談するためのコンテキストファイル。
> 機密: ソースコードのみ。実データ・DB接続情報は含まない。

---

## 1. プロジェクト概要

SIKKEN GROUP（7社の多業態コングロマリット）の経営ダッシュボード。
Next.js (App Router) / Vercel / Neon Postgres。

### 会社・業態・エリアのマスター構造

```
業態 (BusinessCategory): water / electric / locksmith / road / detective
エリア (areaId): kansai / kanto / nagoya / kyushu / kitakanto / hokkaido / chugoku / shizuoka

7社 + 未割当:
  Mavericks   : water×kansai, water×hokkaido
  TOPLEVEL    : water×nagoya, water×shizuoka
  REXIA       : water×kanto, water×kitakanto, electric×kitakanto
  DUNK        : water×kyushu, water×chugoku, road×kansai, electric×kyushu
  ULUA        : electric×kansai, electric×kanto
  GriT's      : detective×kansai, detective×nagoya
  SIKKEN Group: locksmith×kansai
  未割当      : 上記以外の全(category, area)ペア (計16ペア、自動算出)

合計: 32 (category, area) ペア
```

### ドメイン定義（粗利計算）
- **water/electric/road/detective**: 粗利 = 売上 − 職人費 − 材料費 − 広告費 − 営業外注費 − カード手数料
- **locksmith**: 粗利 = 売上 − 工事費 − 材料費 − 広告費 − 手数料（独自経路）
- **water のみ**: 2026年5月以降、手入力 `consultant_fee` をさらに控除

### 業態ごとの指標の違い

| 指標 | water | electric | locksmith | road | detective |
|---|:---:|:---:|:---:|:---:|:---:|
| 職人費 | ✅ | ✅ | ❌(工事費) | ✅ | ✅ |
| 材料費 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 広告費 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 営業外注費 | ✅ | ✅ | ❌ | ✅ | ✅ |
| カード手数料 | ✅ | ✅ | ❌(手数料) | ✅ | ✅ |
| 入電件数 | ✅ | ✅ | ✅ | ✅ | ✅ |
| HELP | ✅ | ✅ | ✅ | ❌ | ❌ |
| 分電盤件数 | ❌ | ✅ | ❌ | ❌ | ❌ |
| コンサル費 | ✅(5月〜) | ❌ | ❌ | ❌ | ❌ |

---

## 2. 現在の画面構成

### 「事業別」ビュー（既存・完成済）
```
[ナビバー] SIKKEN GROUP 経営OS | [事業別 / 会社別 切替] | 日付
[緑ヘッダー]
  業態タブ: [水道] [電気] [鍵] [ロード] [探偵]
  エリアタブ: [関西] [関東] [名古屋] ... [グループ全体]
  ヒーロー部分:
    ◀ 年月 ▶  |  エリア名
    日時点 | 月末着地予測 ¥XXX | 達成率 XX%
    CSV出力 | 残り日数
  KPIストリップ (売上/粗利/件数/客単価/広告費 の5カード)
[ボディ]
  ① 新規対応・コスト・粗利 (業態別セクション)
  ② 広告・効率指標
  ③ 車両・人員
  ④ HELP部門
  ⑤ 業態専用項目
  ※ グループ全体タブ時: 事業別クロス比較テーブル + エリア別サマリー
```

### 「会社別」ビュー（現在の状態 = 半完成）
```
[ナビバー] SIKKEN GROUP 経営OS | [事業別 / 会社別 切替] | 日付
[緑ヘッダー]
  会社タブ: [全社合計] [Mavericks] [TOPLEVEL] [REXIA] [DUNK] [ULUA] [GriT's] [SIKKEN Group] [未割当]
  ヒーロー部分:
    ◀ 年月 ▶  |  会社名 or "全社合計"
    日時点 | 月末着地予測 ¥XXX | 達成率 XXX%   ← ❌ 達成率が嘘 (後述)
    CSV出力                                    ← ❌ 間違ったデータを出力
[ボディ]
  CompanyBreakdownTable (事業×エリア内訳)      ← ✅ 正しく動いている
  ① 新規対応・コスト・粗利 セクション          ← ❌ 全項目「—」(データなし)
  ② 広告・効率指標 セクション                  ← ❌ 全項目「—」(データなし)
  ...
```

---

## 3. 現在の構造的バグ（詳細）

### バグ1: 達成率が嘘の数字になる

**原因:**
```typescript
// Dashboard.tsx L246 — 会社別ビューでは targets を fetch しない
useEffect(() => {
  if (isGroup || viewMode === "company") return;  // ← company では early return
  fetch(`/api/targets?area=${activeTab}&year=...&category=${activeBusiness}`)
    .then(j => setTargets(manToYen(j.targets)));
}, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);
```

`targets` state が直前の事業別ビューの値（特定エリアの目標）のまま残る。  
全社合計 landing ¥398M ÷ 関西エリアの目標値 = 464% という意味不明な数値が表示される。

**targets の型:**
```typescript
type Targets = {
  targetSales: number;      // 売上目標
  targetProfit: number;     // 粗利目標
  targetCount: number;      // 件数目標
  targetCpa: number;        // CPA目標
  targetConversionRate: number;
  targetAdRate: number;
  targetUnitPrice: number;
  targetCallCount: number;
  targetHelpSales: number;
  targetHelpCount: number;
}
```

**現在の目標管理:** `/targets` ページは `(area, category)` 単位で目標を設定。会社単位の目標概念は存在しない。

### バグ2: 業態別セクション（WaterDashboardSection 等）が空データで描画される

**原因:**
```typescript
// Dashboard.tsx L1237-1251
{!isGroup && activeBusiness === "locksmith" && (
  <LocksmithDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
)}
// ... 他4業態も同様
{!isGroup && activeBusiness === "water" && (
  <WaterDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
)}
```

条件が `!isGroup`（事業別のグループ全体タブか否か）だけで、  
`viewMode !== "company"` のガードがない。  

会社別ビューでも `isGroup=false` なら業態セクションが描画されるが、  
`monthlySummary` は会社別では fetch されない（L357: `viewMode === "business"` 限定）ので  
全項目 `null` → `—` になる。

### バグ3: CSV出力が事業別のエリアデータを吐く

```typescript
// Dashboard.tsx L912
const area = activeTab;  // ← 事業別の選択エリア（会社別では意味なし）
```

### バグ4: 前年同月比・過去データバッジが混入

`monthlySummary` / `yoyMonthlySummary` は事業別ビュー専用 state。  
会社別切替時にクリアされず、ヘッダーに前状態のバッジが表示される。

---

## 4. 現在正しく動いている部分

### CompanyBreakdownTable.tsx（完成済）

会社別ビューのヒーロー下に表示。全 32 (category, area) ペアを月次サマリー N並列 fetch して表形式で表示。

**列:** 事業 / エリア / 売上 / 粗利 / 対応件数 / 客単価 / 広告費 / 「事業別で編集→」ボタン  
**行数:** 全社合計=32行、通常会社=1〜4行、未割当=16行

```typescript
// CompanyBreakdownTable.tsx（抜粋）
export function getBreakdownPairs(activeCompany: string): BreakdownPair[] {
  if (activeCompany === "__all__") {
    return COMPANIES.flatMap((c) => c.areas.map((a) => ({ category: a.category, areaId: a.areaId })));
  }
  const assignments = getCompanyAssignments(activeCompany);
  return assignments.map((a) => ({ category: a.category, areaId: a.areaId }));
}
```

CompanyBreakdownTable は `monthly-summary` N並列 fetch で正しく動いており、  
**「事業別で編集→」ボタンで事業別ビューに遷移する** 設計になっている。

### companyData（ヒーロー KPI 用）

会社別ビューで fetch される集計値（売上/粗利/件数/広告費/HELP/車両数 の単純合算）。  
月末着地予測の計算には正しく使われている。

```typescript
// Dashboard.tsx L192-195
const [companyData, setCompanyData] = useState<{
  totalRevenue: number; totalProfit: number; totalCount: number; totalAdCost: number;
  helpRevenue: number; helpCount: number; vehicleCount: number;
} | null>(null);
```

---

## 5. 設計上の問いかけ

### 5-1. 会社別ビューは「何を見る画面」であるべきか？

現在の設計意図（コードコメントより）:
> 「ヒーロー KPI + CompanyBreakdownTable で全体感を掴み、詳細は『事業別で編集→』ボタンで事業別ビューへ遷移」

この設計が正しいとすると、会社別ビューには **業態別の詳細セクション（WaterDashboardSection 等）は不要**。  
CompanyBreakdownTable + ヒーローを整備するだけで完成する。

**設計案 A: CompanyBreakdownTable 完結型（シンプル）**
```
会社別ビュー = ヒーロー（正しい数字）+ CompanyBreakdownTable（拡充）
業態別セクションは会社別ビューでは非表示
詳細は「事業別で編集→」ボタン経由
```

**設計案 B: 会社内業態別セクション表示型（複雑）**
```
会社別ビュー = ヒーロー + CompanyBreakdownTable + 会社が持つ各業態のセクション
例: DUNK を選択 → water（九州+中国合算）+ road（関西）+ electric（九州）の3セクション
業態が異なるので指標の種類も違う → 業態ごとに独立したセクションとして表示
```

**設計案 C: 会社別専用サマリーセクション型（中間）**
```
会社別ビュー = ヒーロー + CompanyBreakdownTable + 新規「会社別サマリーカード」
業態をまたいで共通の指標（売上/粗利/件数/広告費）だけをカード形式で表示
業態固有の指標（分電盤件数・コンサル費等）は表示しない
```

### 5-2. 全社合計（`__all__`）の達成率をどう扱うか？

現在、目標管理は `(area, category)` 単位。会社単位の目標は存在しない。

**選択肢:**
- 達成率を「未設定」と表示してスキップ（最小変更）
- 会社単位の目標をデータベースに追加（大改修）
- 全 (area, category) ペアの目標を合算して「擬似全社目標」として扱う（精度に疑問）

### 5-3. CompanyBreakdownTable を拡充するとしたら？

現在の列: 売上 / 粗利 / 対応件数 / 客単価 / 広告費

追加候補:
- 粗利率（= 粗利 ÷ 売上）
- 広告費率（= 広告費 ÷ 売上）
- 前月比（達成率）

業態によって意味が違う列（入電件数・分電盤件数等）は共通テーブルには向かない。

---

## 6. 関連ファイル一覧

| ファイル | 役割 |
|---|---|
| `app/components/Dashboard.tsx` (1462行) | メインダッシュボード。会社別ビューの state・fetch・render を含む |
| `app/components/dashboard/CompanyBreakdownTable.tsx` | 会社別の事業×エリア内訳テーブル（完成済）|
| `app/components/WaterDashboardSection.tsx` | 水道業態の詳細メトリクスセクション |
| `app/components/ElectricDashboardSection.tsx` | 電気業態の詳細メトリクスセクション |
| `app/components/LocksmithDashboardSection.tsx` | 鍵業態の詳細メトリクスセクション |
| `app/components/RoadDashboardSection.tsx` | ロード業態の詳細メトリクスセクション |
| `app/components/DetectiveDashboardSection.tsx` | 探偵業態の詳細メトリクスセクション |
| `app/lib/businesses.ts` | 業態×エリアのマスター定義 |
| `app/lib/companies.ts` | 会社×(業態,エリア)のマッピング定義 |
| `app/lib/calculations.ts` | KPI計算ロジック（Targets型・emptyTargets等）|
| `app/api/monthly-summary/route.ts` | 月次サマリー1件取得 API |

---

## 7. Gemini / Web Claude への質問プロンプト

以下をそのままコピーして貼り付けてください:

---

### 【設計相談プロンプト】

```
あなたはNext.js (App Router)とTypeScriptの専門家です。
以下のコンテキストを読んで、設計上の判断を手伝ってください。

## 背景
SIKKENグループ（水道・電気・鍵・ロード・探偵の5業態、7社+未割当）の経営ダッシュボードです。
「事業別」ビューは完成済み。「会社別」ビューが半完成で、以下の問題があります。

## 現在の問題
1. 達成率が嘘の数字（前の事業別ビューで見ていたエリアの目標値が残って全社売上と比較されてしまう）
2. 業態別詳細セクション（WaterDashboardSection等）が会社別ビューでも描画されるが、
   データが取得されないため全項目「—」になっている
3. CSV出力が事業別エリアのデータを吐く（会社別では無意味）

## コンテキストファイル
[このファイルの全内容を添付してください]

## お願いしたいこと
以下の3つの設計案について、このプロジェクトのアーキテクチャ・規模・運用コストを考慮した上で
どの案が最も適切か、理由とともに意見をください。

**案A**: 会社別ビュー = ヒーロー（バグ修正）+ CompanyBreakdownTable のみ。業態セクションは非表示。
**案B**: 会社別ビュー = ヒーロー + CompanyBreakdownTable + 会社が持つ業態ごとの詳細セクション（業態別に独立表示）。
**案C**: 会社別ビュー = ヒーロー + CompanyBreakdownTable + 共通指標のみのサマリーカード（業態固有指標は省略）。

また、採用した案をスライス（PR単位）に分割するとしたら何ステップになるか教えてください。

回答は日本語で、実装の複雑さ・保守コスト・ユーザーの使い勝手の3軸で評価してください。
```

---

## 8. 参考: 絶対不変項目（変更禁止）

以下はどの案でも触らない:
- `AUTOSAVE_DISABLED_C89_P1 = true`（useDebouncedAutoSave.ts）
- 2026年4月以前データ（entries + monthly_summaries 133行）
- `calculations.ts` の camelCase `vehicleCount`
- c94 / c95-A / c95-B 全機能
