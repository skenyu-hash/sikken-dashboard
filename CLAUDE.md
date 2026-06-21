# CLAUDE.md — SIKKEN Dashboard 開発憲章

このファイルは Claude Code (CC) がこのプロジェクトで作業する際の最上位ルール。
反謙雄（Kenyu、SIKKEN Group 専務取締役）が監督し、CC が調査・実装・検証・git を一貫して担う。
CC はこのファイルの全ルールを毎セッション遵守する。判断に迷ったら、このファイルが優先。

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## 0. 役割と運用モデル

- **反さん = 監督**。自然言語で「何をしたいか」を指示する。コードは書かない。最終承認を出す。
- **CC = 実装者 兼 レビュアー 兼 番人**。調査→計画→実装→自己検証→報告→git まで一貫して担う。
- かつては Web Claude が判断・レビューを別途担っていたが、CC 一本に統合した。
  **だから CC は「もう一人の自分がレビューするつもりで」自分の成果物を厳しく自己検証すること。**
  実装した本人がチェックも兼ねる以上、見落としを防ぐため自己検算・自己批判を徹底する。

### 必須ワークフロー（Step 制）
1. **Step 1（調査+計画）**: 指示を受けたら、いきなり実装しない。まず該当コードを調査し、計画・影響範囲・リスク・質問を提示して停止。
2. **Step 2（承認）**: 反さんが承認 or 修正指示を出す。
3. **Step 3（実装+自己検証+報告）**: 実装し、テスト・検算・絶対不変 grep を自分で走らせ、報告フォーマットで報告。
- 大規模変更は slice 分割（純関数 lib 先行 → UI 後続）。1 コミット 1 テーマ。
- **Step 1 を飛ばして実装するのは違反。**

### チーム構成と権限（2026-06-01〜 3 人体制）
本プロジェクトは反専務 + メンバー 2 名（メンバー A / メンバー B）の 3 人 + Claude Code (CC) + 番人エージェントで運用する。3 人はそれぞれ自分の環境（各自の VSCode + Claude Code + 各自の GitHub/Anthropic アカウント）で同じリポジトリを触り、GitHub で合流する（同時に同じ画面を操作するのではない）。

3 人とも GitHub / Neon / Vercel / マージ承認の全権限を持つ。ただし「権限がある = 何でも独断でやっていい」ではない。下記の通り、本番に大きく影響する操作は独断を禁止し、チームに一報を入れてから実行する。

### 自走してよい操作（各自の判断で実行可）
- コードの調査・計画・実装・テスト
- PR 作成
- 通常の機能変更のマージ（番人検証通過が前提）
- BACKLOG への追記、ドキュメントの軽微な更新

### チームに一報してから実行する操作（独断禁止）
以下は実行前にチーム 3 人で共有（Slack 等で一報）してから行う。一人で勝手に実行しない:
- 本番 DB の不可逆な書き換え（re-aggregation / マイグレーション / DELETE 系）
- 複数業態の粗利定義を変える変更 / 経営数字の定義（売上・粗利・KPI の計算式）を変える変更
- 2026 年 4 月以前データに触れる可能性がある変更
- 現場ユーザー（46 名のエリアマネージャー等）が見る数字・UI が変わる変更

※これらは §0.5「第三者レビューを呼ぶ条件」とも重なる重大局面。一報 + 必要なら第三者（Web Claude）レビューを通す。本番 DB 書き換え系は必ず **dry-run をデフォルト**にし、`--apply` フラグ付きでのみ実書き込み。実行前に before/after を提示してチームで確認を取る。

### マージのルール（全員共通）
- マージには番人（number-verifier / invariant-guard）の検証通過が必須
- 第三者レビュー条件（§0.5）に該当する重大変更は、3 人のうち最低 1 人が別途レビューしてからマージ
- 通常の機能変更は、番人通過していれば各自マージしてよい
- マージ = 経営数字の本番リリース。番人が通っても「今これを本番に出していいか」は人間の判断（c93 事故の教訓）

---

## 0.5. マルチエージェント運用（実装↔検証のディベート）

3 つのサブエージェントで回す（実体は `.claude/agents/*.md`）:
- **implementer**: 調査・計画・実装・テスト・git
- **number-verifier**: 金額・粗利・率を独立検算する番人（実装を信用しない）
- **invariant-guard**: 絶対不変項目への違反を grep で検出する番人

標準ループ:
1. 反さんが自然言語で指示
2. implementer が Step 1（調査+計画）提示 → 反さん承認
3. implementer が実装+自己検証
4. implementer が number-verifier（数値変更時）と invariant-guard（不変項目に触れうる時）を招集 → 敵対的検証
5. 指摘を implementer が解消 → 指摘がなくなるまで 3-5 反復
6. 検証通過後、implementer が反さんに報告
7. 反さんが最終ゴー → マージ等

心得:
- 番人は「承認するため」でなく「欠陥を見つけるため」に存在。**馴れ合い禁止**。
- 同じ Claude モデル同士なので思考の癖が似る。番人は特に **「テストが緑でも画面実値・実データで検算する」** ことを徹底し、コードだけ見て満足しない。
- 反さんは監督。ディベートの結果（磨かれた成果物 + 検証記録）を見て判断する。

### 番人の必須招集条件（implementer の裁量で省略不可）
以下に該当したら、implementer は必ず番人を招集する。「不要と判断した」は許されない:
- **金額・粗利・率・件数の計算に1文字でも触れた** → number-verifier 必須
- **マイグレーション・aggregation・DB書き込みに触れた** → number-verifier + invariant-guard 必須
- **5行以上のコード変更、または絶対不変項目の周辺ファイルに触れた** → invariant-guard 必須
- **既存テストの期待値を変更した** → number-verifier 必須（新期待値を独立検算）
- **API レスポンスを fmt 関数 (`.toFixed`/`.toLocaleString`/`Math.round` 等) に渡す経路を追加した** → number-verifier 必須 (型ガード = Neon driver が NUMERIC/BIGINT を string で返すケース、c96-2 hotfix 教訓 2026-06-05)

### 第三者レビュー（Web Claude 等）を呼ぶ条件
番人で完結せず、人間（反さん）が claude.ai 等で第三者の目を通すべき重大局面:
- 本番DBの不可逆な書き換え（re-aggregation、過去データ更新、DELETE系）
- 複数業態の粗利定義を同時に変える変更
- 2026年4月以前データに触れる可能性がある変更
- 経営数字の定義そのもの（売上・粗利・KPIの計算式）を変える変更

これら以外は番人で完結してよい。第三者は「最後の保険」であり、日常の実装では呼ばない。

---

## 1. 絶対不変項目（TOUCH 厳禁）

以下は理由なく変更・削除しない。触る必要が出たら必ず反さんに確認。

- `AUTOSAVE_DISABLED_C89_P1 = true`（`app/entry/hooks/useDebouncedAutoSave.ts`）
- **2026年4月以前データ**（entries 1行 + monthly_summaries 133行、うち water 109行）。読み書きとも触らない。過去の数字が遡って変わって見えるのは重大事故。
- `calculations.ts` の camelCase `vehicleCount`（レガシー経路）
- c94 / c95-A / c95-B 全機能
- 既存テスト（純関数 + DB）を緑のまま保つ。期待値を変える場合は同 PR でテスト更新を同梱。

実装後は必ず絶対不変項目の grep を走らせ、無変更を報告に含める。

