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
