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
- **コンサル費控除（c95-B、water のみ）**: 粗利からさらに `売上 × 0.077` を控除。**2026年5月以降（yyyymm >= 202605）のみ**適用。4月以前は控除 0。率・月境界は `app/lib/consultantFee.ts` の定数を使い、ハードコード禁止。
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
| 6 | `git checkout main && git pull --ff-only origin main && git branch -d <branch>` でローカル同期 | 担当者 + CC | ローカル main が遅れていたら必ず先に同期 |

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
- **c95-D 方針転換決定**（2026-06-02）✅ 反さん承認済 — コンサル費を「売上×7.7%自動計算」から「実額の手入力」に変更。water のみ。c95-B 全機能を slice 単位で手入力ベースに切替予定。
- **c95-D-1（slice 1+2: スキーマ + UI 追加、粗利不変）**（2026-06-02）✅ PR #143 マージ済 (commit 23d8ee9) — `monthly_summaries.consultant_fee NUMERIC NOT NULL DEFAULT 0` 列追加 + water ②コスト 5 項目目「コンサル費」手入力欄を新設 (water のみ、subtitle 入力 5項目)。粗利計算経路は untouch (旧 c95-B 7.7% 自動控除が生きたまま、consultant_fee は列に保存するだけで profit 式に未組込)。water 5月以降 7 行 / 4 月以前 109 行 / 他業態すべて差分 0 円。number-verifier + invariant-guard 両方 ✅。マイグレ SQL: `scripts/migrations/c95-d-1_add_consultant_fee_column.sql` を Neon Console で要実行 (冪等 IF NOT EXISTS)。

### 保留中
- **c95-D 後続 slice 3-6（water 粗利を手入力ベースに切替）**:
  - **c95-D-2 (現場運用)**: water 5月以降 7 行 (kanto/kyushu/関西/北海道) で現場が `consultant_fee` 実額入力を完了する。slice 3 マージ前に必須 (全 0 のまま slice 3 マージで粗利が +7.7% 跳ね上がるため)
  - **c95-D-3 (aggregation 切替)**: `monthlyAggregation.ts` の water 分岐 `d_total_profit` を `revenue × 0.077` 控除から `sum_consultant_fee` 直接控除に変更。同時に `re-aggregate water 5月以降` 実行
  - **c95-D-4 (day-level 切替)**: `useFormCalculations.ts` f30 + `kpiCompute.ts` の `consultantFee(category, sales, yyyymm)` 呼び出しを `state.consultant_fee` 直接控除に変更
  - **c95-D-5 (read fallback 切替)**: `profit.ts` の `derived -= consultantFee(...)` を `derived -= summary.consultant_fee` に変更
  - **c95-D-6 (旧 7.7% 撤去)**: `consultantFee.ts` 削除 (CONSULTANT_FEE_RATE 定数も) + `<ConsultantFeeBadge>` の自動計算文言を「手入力」に更新 + docs / CLAUDE.md §4 更新
- ⚠️ **c95-B-5（最優先・経営数字の静かな破綻リスク）**: water 2026年5月以降データを `/import-monthly` (Excel) 経由で投入するとコンサル費 7.7% 控除が抜け、ダッシュボード粗利が **+7.7% 過大表示** になる。`/api/import-monthly` は `monthlyAggregation` 経路を経由せず `total_profit` を直接 INSERT する独立経路 (`source='file_import'`) のため。c95-B-2 / B-3 / B-4a / B-4b は entries 経由のみカバー。**対応完了まで water 5月以降の Excel import は禁止**（[KNOWN_ISSUES.md §8](./KNOWN_ISSUES.md) に詳細・検出 SQL・運用ガード明記）。現状本番 DB は entries_aggregation のみで未発火、ただし新メンバー / 将来運用変更で容易に踏む。**注**: c95-D-3〜D-6 で手入力ベースに移行すれば本問題は構造的に解消する (Excel import 時も consultant_fee 列を Excel から読み込む 6 レイヤー対応は c95-D-1 で既に完了済)。
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
