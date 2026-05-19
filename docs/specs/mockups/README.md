# UI Mockups (PR #59 〜 #63 リファレンス)

このディレクトリには UI 改修の確定モックアップ HTML を配置する。
Claude Code はこれらの HTML を直接見るのではなく、各 PR の指示文 (markdown) を見て実装する。
人間のレビュー時に視覚確認するための参照資料。

## ファイル

- (準備中) `dashboard_v9.html` — PR #59 (/dashboard) のモックアップ
- (準備中) `entry_v9.html` — PR #61 (/entry) のモックアップ
- (準備中) `targets_v9.html` — PR #62 (/targets) のモックアップ
- (準備中) `meeting_v9.html` — PR #63 (/meeting) のモックアップ

## デザイントークン

各モックアップで使用しているカラー / 余白 / タイポグラフィは
`app/globals.css` の末尾 `@theme {}` ブロックで一元管理されている (PR #60 で導入)。

Tailwind v4 の `@theme` ディレクティブにより、定義した `--color-*` トークンは
CSS 変数として参照可能であると同時に、`bg-grp-rev-bg` / `text-badge-red-fg` 等の
Tailwind ユーティリティクラスも自動生成される。

## バッジ判定ルール

`app/components/ui/metric-badge.tsx` の `getBadgeColor()` で実装。

| 達成率 | 色 |
|---|---|
| null / undefined (未設定) | gray |
| < 80% | red |
| 80% 〜 99% | yellow |
| ≥ 100% | green |

## 5 メトリックグループ

`app/components/ui/group-pill.tsx` の `GroupType` / `GROUP_LABELS` / `GROUP_METRICS` で実装。

| グループ | bg / fg | 左ボーダー | 標準項目 (水道 canonical) |
|---|---|---|---|
| ① 収益 (rev) | `#ecfdf5` / `#065f46` | `#065f46` | 売上 / 客単価 / 粗利 |
| ② 件数 (cnt) | `#eff6ff` / `#1e40af` | `#1e40af` | 合計件数 / 工事件数 / 対応率 / 車両数 |
| ③ 集客 (acq) | `#fef3c7` / `#854d0e` | `#854d0e` | 広告費 / 入電 / 獲得 / CPA / 成約率 |
| ④ コスト (cost) | `#fce7f3` / `#831843` | `#831843` | 職人費 / 材料費 / 営業外注費 |
| ⑤ HELP (help) | `#f3e8ff` / `#581c87` | `#581c87` | HELP売上 / HELP客単価 / HELP件数 |

業態固有の追加項目 (電気の分電盤件数、ロードの保険売上 7 内訳など)
は各業態の Section コンポーネント内で適切なグループに追加配置する。

## 利用例

```tsx
import { GroupPill, MetricBadge, getBadgeColor } from "@/app/components/ui";

<GroupPill type="rev" />                 {/* 「① 収益」緑バッジ */}
<MetricBadge color={getBadgeColor(42.2)}>42.2%</MetricBadge>  {/* red */}
```