---

## 2. 検算・数値の鉄則（最重要）

**金額・粗利・率に関わる変更では、必ず自分で手計算して照合する。** 「計算しました」で済ませない。

- 数値を変える PR では、実データで before/after を出し、**期待値を独立に算出して 1 行ずつ照合**する。
- 浮動小数の罠に注意（`revenue * 0.077` は `(revenue * 77) / 1000` でも検算し、Math.round の位置を明示）。
- 暗算に頼らず、スクリプトや長乗算で桁単位検証する。
- **月次集計と日次（day-level）の計算経路は別物**。両方に同じ変更を漏れなく入れ、SUM(日次) = 月次 を数式 + 実データで証明する。
- 本番 DB 書き換え後は、**予測値ではなく DB から読み直した実値**で期待値一致を確認する。
- 画面表示（スクショ等）の値が与えられたら、それも検算対象。コードだけ見て満足するな。テストが緑でも画面値が検算と合わないことがある（実例: c95-B-3 で当日粗利が「テスト緑なのに画面値検算と不一致」と報告されたが、調査の結果は手計算側で広告費 ad_cost を漏らしていただけだった = 検算する側の項目漏れも疑う）。

---

## 3. プロジェクト基本情報

- repo: `skenyu-hash/sikken-dashboard`
- 本番: https://sikken-dashboard.vercel.app/
- ローカル: `/Users/kenyu/Desktop/sikken-dashboard`
- スタック: Next.js (App Router) / Vercel / Neon Postgres
- Neon: project `red-lake-36460896`, branch `br-flat-lake-amp8x168`
- area_id: kansai / kanto / nagoya / kyushu / kitakanto / hokkaido / chugoku（+ shizuoka 運用あり）
- business_category: water / electric / locksmith / road / detective
- 会社↔エリア: REXIA=関東+北関東水道 / Mavericks=関西+北海道水道 / TOPLEVEL=名古屋水道 / DUNK=九州+中国水道 / ULUA=関西+関東電気 / SIKKEN=鍵関西
- Vercel CDN: マージ後 30秒〜1分で反映。`?nocache=タイムスタンプ` で最新取得。
- **★ 本番検証時はハードリロード (Ctrl+Shift+R) 必須** (PR-3 教訓、2026-06-08)。
  `?nocache=` クエリだけではブラウザキャッシュで旧版が見え、デプロイ反映を誤判定する
  (PR-3 検証で実際に踏んだ事例: 8 エリア→7 エリアの変更がハードリロードで初めて反映確認できた)。
  デプロイ反映の真偽は **GitHub Deployments の Production "Active" + コミットハッシュ** で確認するのが確実。
