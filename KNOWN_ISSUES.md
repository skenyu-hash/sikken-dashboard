# SIKKEN ダッシュボード — Known Issues

このファイルは、本リポジトリで認識されているが現フェーズでは対応せず、後続フェーズで対処する重大な構造的課題を記録するためのものです。

---

## 1. entries テーブル PK 制約による複数業態同日登録不可問題

### 概要
`entries` テーブルの主キーが `(area_id, entry_date)` のみで、`business_category` を含んでいないため、**同一エリア・同一日に複数業態（例: 水道 + 電気）の日次データを別レコードとして登録できない**構造になっている。

### 現状（実装位置）
- 定義: [app/lib/db.ts](app/lib/db.ts) の `ensureSchema()` 内、entries テーブル DDL（22-29行付近）
- スキーマ:
  ```sql
  CREATE TABLE IF NOT EXISTS entries (
    area_id TEXT NOT NULL,
    entry_date DATE NOT NULL,
    data JSONB NOT NULL,
    business_category VARCHAR(20),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (area_id, entry_date)
  )
  ```

### 影響
- 同一エリア（例: 関西）で、同一日に水道と電気の日次データを両方入力しようとすると、**後勝ちで上書き**される
- 業態が増えるほど、または同エリアで複数業態を運営している箇所（関西は全業態運営）でデータロスのリスクが顕在化
- 月次集計（`monthly_summaries`）には `business_category` が UNIQUE 制約に含まれており整合性は保たれているが、日次入力経路（`entries`）では保証されない

### 対応案（推奨）
PK を `(area_id, entry_date, business_category)` の3列複合に拡張する。

#### 移行手順（概要）
1. 既存データの整合性確認（`business_category` が NULL のレコードがないか、複数業態で同日重複が既に発生していないか）
2. 必要なら `business_category` を NOT NULL 化（DEFAULT 'water' は既に設定済み）
3. 既存 PK を DROP し、新しい3列複合 PK を ADD
4. `app/lib/db.ts` の `upsertEntry` 関数の ON CONFLICT 句を新 PK に対応
5. 関連 API（`/api/entries/*` 等）のクエリで category 引数を必須化
6. 既存呼び出し側の影響範囲調査と修正

### 推奨タイミング
**Phase 9.2 完了後、Phase 10 着手前の最優先 Issue**

Phase 9.2（データ入出力センター）では、エクスポート・取込の両方で entries テーブルを参照するが、本問題のスコープ（PK 拡張・移行）には立ち入らない。Phase 10 以降で別 PR として実施する。

### 参考
- 既知の経緯: Phase 9.2 実装着手時の実体調査（Explore レポート）で発見
- 関連テーブルとの比較:
  - `targets`: PK は `(area_id, year, month, business_category)` ✅
  - `monthly_summaries`: UNIQUE は `(area_id, business_category, year, month)` ✅
  - `entries`: PK は `(area_id, entry_date)` のみ ⚠️

### 実証ログ

- **確認日**: 2026-04-30
- **確認方法**: `/api/export/daily-entries?from=2026-04-01&to=2026-04-30&categories=water&areas=kansai`
- **期待行数**: 20〜30件程度（業態運営の通常想定）
- **実際行数**: **1件**（4月13日のみ）
- **推定原因**: PK 制約による後勝ち上書き。同日同エリアで複数業態の入力があった場合、`(area_id, entry_date)` の単一性により最後の業態のみが残存していると考えられる
- **意義**: 本問題が現実のデータで顕在化していることを確認。Phase 9.5 着手時の説得材料として保存

---

## 2. 既存依存ライブラリの脆弱性（npm audit 警告）

### 概要
Phase 9.2 の `xlsx` (SheetJS) 公式 CDN 切替後の `npm audit` で、本リポジトリに既存の依存ライブラリに関する脆弱性が 3 件残存していることを確認した。これらはいずれも Phase 9.2 着手前から存在する問題で、本フェーズのスコープ外として処理する。

### 残存している脆弱性（npm audit 出力ベース）