- **★ PR を「マージ済」と記録する前に必ず `gh pr view <PR#> --json mergedAt,state` で state=MERGED を確証する**
  (PR #163 を未マージのままメモに「マージ済」と書いた事例あり、2026-06-08)。
  CLAUDE.md §5 既出ルールの再確認と PR #163 事例の追加。

### SIKKEN グループ規模感（年商）
- 水道: 約 42 億円（4 社・8 拠点）
- 電気: 約 8 億円（2 拠点）
- 鍵: 約 2 億円
- ロード: 約 1 億円
- 探偵: 立ち上げフェーズ

7 社の多業態コングロマリット（疑似統合フェーズ）。会社: REXIA, Mavericks, TOPLEVEL, DUNK, ULUA, SIKKEN, GriTs。主要顧客獲得チャネルはリスティング広告・有料検索（依存度約 30%）。

### 戦略目標
1. 広告依存からの脱却（30% 依存は構造的弱点）
2. 休眠顧客 24 万人の再活性化（無広告の最大資産）
3. KPI 標準化と組織オペレーション統一
4. 持株会社化
5. IPO または M&A エグジット

---

## 4. ドメイン定義（数値ロジック）

- **全体売上** = `outsourced_sales_revenue + internal_staff_revenue`（業務委託売上 + 内勤社員売上）
- **粗利（water/electric/road/detective）** = 売上 − 職人費 − 材料費 − 広告費 − 営業外注費 − カード手数料
- **粗利（locksmith）** = 売上 − 工事費 − 材料費 − 広告費 − 手数料（別経路。internal_construction_profit 加算なし、SectionConstruction 非表示）
- **コンサル費控除（c95-D、water のみ）**: 粗利からさらに **手入力 `consultant_fee`** (monthly_summaries.consultant_fee / entries.data.consultant_fee) を直接控除。**2026年5月以降（yyyymm >= 202605）のみ**適用、4月以前は控除 0。月境界は `app/lib/consultantFee.ts` の定数 `CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605` のみ参照 (旧 c95-B の自動 7.7% 率は c95-D-6 で完全撤去、[DECISIONS.md D-010](./DECISIONS.md) 参照)。
- **当日粗利率** = 当日粗利 ÷ 当日売上（当日ベース。月累計÷ではない）
- **HELP**: 顧客先での上位スタッフによるアップセル/クロスセル。water/electric/locksmith のみ（road/detective は非表示）。単価は通常案件の 7〜17 倍。
- **landing/着地予測** = actual ÷ daysElapsed × daysInMonth、**達成率** = landing ÷ target
- c93 で内部工事利益の二重計上を排除済み（aggregation から `internal_construction_profit` 加算を削除）。コンサル費控除はこれと独立。

---

## 4.5. デザイン基準（Phase 7.5 で確立）

### カラーパレット
- アクセント深緑: `#1B5E3F`（アクティブ状態のみ）
- 健全グリーン: `#059669`
- 注意オレンジ: `#D97706`
- 警戒レッド: `#DC2626`
- BEP用ブルー: `#3B82F6`
- 黒テキスト: `#111827`
- セカンダリーグレー: `#6B7280`
- 薄ボーダー: `#E5E7EB`
- バー背景: `#F3F4F6`
- カード薄背景: `#FAFAFA`
- 日報深緑（モーダル/ヘッダ）: `#2e8b62`（c95-A-3 モック確定）

### デザイン原則
- 緑グラデーションは廃止（Phase 7.5 で完了）
- 機能色（CF黒 / PL黒 / 赤字、警告ブロック）は意図的に維持
- 装飾色とロジック色は明確に分離
- アクティブ状態だけが深緑、それ以外は黒・グレー・白基調

---

## 5. 報告フォーマット（Step 3 完了時）

毎回これを埋める:
- Branch / Commit、`git ls-remote` とローカルの一致
- Files changed（ファイル数 / +行 / −行）
- tsc --noEmit / npm run build / lint（baseline からの増減）
- Tests（既存全 pass 維持 + 新規の件数・内訳）
- 絶対不変項目 grep の結果（無変更であること）
- 変更の before/after コード抜粋
- 数値変更がある場合は期待値との 1 行ずつ照合表
- PR URL と PR 本文案

**タスク完了時は必ず §7 進行状況を更新すること**（CLAUDE.md を生きた進行管理表として維持。完了/保留中/着手予定の現在地が常に最新になるように）。報告と CLAUDE.md §7 更新を同 PR / 同 commit で扱うのが望ましい。

**§7 に「✅ マージ済」と書く前に、必ず `gh pr view <PR#> --json mergedAt,state` または `git log --merges --grep="<branch名>"` で実マージ commit の存在を確認する。誰の情報であっても（user / Web Claude / CC 自身）、写す前に必ず検証する**（[DECISIONS.md D-009](./DECISIONS.md) 参照、2026-06-01 c95-A-3 hotfix の二重伝播誤記録事故を踏まえたルール）。同様に DECISIONS.md / KNOWN_ISSUES.md / ONBOARDING.md などで「マージ済」「実装済」を述べる際も実コード grep / git log で確証する。

---

## 6. git / PR 運用

- **CC が実装〜PR 作成まで完結、マージは番人通過後に担当者（3 人いずれか）が実行**（gh 認証が切れていたら §6 末尾の再ログイン手順に従って最優先で復旧）。
- マージ = 経営数字の本番リリース。番人が通っても「今これを本番に出していいか」は人間の判断（c93 事故の教訓）。3 人体制では最終リリース判断もチーム共有（§0「チームに一報してから実行する操作」+ §10「並行作業ルール」参照）。
- PR は機能境界で分割。cutover（入口切り替え・既存廃止）は最後の独立 PR に。
- 大規模リファクタは段階分割: 1 コミット = 1 テーマに絞る。
- ブランチは `feature/` プレフィックス（hotfix は `fix/`、運用補助は `chore/`、マイグレ補助 script は `scripts/migrations/`）。
- PR 本文は日本語で構造化: 概要 / 変更点 / 維持要素 / 動作確認 / 後続予定 / コミット一覧（§5 報告フォーマット準拠）。
- マージ後はローカル後始末: `git checkout main && git pull && git branch -d <branch>`。
- 認証なし API ルートが既存（後で一括対応予定）。新規 API も同様で OK（後で揃える）。
- エラー時は迷ったら git reset: 推測修正で深掘りせず、迷ったら一度戻す。

### 標準 PR フロー（gh CLI 認証済前提、2026-06-01〜 3 人体制版）

| # | ステップ | 主体 | ブロッカー |
|---|---|---|---|
| 1 | 実装（Edit/Write）→ `npx tsc --noEmit` / `npm run build` / 対象テスト green まで自己検証 | 担当者 + CC | 自己検証 NG なら commit せず原因究明 |
| 2 | 番人招集（金額変更 → number-verifier、不変項目 → invariant-guard）。両者の指摘を全て解消するまで Step 1〜2 反復 | 担当者 + CC | **番人が「バグあり / 違反あり」と判定したら commit/push しない**。修正して再招集。 |
| 3 | commit（HEREDOC で日本語 message、Co-Authored-By 付き）+ push（`-u origin <branch>`） | 担当者 + CC | hooks 失敗時は `--no-verify` ではなく根本対応 |
| 4 | `gh pr create --title "<日本語タイトル>" --body "$(cat <<'EOF' ... EOF)"` で PR 作成、本文は §5 報告フォーマット準拠（概要 / 変更点 / 検証 / 数値証跡 / 後続予定） | 担当者 + CC | `gh auth status` が NG なら §6 末尾の再ログイン手順 |
| 5 | 番人通過確認 → §0「チームに一報してから実行する操作」該当の重大変更なら 3 人中 1 人（**PR 著者以外**）がレビュー → 担当者が `gh pr merge <PR#> --squash --delete-branch` | 担当者 + (重大変更時) チーム 1 人 | 番人 NG / 重大変更でレビュー未了 / 著者本人レビュー（= 実質ノーチェック） |
| 6 | **Preview 環境で検証 → 本番 Promote/反映 → 本番 Chrome `?nocache` 検証** (UI / フロント変更時必須) | 担当者 | Preview スキップで本番デプロイ → 本番障害リスク (c96-2 事故再発防止) |
| 7 | `git checkout main && git pull --ff-only origin main && git branch -d <branch>` でローカル同期 | 担当者 + CC | ローカル main が遅れていたら必ず先に同期 |

#### Step 6 詳細 (c96-2 hotfix 教訓で 2026-06-05 標準化)
UI / フロント変更 PR (= ユーザー画面に影響する変更) は本番デプロイ前に必ず Preview 検証:
1. **Preview 環境 (Vercel Preview URL)** で対象画面を Chrome で開き、機能動作 + DOM 座標 + デフォルト以外の選択肢 (全 7 社等) も実際に切り替えて中身を確認
   - **要素の「見た目」だけでなく DOM 座標 / 実在を確認** (ナビ消失の誤判定が教訓、2026-06-05)
   - **デフォルトのみ確認で済まさない** (c96-2 で Mavericks 以外を試さずに本番障害を見逃した教訓、2026-06-05)
2. Preview で問題なければ Vercel で **本番 Promote** (mainマージ後は自動 Production デプロイ、Promote 不要なケースもあり)
3. **本番 Chrome で `?nocache=<timestamp>` 付き URL で最終確認** (Vercel CDN キャッシュ回避、CLAUDE.md §3 既出)

スキーマ変更 / DB マイグレーション系は Preview 検証後に Neon Console で手動 SQL 実行が必要 (db.ts ensureSchema で冪等運用)。

**禁則**:
- 番人 NG のまま commit/push する
- 番人通過前にマージする
- §0「チーム一報」該当の重大変更を、3 人中 1 人（PR 著者以外）のレビュー前にマージする
- 自動マージ拡張（番人通過 + 人間ゲートは省略不可。案 A 全権限版でも維持、c93 事故再発防止の教訓継承）
- `--no-verify` / `--no-gpg-sign` を勝手に付ける
- main 直 commit（小さい設定ファイルでも PR 経由）

### gh CLI 認証が切れた場合の再ログイン手順

1. `gh auth status` で確認。`not logged in` または token expired なら以下へ。
2. ターミナルで `gh auth login` を担当者が実行（CC は対話プロンプトを扱えないため依頼。3 人それぞれが自分の GitHub アカウントで認証する）。
3. 対話プロンプト回答:
   - `GitHub.com` → `HTTPS` → `Yes (Git 認証同期)` → `Login with a web browser`
4. 表示される 8 桁ワンタイムコードをコピー → Enter でブラウザ開く（開かなければ手動で https://github.com/login/device）。
5. コード貼付 → GitHub 認証 → `Authorize github`。
6. `gh auth status` で `✓ Logged in to github.com account <自分の username>` を確認。
7. CC は認証復旧後、保留中の `gh pr create` から再開。

---

## 7. 現在の進行状況（2026-06-01 時点）

### 完了
- c95-A-3 hotfix（LINE 共有 3 段 fallback: Web Share API → line.me → mailto）✅ マージ済
- c95-B-1（consultantFee.ts 純関数 lib + 月境界 202605）✅ マージ済
- c95-B-2（monthlyAggregation に water コンサル費控除を 2 段 CASE で配線）✅ マージ済
- c95-B re-aggregation（water 5月以降 7 行を控除後値に再生成）✅ 実行成功・本番ダッシュボードで視覚確認済
  - 関西 粗利 30,460,693 → 23,618,681 / 粗利率 34.3% → 26.6% を確認
- c95-B-3（day-level 3 箇所に控除 + AutoCalc 注記）✅ マージ済
- 日報当日粗利問題の調査 ✅ **バグなし確定**（手計算側で広告費 ad_cost を漏らしていたのが原因、画面値は正、コード修正不要）
- **マルチエージェント運用基盤の整備**（2026-06-01）✅ マージ済
  - `.claude/agents/` に implementer / number-verifier / invariant-guard の 3 サブエージェント定義配置
  - CLAUDE.md を `@AGENTS.md` 参照 → 17 KB 本体化（§0〜§9 構成）。旧 AGENTS.md は背景情報 archive として残置（冒頭に CLAUDE.md 参照リンク追記）
  - §0.5 マルチエージェント運用（implementer↔number-verifier↔invariant-guard の敵対的検証ループ）を成文化
  - §5 報告フォーマットに「タスク完了時は §7 進行状況を都度更新」を追加（CLAUDE.md を生きた進行管理表として維持）
- **§6 標準 PR フロー（案 A）**（2026-06-01）✅ PR #123 マージ済 — gh 認証後の PR 作成〜マージ自動化、マージは反さん明示 OK 必須
- **チーム引き継ぎスイート**（2026-06-01）✅ PR #124 マージ済 — ONBOARDING.md / DECISIONS.md / RUNBOOK.md / VISUAL_CHECKLIST.md 新規 + §0.5 末尾の番人必須招集条件・第三者レビュー条件追記
- **BACKLOG.md 新設**（2026-06-01）✅ PR #125 マージ済 — 未確定アイデア置き場、§7 とは責務分離
- **c95-B 検算スクリプト**（2026-06-01）✅ PR #126 マージ済 — `scripts/check-day-level-profit-debug.ts` + `scripts/check-pre-april-snapshot.ts` (READ ONLY)
- **c95-B-4a**（2026-06-01）✅ PR #121 マージ済 — profit.ts read fallback への water 7.7% 控除 + Math.round 整数粒度一致 + test-profit.ts 11 case 追加 (合計 26/26 pass)
- **c95-B-4b**（2026-06-01）✅ 本 PR マージ済 — `<ConsultantFeeBadge>` 共通コンポーネント新設 + WaterDashboardSection / Dashboard グループクロス表 / trends / breakeven の 4 配線。yyyymm>=202605 ガードで過去月閲覧時は非表示 (4 月以前データへの誤認回避)
- **c95-C-1**（2026-06-01）✅ PR #133 マージ済 — 日報モーダルの内部構造を `<DailyReportContent>` (Content 層) + `useDailyReportData` (データ取得 hook) に分割、`DailyReportModal.tsx` を 379 → 71 行に縮小。純リファクタ (動作・見た目 1 ピクセル不変)、撮影 ref は Modal 側に残し captureRef props 経由で渡すことで boxShadow + 白背景 + borderRadius 含む撮影範囲を完全保持。EntryForm.tsx 無修正、Props 不変。第三者レビュー (反さん) 完了。c95-C-2 (/daily-report 独立ページ) 着手可能
- **c95-D 方針転換決定**（2026-06-02）✅ 反さん承認済 — コンサル費を「売上×7.7%自動計算」から「実額の手入力」に変更。water のみ。c95-B 全機能を slice 単位で手入力ベースに切替完了。[DECISIONS.md D-010](./DECISIONS.md) 参照
- **c95-D-1（slice 1+2: スキーマ + UI 追加、粗利不変）**（2026-06-02）✅ PR #143 マージ済 (commit 23d8ee9) — `monthly_summaries.consultant_fee NUMERIC NOT NULL DEFAULT 0` 列追加 + water ②コスト 5 項目目「コンサル費」手入力欄を新設 (water のみ、subtitle 入力 5項目)。粗利計算経路は untouch。water 5月以降 / 4 月以前 109 行 / 他業態すべて差分 0 円
- **c95-D-3（slice 3: form-level 切替）**（2026-06-02）✅ PR #145 マージ済 (commit e3eb932) — `useFormCalculations.ts` の water 分岐を旧 `consultantFee("water", f1, yyyymm)` から `state.consultant_fee` 直接控除に切替 (yyyymm >= 202605 のみ)。AutoCalcDisplay 粗利表示が手入力ベースに
- **c95-D-4（slice 4: aggregation 切替 + re-aggregate）**（2026-06-02）✅ PR #146 マージ済 (commit 98b0502) + re-aggregate apply 実行済 — `monthlyAggregation.ts` の water 分岐を 3 段 CASE に再構成 (water+applyConsult / water+4月以前 / その他)、`- b.sum_consultant_fee` 直接控除。本番 DB の water 5/6 月 12 行を再集計、合計 delta **+27,927,048 円** (現場入力ほぼ未完了で旧 7.7% 自動分が外れた)。4 月以前 water 109 行 untouch 確認済 (`updated_at` 不変)
- **c95-D-5（slice 5: day-level + read fallback + 日報 切替 + consultantFee 無効化）**（2026-06-02）✅ PR #147 マージ済 (commit 3728084) — `profit.ts` / `kpiCompute.ts` / `WaterDailyReportSection.tsx` を手入力 `consultant_fee` 直接控除に切替 + `CONSULTANT_FEE_RATE.water: 0.077 → 0` 無効化。番人 ✅、テスト 71/71 ✅
- **c95-D-6（slice 6: UI バッジ + consultantFee.ts 完全撤去 + docs）**（2026-06-02）✅ PR #148 マージ済 (commit 778bb1c) — UI バッジ文言を「コンサル費 (手入力) 控除済」に置換、AutoCalcDisplay subtitle 修正、`consultantFee.ts` の `CONSULTANT_FEE_RATE` / `consultantFee()` 関数を完全撤去 (月境界定数 + `toYyyyMm` のみ残置)。c95-D シリーズ全 6 slice 完了。

### c96 シリーズ: /daily-report 2 軸拡張 (3 視点 + 期間集計、2026-06-05/06)
- **c96-1 (API + lib 基盤)** ✅ PR #149 マージ済 (commit 17290bf) — companies.ts (会社マッピング 7 社 + 未割当) + theme.ts (色定数) + `/api/range-aggregate` (READ ONLY、groupBy=none/category_area、water 3 段 CASE)。131 テスト pass、4 月以前 watercontrole 3 重ガード
- **c96-2 (フロント 3 視点 + 期間)** ✅ PR #150 マージ → **本番障害発生** (rangeRow.profit_rate.toFixed クラッシュ) → Vercel で c96-1 にロールバック → c96-2 hotfix で復旧
- **c96-2 hotfix** ✅ PR #151 マージ済 (commit 26a22aa) — Neon driver の string 型レスポンスを normalize 関数で number 化、`.toFixed()` 呼出を pct() ヘルパー経由に統一、MIN_DATE_C96="2026-05-01" で 4 月以前選択不可ガード (不変条件 3 緊張を構造的封殺)。29/29 regression test 追加
- **c96-3 (HELP 個人別 + UI 整理 + buildDailyReportText)** ✅ PR #152 マージ済 (commit 28c8fce) — HELP 対応業態 (water/electric/locksmith) × effectiveAreas の最大 11 ペア並列 fetch + aggregateHelpStaffByMonth 集約、業態混在時の title バー二重表示解消、buildDailyReportText に視点/期間ラベル拡張 (Modal 経路完全互換)

### c97 シリーズ: 未読バッジ機能 (LINE 型、案 B 拠点数、2026-06-05/06)
- **c97-1 (DB schema + API)** ✅ PR #153 マージ済 (commit 87cb4bc) — `read_states` テーブル新規 (user_id × area × cat、PK 3 列、最大 1,840 行) + `GET /api/unread-count` + `POST /api/unread-mark-read` (担当範囲外 403、30 秒スロットル) + 純関数 lib (getUserScopePairs / throttleSkip)。31 テスト pass
- **c97-2 (UI 配線)** ✅ PR #154 マージ済 (commit 324d061) — useUnreadCount hook (mount + 5 分タイマー + try-catch でロバスト化) + UnreadBadge (LINE 型: 赤丸 + 白文字、99+ cap) + NavBar/MobileHeader「日報」label 右上配置 + /daily-report 単一拠点表示時の自動既読化 (4 段 early-return ガード: !isExtendedMode / loading / 非単一 / 重複)。25 テスト pass
- **c97-3 (会社タブ切替不能バグ修正)** ✅ PR #155 マージ済 (commit f14b2f0) — c96-2 由来の 3 連続 updateUrl race condition (各 updateUrl 内の `searchParams.toString()` が同一 render サイクル内で古い値を返し、最後の呼出が前の更新を上書きで消す) を 1 patch 集約で解消。updateUrl JSDoc に設計原則「1 アクション = 1 updateUrl 呼出」明記
- **c97-4 (会社切替時 category 自動更新バグ修正)** ✅ PR #156 マージ済 (commit 9f0cff9) — c97-3 積み残し: ULUA/GriT's/SIKKEN で「ULUA / water」誤表示 (page.tsx 初期化 fallback "water" 固定が原因)。companies.ts に deriveCompanySwitchPatch 純関数追加 (単一事業会社はその事業を category にセット)、page.tsx 初期化 fallback を会社の categories[0] に変更。20 テストケース追加

### c98: 軽量 3 点 (単位注記 + 未割当タブ空メッセージ + KNOWN_ISSUES §1 解消マーク、2026-06-06)
- **c98** ✅ PR #157 マージ済 (commit 97961a8) — TargetsMatrix/MobileTargetCard に unitLabel 関数 + 入力欄ヘッダーに単位注記 (万円/円/件/%、目標管理異常値 645.6% 等の桁ミス再発防止)、/targets 未割当タブの空 assignments 時の空メッセージ追加 (UX 向上)、KNOWN_ISSUES.md §1 (entries PK 後勝ち上書き) を「✅ [解消] Phase 9.5 で対応済」マーク化 + /data-io の警告文撤去

### PR-1 / PR-2a / PR-2b: 未展開エリア解放 + 会社別ダッシュボード内訳テーブル + 横断集計クローズ (2026-06-07)
- **PR-1** ✅ PR #159 マージ済 — BUSINESSES マスター 14→32 ペア拡張 (未展開エリア 18 ペア追加) + DUNK に electric/kyushu、REXIA に electric/kitakanto 追加。未割当 16 ペア自動算出 (electric 3 + locksmith 6 + detective 3 + road 4)。UI 影響なし (会社別タブの「未割当」中身が増えるのみ)。**マージ後の本番障害は JWT_SECRET の Needs Attention が真因、PR-1 自体は無関係 (RUNBOOK §2 に教訓追記済)**
- **PR-2a** ✅ PR #161 マージ済 (commit 9ed129f) 本番稼働確認済 — 会社別ダッシュボード (viewMode="company") のヒーロー KPI 直下に事業×エリア内訳テーブル追加。`__all__`=32 / 通常会社=areas / `unassigned`=16 ペア。5 列 (売上/粗利/対応件数/客単価/広告費) + 「事業別で編集 →」ボタン。monthly-summary N 並列 fetch (ヒーローと同経路、不変条件 3 遵守)、Neon string レスポンスは normalizeNum で型ガード (c96-2 hotfix と同方針)。ヒーロー companyData useEffect (L306-346) 完全 untouch。純関数テスト 55/55 pass。**本番検証 (反さん 2026-06-07): DUNK 4 行 + REXIA 3 行で内訳縦計 = ヒーロー SUM が完全一致 (DUNK 売上 13,669,868/96 件、REXIA 15,281,860/136 件)、PR-1 で追加した電気×九州/北関東は実績 0 で「—」表示、クラッシュなし。番人 2 体 ✅ 通過**
- **PR-2b** ✅ 実装不要クローズ (本番検証で確定、2026-06-07 セッション②) — エリアタブ・日報とも未割当 16 ペアの表示・横断集計が PR-1 (businesses.ts 32 ペア拡張) + c96-2 hotfix (MIN_DATE_C96="2026-05-01" ガード) の組合せで既に完成済と確認。両画面は companies.ts ではなく businesses.ts (事業×エリア軸) を母集合にする設計のため、PR-1 拡張時点で READ 系は自動で 16 ペアを拾う構造。横断集計の母集合は (a) エリアタブ/事業別/グループ全体/会社別 = `monthly-summary`/`monthly-summary-bulk` 直読 (4 月以前安全)、(b) 日報拡張モード (3 視点+期間) のみ `range-aggregate` (entries 直 SUM) だが FilterBar の MIN_DATE_C96 ガードで 4 月以前を UI 上選択不可にして構造封殺、で網羅。本番 Chrome 検証 (反さん): エリアタブ事業切替で 32 ペア通り増減、電気×名古屋 (未割当) 正常描画、日報「未割当」タブ正常、事業別=電気で 7 エリア (割当 4 + 未割当 3) 描画。**コード変更ゼロ**

### PR #162: デプロイ毎再ログイン問題の根本対処 (2026-06-07)
- **PR #162** ✅ マージ済 (commit 5da6565、2026-06-07T11:15Z) — Preview と Production が同一 Neon DB を共有する構成 (DATABASE_URL=All Environments) で、旧 auth.ts:222 の「ログイン時に WHERE user_id=X で全 session DELETE」が Preview 検証ログインで本番 session を即無効化していた真因を解消。
  - **A 案**: ログイン時の一括 DELETE を撤廃、INSERT のみに (auth.ts:215-227)。複数 session 併存を許可
  - **C 案**: verifyToken の silent fail を撤廃、catch に `console.error("verifyToken failed", { reason })` 追加 (auth.ts:34-47)。reason のみ出力、token/payload/password は非出力
  - **運用変更**: 退職者の即時失効は「管理者によるユーザー無効化 (isActive=false)」のみで行う (users/route.ts:115 の WHERE user_id=X DELETE は維持)。ログイン時の自動セッション失効はもう無い。明示ログアウト = session_id 単位の destroySession() (auth.ts:259) は維持
  - **47 ユーザー運用への影響**: PC + スマホ等の複数デバイス同時ログインが可能に。デプロイ毎の再ログインも発生しなくなる
  - **検証**: 新規統合テスト 22/22 pass (`test:integration:auth-multi-session`) + regression 264/264 pass + invariant-guard ✅ 通過

### PR #164 (PR-3): /entry エリア select を businesses.ts 連動化 (2026-06-08、本番稼働)
- **PR #164 (PR-3)** ✅ マージ済 (commit c73a57c5、Production Active) — docs PR #163 の続き。旧 /entry は全事業 8 エリア固定で businesses.ts (32 ペア) 定義とズレ、静岡電気等のマスター外ペアが入力可能 = PK 整合性リスクがあった。各事業が定義通りのエリアのみ表示するよう変更 (水道 8 / 電気 7 / 鍵 7 / ロード 5 / 探偵 5 = 計 32)
  - **2 層ガード**: ① UI clamp (page.tsx + EntryForm.tsx) ② API 400 (api/entries/route.ts) で「マスター外ペアは書けない」を保証
  - **businesses.ts に追加**: `getAreasForCategory(cat)` / `clampAreaToCategory(area, cat)` / 定数 `DEFAULT_AREA_FOR_CLAMP = "kansai"` (clamp 先は配列先頭でなく明示定数 kansai 優先、areas[0] は 3 段目防御 = c96-2 hotfix の MIN_DATE_C96 と同方針)
  - **修正 2 (反さん指摘)**: category 切替時に state.area_id が前値保持される問題を `useEffect([category])` 内の明示 clamp で解消。useState initializer は mount 時のみ実行され、prop→state 同期 useEffect が存在しなかったため、業態切替後も旧 area_id が残り無効ペア化していた
  - **VALID_CATEGORIES 二重定義も解消**: page.tsx のハードコード列挙を `BUSINESSES.map(b => b.id)` 派生に統一 (category の真実を businesses.ts に一元化)
  - **CI**: 新規純関数テスト 36/36 + regression 264/264 = **300/300 pass**。invariant-guard ✅ 通過。number-verifier 不要
  - **本番 Chrome 検証 (反さん 2026-06-08、合格)**: 電気エリア select=7 (静岡消滅) / 探偵=5、shizuoka 直叩き → kansai clamp (修正 1)、category 切替 clamp (水道 kitakanto → 探偵で kansai 自動移動、修正 2)。**正のテスト**: 電気×名古屋 (未割当ペア) に実書込 ¥1,000 → 日報モーダル反映 → API GET count=1 で WRITE→READ 一気通貫を本番 DB 経由で確認。**検証データは Neon Console で DELETE 済** (electric/nagoya/2026-06-07 の 1 行、絶対不変 water 九州行は無傷)
  - **★ 検証ステータスの正直な記録 (将来の誤認防止)**: API 400 ペアガードは実機で `"category-area pair not in master"` を直接確認できていない。正しい POST body 形式不明でペアガード到達前に別の body バリデーション (`"bad body"`) が先行して弾いた。ペアガード自体は route.ts の `BUSINESSES.find(...).areas.includes` 実装 + CI 純関数テスト (36/36) で確認済。UI clamp (1 層目) が本番動作確認済のため実害リスクなし。**「実機 400 確認済」と誤認しないこと**

### PR #168: 前月同日比 UI改善（全5業態、2026-06-13）
- **PR #168** ✅ マージ済 (2026-06-13) — 全5業態セクション（water/electric/locksmith/road/detective）の前月同日比 UI を段階改善。
  - **表示形式**: `+15.1pt` → `+20.0% +¥20万` / `30.0% → 32.5%`（直感的な前後値表示）
  - **列幅**: 28/18/18/18/18% → 34/16/14/14/22%（指標列を広げて文字溢れ解消）
  - **サブテキスト**: 達成率列から指標列の2行目に移動（列の重なりを根本解消）
  - **ヒーロー KPI**: 「前月比」→「前月同日比」ラベル修正
  - **最終形**: バッジ背景なし・カラーテキストのみ（% 太字 fontWeight 700、絶対値 細字 opacity 0.7、Bloomberg スタイル）

### PR #170 / #172 + 鍵入電内訳 埋め戻し（2026-06-18）
- **PR #170** ✅ マージ済 (2026-06-18、commit fceef3d) — 会社別ビュー (`viewMode="company"`) に業態別 KPI セクションを並列表示（案B）。`aggregateSummariesByCategory()` 純関数で同一業態の複数エリア monthly_summary を合算（`total_profit` は各行 `resolveTotalProfit()` 確定後に加算＝コンサル費二重控除防止）。[DECISIONS.md D-011](./DECISIONS.md)
- **PR #172** ✅ マージ済 (2026-06-18、commit 0191a7f) — 鍵業態 入電2内訳 Phase B DB 化。`locksmith_car_lp_email_call_count` / `locksmith_inhouse_call_count` を monthly_summaries に追加 (`ALTER TABLE ADD COLUMN IF NOT EXISTS ... DEFAULT 0`、非破壊)。LocksmithForm の②入電2項目を LocalNumberField→NumberField（DB保存）に切替、aggregation/import-monthly/SameDayAggregate/ダッシュボードに配線。road の `road_*_call_count` と同型。会社別ビューは aggregateSummariesByCategory が全数値列を自動合算するため追加実装不要。
- **鍵 入電内訳 過去47日 埋め戻し** ✅ 本番適用済 (2026-06-18) — 現場エクセル（5/6月、車LP+メール/インハウス分離記録）を正として関西 locksmith 過去 entries に内訳を埋め戻し。`scripts/backfill-locksmith-call-breakdown.ts`（dry-run→`--apply`）。エクセル和とDB call_count が食い違う8日は call_count を上書き。**月次 call_count: 5月 1177→1172 / 6月 574→576、入電単価: 5月 8,362→8,397円 / 6月 9,373→9,340円**（売上・粗利・広告費・獲得件数は不変）。4月以前 monthly_summaries 完全不変をコード照合済。6/17 は DB未登録のため対象外（現場通常入力に委ねる）。[DECISIONS.md D-012](./DECISIONS.md)

### PR #174: 会社別ビューの前月同日比を実値化 + ヒーロー誤比較バグ修正（2026-06-18）
- **PR #174** ✅ マージ済 (2026-06-18T14:40Z、mergeCommit 8c06d643) — 会社別ビュー (`viewMode="company"`) の前月同日比を、各会社が実際に行う事業の前月実績と正しく突き合わせるよう修正。`app/components/Dashboard.tsx` のみ (+72/-8)。
  - **バグ（修正前）**: 会社別ビューは前月 entries を一切 fetch せず（prev/YoY effect が全て `viewMode==="business"` ガード + else クリアなし）、業態別 KPI セクションは `prevCalc={null}` で「—」、ヒーロー KPI は business 経路の **stale prevEntries（初期値=水道×関西）** と比較していた。例: ULUA 電気の当月を「水道関西の前月¥56M」と誤比較し前月同日比 -39.5% と誤表示。
  - **修正**: `companyPrevEntriesByCat`（会社の(業態×エリア)全ペアの前月 entries を `/api/entries` で取得し業態キーに連結、複数エリア同一業態は会社合算）→ `companyPrevSameDayByCat`（業態ごとに `canCompareSameDay`(4月以前ガード) → `filterEntriesByDay` → `aggregatePrevSameDay`、**既存 lib 流用で新計算式ゼロ**）→ `companyPrevSummary`（全業態合算、件数=`total_count||acquisition_count`）。`prevSummaryCalc` を `viewMode==="company"` 時に分岐（business 経路 `prevSameDayCalc` は完全不変）。業態別セクション5箇所の `prevCalc` を配線。
  - **検証**: `scripts/check-company-mom-prevday.ts`（READ ONLY、本番DB直読の独立検算）。TOPLEVEL 水道が本番スクショ実値と**1円単位一致**（売上-32.2% 差¥11,434,386 等）で手法を実値立証、ULUA 電気の正しい前月同日比は**売上-26.7%**（前月¥46.4M、旧-39.5%は誤比較）、REXIA 複数エリア水道の連結合算=エリア別合算で粗利差0、consultant_fee(202605~)前月反映・4月以前非混入を確認。number-verifier / invariant-guard 両番人合格、tsc緑、build緑、Preview で ULUA -26.7% 目視確認済。DB 書き込みなし。
  - **§10 事後一報 実施済**（現場が見る前月同日比の数字が会社別タブで変わるため）。

### PR #176 / #177: 日報の日付ナビ TZ ずれ + 鍵/ロード/探偵の件数バグ修正（2026-06-19）
- **PR #176** ✅ マージ済 (2026-06-19T02:36Z、squash commit d621e29) — /daily-report 単日ナビ ◀▶ が JST で「対象日+delta−1日」になる TZ ずれ（▶ が動かない/◀ が2日飛ぶ）の根本修正。原因は `new Date("...T00:00:00")`(ローカル基準パース)+`toISOString().slice(0,10)`(UTC基準出力)の混在。
  - 新規 `app/lib/dateUtils.ts`（TZ 安全な純関数 lib: isIsoDate/formatLocalDate/todayLocalISO/shiftDateStr、toISOString 不使用）に統一。FilterBar.tsx/DailyReportContent.tsx の日付送りを shiftDateStr 委譲、daily-report/page.tsx の todayISO→todayLocalISO、meetings/new・minutes/[series]/new の日付初期値も統一。
  - `handleDateChange` に `clampDate` 適用し、ヘッダー◀▶・カレンダー・FilterBar の全経路で MIN_DATE_C96="2026-05-01"（4月以前ガード §1）を統一（番人指摘の既存不整合を解消）。
  - 新規 test-date-utils 18/18 pass（TZ=Asia/Tokyo 強制で旧バグ回帰封じ）、tsc/build 緑、invariant-guard 合格。
- **PR #177** ✅ マージ済 (2026-06-19T02:36Z、squash commit 2a6bad1) — /daily-report 拡張モード（会社別/事業別/グループ）で鍵・ロード・探偵の「対応件数」が 0件・「客単価」が「—」になるバグの根本修正。原因は range-aggregate API の `total_count` が全業態で「応答件数の和」固定で、acquisition_count で数える業態は 0 → unit_price=売上÷0=0 になっていた（本体 Dashboard は `total_count||acquisition_count` フォールバックで正しく表示していた＝非対称が真因）。
  - `app/api/range-aggregate/route.ts` 両 CTE で件数を業態別分岐（water/electric=応答件数、locksmith/road/detective=acquisition_count）。groupBy="none" は base CTE に行ごと条件付き SUM `sum_effective_count` を追加（業態混在でも各業態を自分の定義で合算）。unit_price は既存式で自動追従。
  - **monthly_summaries/monthlyAggregation は非変更**（本体フォールバックで実害なし、DB再集計回避）。range-aggregate は READ ONLY、DB書き込みなし。
  - **本番実データ検算**: 修正後 SQL で鍵/関西/2026-06 = 289件・¥34,851 → 本体スクショと1件・1円一致（`scripts/check-locksmith-count-debug.ts`、READ ONLY）。test-range-aggregate 24/24 pass（鍵 total_count=7[acquisition] を罠の応答3と区別、混在 merged=17 を新規アサーション）。number-verifier/invariant-guard 両番人合格。
  - **§10 事後一報 対象**（現場が見る鍵/ロード/探偵の件数・客単価が「0/—」→実値に変わる）。

### 年次(YTD)ビュー 新設 + ダークモード無効化（2026-06-21）
- **年次(YTD)ビュー** ✅ マージ済 — 月次に加え暦年の年初来累計（2026年5月〜当月）を表示する独立ルート `/year` を新設。月次トップバーに月次/年次トグル（年次=`<Link href="/year">`）。事業別（業態タブ＋全エリア/エリア）・会社別（会社/全社合計）対応。ヒーロー＝YTD実績＋目標比＋目標（入力済み月の合計）。着地予測・前年比なし、赤字は真の負値表示。業態別 Section は既存5種を再利用。Gemini 独立設計レビューで4盲点（損失消去・hookライフサイクル・スナップショット重複・率合算）を設計段階で封殺。
  - **PR #179** (squash b14a94b) — slice1: `app/lib/yearAggregation.ts` 純関数（YTD合算、`YTD_MIN_YYYYMM=202605` で4月以前ガード、粗利は合算後1回導出で損失消去回避、率は総額再計算、スナップショットMAX月、件数fallback）＋ test 22件。number-verifier/invariant-guard 合格。
  - **PR #185** (squash 95468be) — slice2-4 統合: `useYearAggregate` hook ＋ `targetsRow.ts` ＋ `targets-bulk?full=1`（READ ONLY）／`/year` ＋ `YearView.tsx`（Dashboard.tsx は月次/年次トグルのみ +6/-0、14 effect不変）／目標表示を案A（月次と同じ目標比）に統一（[D-013](./DECISIONS.md)）。test:targets-row 17件。両番人合格。
    - ※ 当初 stacked PR #180/#181/#182 だったが #179 の squash で分岐したため、現 main に cherry-pick して #185 に統合（中身同一）。#180-182 はクローズ。
  - **PR #184** (squash 13cd2c4) — ダークモード無効化: Next.js テンプレ由来のダーク残骸（OSダーク時 `dark:bg-black` で背景黒、年次ビューの空白部で露出）を `globals.css` の `@custom-variant dark` クラス方式化＋`prefers-color-scheme: dark` 撤去で全ページ白基調固定（§4.5）。CSSのみ。
  - **本番実データ検算**: 関西水道 YTD 売上156,093,791/粗利48,454,565/31%/1,042件、関西鍵 44,032,370/23,910,170/54.3%/1,012件が手計算と1円一致。本番に実在の1〜4月行をガードが全除外することも実証（READ ONLY スクリプト、`/tmp` 退避・非コミット）。
  - **§10 事後一報 対象**（現場に「年次タブ追加」「背景白化」が出る）。
  - **後続候補（任意）**: 年次の「グループ全体」タブ追加（現状は会社別→全社合計で代替可）。年間予算（期初一括入力）は [BACKLOG](./BACKLOG.md) に記録（IPO予実管理の土台、D-013 将来項）。
  - **見送り**: 「ナビが Ctrl+Shift+R しないと出ない」件は調査したが本番の通常リロードで正常表示＝観測バグ無し。PR #183（/api/me no-store 予防策）は取り下げ・完全削除。

### 保留中
- ⚠️ **water 5/6 月コンサル費の実額入力 (現場運用)**: 2026-06-02 c95-D-4 apply 時点で water 5月の entries.data.consultant_fee は 217 行中 3 行 (chugoku 5/1-5/3) のみ has_key 状態。slice 4 マージで profit が約 +2,790 万円 跳ね上がっており、現場 (各エリアマネージャー) が実額入力を進めて初めて正しい粗利に収束する。**現場周知 + 入力催促が運用上の最優先課題**
- **c95-C** 残作業（日報の独立ページ化 + モバイル対応 + LINE 画像共有）— C-1 完了、C-2〜C-5 着手可能
  - **c95-C-2**: `/daily-report` 独立ページ + ナビ追加 (NavBar.tsx / MobileHeader.tsx の `/entry` 直後に「日報」)。URL クエリ `?area=&category=&date=`。PC layout、`<DailyReportContent>` 再利用 (C-1 で抽出済)。Modal と並走 (cutover は C-5)
  - **c95-C-3**: モバイル B 案（セクション折りたたみ、①と⑤展開・③④⑥折りたたみ、見出しに要約値）。`<CollapsibleReportSection>` ラッパー方式（既存 Section 改修なし）
  - **c95-C-4**: LINE 画像共有 (`navigator.share` に html-to-image の PNG File を載せる、show-mobile のみ、PC は C-1 で保持済の 3 段 fallback 流用)
  - **c95-C-5**: cutover (EntryForm の「📋 日報を表示」pill を `<Link href="/daily-report">` に置換、DailyReportModal.tsx 削除、docs 更新)
  - モック: `docs/mocks/daily_report_pc_v2.html` / `daily_report_mobile_v2.html` として配置 (C-2/C-3 同 PR 内で作成予定)

### 過去 Phase 履歴（2025〜）
- Phase 1〜6: ダッシュボード基本機能、各ページ実装
- Phase 7: グループ全体クロス比較セクション（PR #8）
  - 鍵カテゴリ広告比 44.9% を発見（突出して高い）
- Phase 7.5: マトリクスページのデザイン融合リファクタ（PR #9）
  - 緑グラデ UI を白カード+深緑アクセント (`#1B5E3F`) に統一
- Phase 8: マトリクステーブル拡張（PR #10）
  - 横軸 13〜45%、縦軸〜1.5 億 動的刻み、鍵カテゴリ 45% 🔑 ハイライト
- c87〜c95: 入力経路改修、HELP リッチ化、コンサル費控除、日報モーダル等（c95 系は §7 上段の現役 / 保留中を参照）

---

## 8. 既知の運用メモ

### 反さんについて
- 反さんは非エンジニア出身の独学ビルダー。DB 操作・git 操作は CC に寄せる。SQL を反さんに手実行させない。
- 役職: SIKKEN グループ 専務取締役。拠点: 大阪エリア。コードは読めるが書けない。
- ビジネス側・経営側の判断は明確に持っている。**「なぜそうするのか」を説明すれば判断できる**。逆に「なんとなくこうした方がいい」では運用に乗らない。

### 指示の好み
- 1 ステップずつ提示 → 実行 → 確認 → 次のステップ
- 大きな変更前は必ず提案してから着手
- 不明な点は推測せず質問
- 日本語で対応

### NG パターン
- 「自動でこれもやっておきました」系の暴走
- 大規模リファクタを一気に走らせる（過去にペースト型大改造で 7 エラー → git reset の経験あり）

### 反さんが苦手で CC に委ねたい分野
- パフォーマンスが重要な大規模変更（仮想スクロール等の判断）
- TypeScript 型エラーの読解
- React レンダリング最適化（memo / useMemo の適切な配置）
- DB マイグレーション
- 環境変数まわり（Vercel、Neon）

→ これらは CC の判断に委ねるが、**判断理由は説明すること**。理解できないと運用に活かせないため。

### 作業フロー
- 作業依頼は「監督が自然言語で指示 → CC が調査計画 → 承認 → 実装検証報告」のループ。
- 本番視覚確認は反さんがスクショで行う（Chrome 拡張は不安定なため、拡張に依存しない）。
- テストは tsx スクリプト（`scripts/test-*.ts`、`npm run test:integration:*`）。現在 312 件（純関数 271 + DB 41）pass。
- 重要な判断をしたら [DECISIONS.md](./DECISIONS.md) に記録する（なぜそう決めたか、却下した代替案も）。
- UI を変更したら [VISUAL_CHECKLIST.md](./VISUAL_CHECKLIST.md) に沿って目視確認。本番トラブル時は [RUNBOOK.md](./RUNBOOK.md)。
- 新メンバー引き継ぎ時は [ONBOARDING.md](./ONBOARDING.md) を参照。
- 着手未確定のアイデアは [BACKLOG.md](./BACKLOG.md) に溜める。やると決まったら §7 保留中に移す。
- タスクが完了したら CLAUDE.md §7 進行状況を都度更新する（CLAUDE.md を生きた進行管理表として維持）。

---

## 9. 旧運用記録（archive）

※ 旧運用。現在は **CC 一本 + サブエージェント運用（§0.5 参照）**。下記は履歴記録として残置。

### 旧: 質問・相談相手の使い分け（Web Claude 引退前）

| トピック | 推奨 |
|---|---|
| コード実装・ファイル編集・テスト | Claude Code（このセッション） |
| 経営戦略・組織設計 | Web Claude（claude.ai） |
| 投資家向け資料作成・市場調査 | Web Claude（claude.ai） |
| デザイン方針の哲学的議論 | Web Claude（claude.ai） |
| Phase の進捗管理・引継ぎ | 両方（Web Claude が長期記憶担当） |

→ 2026-06 月以降、CC 一本化により Web Claude 列は使われない。

---

## 10. 複数人並行作業のルール

3 人（反専務 + メンバー 2 名）が各自の環境で同じリポジトリを触る。同時に同じ場所は触らず、タスク/ブランチを分けて GitHub で合流する。

### 担当中タスク（着手時に書き、完了したら消す）
| タスク | 担当 | ブランチ |
|---|---|---|
| (例) c95-C-1 | 反 | feature/c95-c-1 |
| (例) c95-B-4b | メンバー A | feature/badge |

※ここを見れば「今 誰が何を触っているか」が分かる。着手前に必ず確認し、自分のタスクを追記する。

### ルール
- タスクごとに別ブランチ（`feature/` `fix/` `chore/`）。1 人 1 ブランチ 1 タスク
- 着手前に上の「担当中タスク」を確認し、自分のタスクを追記する
- 共有ファイル（`Dashboard.tsx` / `kpiCompute.ts` / `monthlyAggregation` 等、複数機能が依存するファイル）を複数人が同時に触る場合は、着手前にチームで調整する
- マージは番人検証通過が必須（§0「マージのルール」参照）。重大変更はチーム 1 人がレビュー
- 他人のブランチには触らない。自分の PR が先にマージされたら、他メンバーは自分のブランチを最新 main に追従させる（`git pull origin main` → merge or rebase）
- コンフリクト（競合）が起きたら、慌てず推測で解決せずチームに報告（[RUNBOOK.md](./RUNBOOK.md) 参照）
- 全権限を持つが、§0「チームに一報してから実行する操作」は独断禁止

### 報告ルール（マージ後・本番反映後の一報）
3 人が各自の環境で並行作業すると、GitHub 通知だけでは「何が・なぜ起きたか」がチームに伝わりにくい。本人が意味を一言添えることで、監督（反）が把握しないまま本番が変わる事態を防ぐ。

- **PR をマージしたら、チーム連絡（Slack 等）に「何を・なぜマージしたか」を 1 行報告**する。例:「PR #131 マージ。§6 を 3 人体制版に更新、§0 との矛盾期間を解消」
- **経営数字に関わる変更**（粗利・売上・KPI 計算式、コンサル費等の控除、aggregation 経路）や **本番 DB を書き換える操作**（re-aggregation / マイグレーション / DELETE 系）は、マージ/実行後に**必ず 3 人に共有**する。事後でよいが省略不可。
- GitHub の Watch（All Activity）で機械通知は届くが、本人が意味を一言添える。通知 ≠ 説明。
- 監督（反）が把握しないまま本番が変わらないようにする。これは §0「チームに一報してから実行する操作」(事前一報) と対になる **事後の報告ルール**。事前一報項目以外の通常マージも、最低 1 行の事後報告は出す。

### 各メンバーの CC への指示
作業開始時に、このセクション（§10）と「担当中タスク」表を必ず確認すること。複数人が並行作業しているため、自分のタスク以外のファイルを触る時は特に慎重に。マージ後は上記「報告ルール」に従い 1 行報告を忘れない。