| # | パッケージ | 現在版 | Severity | Advisory | 修正版 | 修正ロードマップ |
|---|---|---|---|---|---|---|
| 1 | `next` | 16.2.2 | high | [GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3)（Server Components 経由の DoS） | 16.2.4 | minor 更新で修正可、ただし stated dependency range の外 |
| 2 | `postcss` | 8.5.10 未満 | moderate | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)（Unescaped `</style>` による XSS） | next 16.2.4 経由で解消 | next 更新と同時 |
| 3 | `@anthropic-ai/sdk` | 0.87.0（範囲 0.79.0〜0.91.0 が脆弱） | moderate | [GHSA-p7fg-763f-g4gf](https://github.com/advisories/GHSA-p7fg-763f-g4gf)（Local Filesystem Memory Tool の不安全なデフォルト権限） | 0.91.1 | major 段では breaking change の可能性 |

### Phase 9.2 でこれらに触れない理由

1. **breaking change リスク**: `next` 16.2.2 → 16.2.4 は minor だが Vercel デプロイへの影響を伴う（Phase 9.2 の本旨である「データ入出力センター」の動作確認とは独立した検証が必要）
2. **スコープ分離の原則**: Phase 9.2 は「データ入出力機能」が本旨。依存更新を混ぜると PR レビューが本旨から外れる
3. **既存問題**: 本フェーズで作り込まれた問題ではなく、もとから存在していた

### 推奨対応タイミング

**Phase 10 または Phase 9.5（entries PK 修正）と並行で別 PR**

具体的には：
1. `npm audit fix --force` で 3 件まとめて修正コミット
2. `next@16.2.4` の差分を確認（minor とはいえ Server Components 周辺の挙動変化を実機で確認）
3. `@anthropic-ai/sdk@0.91.1` の breaking change を確認（API 利用箇所の影響範囲調査）
4. 個別 PR としてマージし、Vercel preview で検証

### 参考
- 確認コマンド: `npm audit`
- 4 件目（`xlsx`）は Phase 9.2 の `chore` コミットで SheetJS 公式 CDN 版（0.20.3）に切替済みのため対象外

---

## 3. 月次/日次の集計経路の不整合（**解消済み 2026-05-01**）

> **更新（2026-05-01）**: PR `fix/dashboard-aggregation-bug` で本問題は解消。Dashboard.tsx の月次サマリー fetch 条件から `entries.length === 0` を撤廃し、monthly_summaries が存在すれば常に正規データソースとして優先するよう変更。下記の旧症状記録は経緯として保持。


### 概要
`monthly-summary` API（`monthly_summaries` テーブル参照）とダッシュボード画面（`/`）で、同じ集計対象に対して異なる数値が表示される現象を確認。集計経路が分岐している可能性が高い。

### 確認ログ

- **確認日**: 2026-04-30
- **確認対象**: 関西エリア × 水道カテゴリ × 2026年4月
- **`/api/export/monthly-summary` の戻り値**: 売上 ¥29,322,580
- **ダッシュボード `/` 画面の表示**: ¥0

### 推定原因

`monthly_summaries` テーブルと `entries` テーブルの集計経路が別になっており、ダッシュボード（`/`）が `entries` ベースで日次データを集計して表示している可能性が高い。`entries` 側は KNOWN_ISSUES セクション 1 の PK 制約問題で 1 件しか保存されていないため、ダッシュボード上では集計が正しく行われない。

### 影響

- ダッシュボード閲覧者と Phase 9.2 エクスポート利用者で**異なる売上数値を見る**ことになり、経営判断に不整合が生じる
- KPI レポートと月次サマリーの突合作業が増える

### スコープ

**Phase 9.2 では触らない**。集計経路の特定とリファクタには `entries` PK 拡張（セクション 1）と密接な関連があるため、Phase 9.5（entries PK 修正）または独立した「データ品質改善 PR」として後日対応する。

### 着手時の調査ポイント（メモ）

1. ダッシュボード（`app/page.tsx`）の売上計算ロジックがどのテーブル/API を参照しているか
2. `monthly_summaries` がどこで生成・更新されるか（手動入力/バッチ/API 経由）
3. 二系統の集計が両方必要なのか、片方に統一できるのか

---

## 4. テンプレート注釈行と取込スキップ処理（PR-C 着手時）

### 概要
Phase 9.2.2（PR-B）で導入されるテンプレート CSV/XLSX には、ユーザビリティ向上のため**ヘッダー直下に注釈行を 1 行**入れる方針。Phase 9.2.3（PR-C）で取込を実装する際、この注釈行を**スキップする処理**が必要になる。

### テンプレートのファイル構造

| 行 | 内容 |
|---|---|
| 1 行目 | ヘッダー（列名）。例: `年`, `月`, `エリアID`, `業態ID`, `総売上(円)`, ... |
| 2 行目 | **注釈行**。例: `* = 必須項目です。空欄のまま保存しないでください` |
| 3 行目以降 | データ行（ユーザが入力 / サンプル付きテンプレならサンプルデータ） |

### PR-C のバリデータ実装時の選択肢

| 案 | 内容 | メリット | デメリット |
|---|---|---|---|
| A | **「2 行目を必ず読み飛ばす」固定実装** | 実装最小・予測可能 | 注釈行が無い CSV を取り込めない |
| B | **「注釈行検出ロジック」**（1 セル目が `*` / `※` / 空白で始まる行は注釈と判定） | 注釈行の有無に柔軟対応 | 実装やや複雑、誤判定リスク |

実装方針は **PR-C 着手時に再判断**。Phase 9.2.2（PR-B）側では決定しない。

### Phase 9.2.2 のスコープ

PR-B では **テンプレート出力側のみ**を実装する：
- CSV / XLSX のヘッダー行
- 直下の注釈行（テキスト固定）
- サンプルデータ行（サンプル入りテンプレートのみ）

読み飛ばしロジックは PR-C のスコープであり、PR-B では実装しない。本セクションは PR-C 着手時の申し送りとして記録。

### 業態固有の注釈

業態別に追加注釈が必要な場合（例: 「探偵カテゴリは粗利率/広告費率を必ず入力」）も、Phase 9.2.2 のテンプレート出力時に注釈行へ含める。PR-C ではこれらも一括スキップで対応する想定。

### 関連ファイル（PR-B 実装後に書き込まれる）

- `app/data-io/lib/templateSchemas.ts`（テンプレート列定義 + 注釈テキスト）
- `app/data-io/lib/exportTemplate.ts` 等（テンプレ生成ヘルパ、PR-B 中で名称確定）

### 月次テンプレ列の除外メモ
- テンプレ列から `call_unit_price` を除外（22→21列、計算項目のため入力不要）

---

## 5. デバッグエンドポイント `/api/debug/monthly-summary` の暫定運用

### 概要
PR #20 (`fix/import-monthly-error-handling`) マージ後も nagoya/kyushu の集計値が期待値と乖離する事象を調査するため、`monthly_summaries` テーブルの生レコードを読み取るデバッグ用 GET エンドポイントを暫定追加した。

### 仕様
- **パス**: `GET /api/debug/monthly-summary?year=YYYY&month=M&area_id=xxx`
- **認証**: executive ロールのみ（他ロールは 403）
- **CORS**: 同一オリジンのみ許可（Origin ヘッダが host と異なる場合 403）
- **副作用**: なし（SELECT 4 種を実行するのみ）
- **アクセスログ**: Vercel Functions Logs に呼出ユーザー（メール/ID）/ クエリ内容 / 時刻を記録
- **返却内容**: rows / duplicates / distinctCategories / nullCategoryCount / summary（perArea, perCategory）

### 解決すべき仮説
- A. 多重レコード（PK 制約破損）→ duplicates で検出
- B. business_category 表記ゆれ → distinctCategories で検出
- C. ダッシュボード側集計バグ → rows と画面値の照合で判定
- D. 過去のテストデータ残存（NULL business_category）→ nullCategoryCount で検出

### 使用期限と削除計画

**Phase 9.5 で削除 or admin UI に統合する**。本エンドポイントは：
- DB の全カラムを露出する（経営機密データ）
- 認証は executive のみだが、永続化すべき設計ではない
- 調査目的の暫定追加であり、長期運用は想定していない

Phase 9.5 の作業内容に「`/api/debug/monthly-summary` の削除 or 管理画面統合」を含めること。具体的には：
- 削除案: PR で `app/api/debug/` ディレクトリごと削除
- 統合案: `/admin` 配下に admin 専用 UI として組み込み、フィルタ・ソート機能を追加

### 関連 PR

- 追加 PR: `feat/debug-monthly-data`（本エントリ追記時点で作業中）
- 起点となった事象: PR #20 マージ後の nagoya/kyushu 集計乖離（2026-05-01 報告）

### 兄弟デバッグエンドポイント `/api/debug/entries-summary`

monthly-summary との集計乖離調査の続編で `entries` テーブル側も読み取る兄弟エンドポイントを追加：

- **パス**: `GET /api/debug/entries-summary?year=YYYY&month=M`
- **認証/CORS/ログ**: `/api/debug/monthly-summary` と同方針
- **集計式**: `SUM((data->>'selfRevenue')::bigint + (data->>'newRevenue')::bigint + (data->>'addRevenue')::bigint)`（Dashboard の `calculations.ts:138` と同一式）
- **返却**: area × business_category 別の entry_count / total_revenue / 部門別内訳 / 期間 / 最終更新時刻

`monthly-summary` と `entries-summary` の2エンドポイントは**Phase 9.5 で同時削除 or admin UI 統合**する。

---

## 6. `/cf` ディレクトリ未存在（Phase 9.5 時点）

### 概要
Phase 9.5 で「全画面に as_of_day バッジを追加」を実施した際、当初対象想定だった `/cf` ページが **app ディレクトリ配下に存在しないこと**を確認した。`cashflow` ディレクトリも未存在。

### 現状
- `app/cf/` なし
- `app/cashflow/` なし
- 関連テーブル `cashflow_entries` は DB に存在し（[app/lib/db.ts:92-108](app/lib/db.ts#L92)）、API ハンドラ [app/api/cashflow/route.ts](app/api/cashflow/route.ts) もある
- 表示ページ自体が未着手の状態

### 対応方針
`/cf` ページの要件が出た段階で:
- 別ブランチで page.tsx を新規作成
- `monthly_summaries` を fetch するなら AsOfBadge を併設
- このセクションは削除

Phase 9.5 のスコープでは **対象外** として確定。

---

## 7. monthly_summaries 新列追加時の必須 E2E 検証手順

### 概要
PR #38 → #41 → #42 で「**新列追加 → 投入経路追加忘れ → 表示経路追加忘れ**」の
3 連発の構造的バグを起こした。同種の事故を防ぐため、`monthly_summaries`
スキーマに列を追加する際の **必須チェックリスト**を以下に固定化する。

### 背景となった事故
- **PR #38**: DB 列 15 個追加 + pick エイリアス追加 → ✅ スキーマ完成
  - だが INSERT 文の (列名 + VALUES + ON CONFLICT) に新 15 列を含め忘れ
- **PR #41**: 上記を修正 + 統合テスト追加 (DB スキーマ整合検証のみ)
  - 統合テストはテスト自身が動的 INSERT のため、route.ts INSERT 列抜けを検出できず
- **PR #41 追加**: 静的テスト (route.ts ソース検査) を追加 → 投入経路の漏れは確実に検出可能に
- **PR #42**: ダッシュボード `displaySummary` で新列が `0` ハードコード上書き → 表示経路が抜け
  - DB と API は OK でも画面で ¥0 表示されていた

### 必須チェックリスト (新列追加時)

スキーマ拡張 PR では以下 6 レイヤーを **すべて同一 PR 内で完成**させること。
1 つでも欠けると「データはあるが見えない」「投入したが消える」事故になる。

| # | レイヤー | チェック項目 |
|---|---|---|
| 1 | **DB スキーマ** | `app/lib/db.ts` ensureSchema に冪等 ALTER ADD COLUMN IF NOT EXISTS 追加 |
| 2 | **マイグレーション** | `scripts/migrations/<topic>_<yyyymm>.sql` で BEGIN/COMMIT 付き SQL 作成 + 本番 psql 適用 |
| 3 | **API 書込 (INSERT/UPSERT)** | `app/api/import-monthly/route.ts` の **3 セクション**に新列を追加: ① INSERT カラム名リスト ② VALUES の `pick(row, ...)` ③ ON CONFLICT DO UPDATE SET の `<col>=EXCLUDED.<col>` |
| 4 | **API pick エイリアス** | レガシー名がある場合は `pick(row, "primary", "alias1", ...)` で吸収 |
| 5 | **API 読出 (SELECT)** | `app/api/monthly-summary/route.ts` 等は `SELECT *` を使用しているため通常無修正で OK (列名指定 SELECT を使う API があれば追加) |
| 6 | **画面表示パス** | `DashboardSummary` 型 + `calculateDashboard` の集計 + `displaySummary` の値流入 (Dashboard.tsx 3 箇所) + `buildMetricRows` の MetricRow 定義 |

### 必須テスト (再発防止)

- `scripts/test-import-monthly-integration.ts` を**新列追加のたびに更新**:
  - `PR38_NEW_COLUMNS` 配列 (今後 `EXPECTED_NEW_COLUMNS` 等にリネームしてもよい) に新列名を追加
  - `TEST_VALUES` に非 0 値を追加
  - テスト実行で「静的 (route.ts INSERT 3 セクション全て含む) + 統合 (DB が保存できる)」両方が緑になることを確認
- 実機投入 → ダッシュボード表示で実際に値が出ることを **PR マージ前に必ず確認** (「DB に値があるか」だけでなく「ユーザーの画面に出るか」まで E2E で)

### コミット時の自己レビュー質問

新列追加 PR を出す前に必ず以下に答えられること:

1. ✅ DB に列が物理的に存在するか? (`psql \\d monthly_summaries`)
2. ✅ `import-monthly` で投入できるか? (実 JSON で curl/画面投入)
3. ✅ 投入後 SELECT で値が入っているか?
4. ✅ ダッシュボード/関連画面に値が表示されるか?
5. ✅ 統合テスト (静的 + 統合) が緑か? `npm run test:integration:import-monthly`

5 つすべて Yes でないとマージしない。

### 関連 PR
- PR #38: 新 15 列追加 (DB スキーマ + pick)
- PR #41: INSERT 列追加忘れ修正 + 統合テスト + 静的テスト
- PR #42: displaySummary 流入修正 + buildMetricRows 切替 + 本ガイドライン追加

