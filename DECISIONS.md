# DECISIONS.md — 意思決定ログ(ADR)

このプロジェクトの重要な判断を「なぜそうしたか」ごと記録する。
新メンバー・CC・将来の自分が「なんでこうなってるんだ?」と思った時にここを見る。
過去の判断を蒸し返す前に、まずここで「却下された代替案」を確認すること。

形式: 1決定 = 1エントリ。新しい決定は上に追記する。

---

## D-011: 会社別ビューは「案B（業態別セクション並列表示）」を採用 (feature/company-view-case-b)
- 日付: 2026-06-13（初回）→ 2026-06-13（案A→案B 再決定）
- 決めたこと: 会社別ビュー (`viewMode="company"`) に、その会社が担当する業態分の KPI セクションを並列表示する。Mavericks（水道のみ）→ 水道セクション1枚、DUNK（水道+電気+ロード）→ 3セクション縦並び。`targets=emptyTargets()` / `prevCalc=null` を渡すため目標列は「—」、前月同日比列は「—」。
- なぜ（案A→案B 再決定の理由）: 経営陣は会社別ビューでも「①コスト構造 / ②広告効率 / ③施工 / ④HELP」の詳細KPIを確認したい要件があり、CompanyBreakdownTable（合計行）だけでは情報量が不十分と判断。案Aで懸念された「合算再計算ロジック」は `aggregateSummariesByCategory()` 純関数（`app/lib/company-aggregations.ts`）で封じ込め、各 Section コンポーネントへは合算済み monthlySummary を渡すことで既存コンポーネントをそのまま再利用できる設計を Gemini DeepThink（v2 コンテキスト、2026-06-13）が確認。
- 最重要設計決定: `total_profit` は合算前に各行を `resolveTotalProfit()` で確定してから加算する（コンサル費の二重控除防止）。`prevCalc=null`（前月同日比は「—」）は案 i を採用（案iiは当月途中 vs 前月フル比較で常にマイナス誤認が発生するため却下）。
- 却下した代替案:
  - **案A（シンプル）**: 業態別セクション非表示 → 当初は採用したが、経営陣の要件（詳細KPI確認）を満たせないため再却下
  - **案C（中間）**: 共通指標のみのサマリーカード → 案Bと同等の実装コストで情報量が少ないため不採用
- 参照: `docs/specs/AI_CONTEXT_COMPANY_VIEW_WITH_CODE.md`（v2、Gemini DeepThink Q1〜Q4 相談結果）

---

## D-010: 水道コンサル費は「売上 × 7.7% 自動計算」から「実額の手入力」に切替 (c95-D で完全移行)
- 日付: 2026-06-02
- 決めたこと: 水道業態のコンサル費控除を、c95-B シリーズで実装した「売上 × 0.077 自動計算」から「monthly_summaries.consultant_fee / entries.data.consultant_fee に実額を手入力」する方式に完全変更。c95-D で 6 slice に分けて段階的に切替えた。
- なぜ: 実運用要件は「実額の手入力」であって 7.7% の固定率ではなかった (c95-B 着手時の要件取り違え)。月毎 / 拠点毎にコンサル契約金額が異なる + 契約なしの月もあるため、固定率では現実と乖離する。「いつ・いくら・誰のコンサル契約か」を現場が直接記録できる UI が必要。
- スコープ (water 業態のみ、他 4 業態 untouch):
  - **slice 1+2** (PR #143): `monthly_summaries.consultant_fee NUMERIC NOT NULL DEFAULT 0` 列追加 + water ②コストに「コンサル費」手入力欄追加 (5 項目目、subtitle「入力 5項目」)。粗利計算経路は untouch、過去データ表示変動 0 円
  - **slice 3** (PR #145): form-level (`useFormCalculations.ts`) を `state.consultant_fee` 直接控除に切替
  - **slice 4** (PR #146 + re-aggregate apply 実行済): aggregation SQL の water 分岐を 3 段 CASE に再構成、`- b.sum_consultant_fee` 直接控除。slice 4 リリース時点で本番 DB の 5/6 月 water 12 行を再集計、約 +2,790 万円 跳ね上がり (現場入力ほぼゼロのため旧 7.7% 自動分が外れた)
  - **slice 5** (PR #147): day-level (`kpiCompute.ts` / `WaterDailyReportSection.tsx`) + read fallback (`profit.ts`) を手入力ベースに切替。`CONSULTANT_FEE_RATE.water` を 0.077 → 0 に無効化
  - **slice 6** (本 PR): UI バッジ文言「コンサル費 7.7% 控除済」→「コンサル費 (手入力) 控除済」に置換、`AutoCalcDisplay` subtitle 文言修正、`consultantFee.ts` の `CONSULTANT_FEE_RATE` / `consultantFee()` 関数を完全撤去 (月境界定数 `CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605` と `toYyyyMm` のみ残置)。docs 更新 (D-001 / D-002 / D-003 / D-006 / D-007 archive 保持、本 D-010 を最新方針として記録)
- 絶対不変保護: 4 月以前 water 109 行は 6 配線全てで `yyyymm >= 202605` ガード、表示値変動 0 円を維持。他業態 (electric/locksmith/road/detective) の粗利式は完全 untouch
- 却下した代替案:
  - 自動 7.7% 維持 + 手入力 override: UI が複雑化、ユーザーが「7.7% が default か手入力か」混乱する。完全手入力に統一する方が明快
  - 月境界 (202605) も撤廃: 4 月以前 monthly_summaries 109 行の絶対不変項目を保護する必要があるため、月境界ガードは手入力ベースでも維持
  - re-aggregate 実行を slice 4 で先送りせず slice 6 まで遅延: 入力中の form 粗利 (slice 3) と本番ダッシュボード粗利 (旧 7.7%) が長期乖離 → 現場混乱。slice 4 で即 apply し乖離期間を最小化
- 関連 archive (旧設計の歴史記録、後続セッションが背景理解のため参照):
  - D-001 (2026-05): コンサル費を粗利前に変動費として引く判断 → c95-D でも維持 (sum_consultant_fee も粗利前)
  - D-002 (2026-05): 基数 = 全体売上、率を中央マスター管理 → c95-D で「率」概念は撤廃、「実額」を中央 DB 列に。中央マスター = `monthly_summaries.consultant_fee` / `entries.data.consultant_fee`
  - D-003 (2026-05): 2026年5月以降のみ適用 → c95-D でも維持 (`CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605` の月境界ガード)
  - D-007 (2026-05): import-monthly 経路を保留 (KNOWN_ISSUES #8) → c95-D-1 で 6 レイヤー対応により Excel 側に consultant_fee 列を含めれば構造的に解消、保留解除
- 学び: 「率を仕様化」してから実装すると、要件取り違えに気づきにくい (率は数字として確定して見える)。「数字を入力する場所」を仕様化していれば早期に気付けた。次回からは「ユーザーが何を入力するか」を最初に決める。

## D-009: 「マージ済」の記録は記録者が git log/gh pr view で実マージを確認してから書く
- 日付: 2026-06-01
- 決めたこと: §7 進行状況 / DECISIONS / KNOWN_ISSUES / ONBOARDING 等に「マージ済」「実装済」と記録する前に、記録者(人/AI を問わず)が必ず `gh pr view <PR#> --json mergedAt,state` または `git log --merges --grep="<branch名>"` で実マージ commit の存在を確認する。他者(user/Web Claude/CC)から渡された「マージ済」情報も、写す前に同じ手順で検証する。
- なぜ: 2026-06-01 c95-C Step 1 調査で、c95-A-3 hotfix (commit b168830、3段fallback) が CLAUDE.md §7 / DECISIONS D-004 / ONBOARDING / KNOWN_ISSUES の 4 箇所で「✅ マージ済」と記録されていたが、実際は stale branch `fix/c95-a-3-share-intent-line-fallback` に commit が残っているだけで **PR 未作成・main 未マージ**だった。実コード grep で `navigator.share` / `line.me` が hit ゼロで発覚 (DailyReportModal.tsx onShare は `mailto:` 一本のまま)。
- 根本原因 (二重伝播):
  1. Web Claude (claude.ai、当時 CC とのコピペ中継役) が、反さんの「マージしておいて」報告を受けて実マージを確認せず「マージ済」としてドキュメントに書いた
  2. 本セッション (2026-06-01) で CC が CLAUDE.md 統合 (commit 659f7f8) する際、user 提供の §7 内容を git log で検証せず写した
  3. 結果: 1 か月後に c95-C Step 1 の実コード grep で初めて乖離発覚
- 一般化: 人/AI を問わず、マージ済の記録は記録者が git log で実マージを確認してから書く。他者から渡された「マージ済」を写すときも、写す前に検証責任がある。検証なしで写すのは、誤りの伝播に加担すること。
- 却下した代替案: CI で「§7 の ✅ 項目を git log と照合」自動化 → 仕組み複雑、手動ルール + invariant-guard で十分。将来必要なら導入検討。
- 対応:
  - CLAUDE.md §5 末尾に検証ルール追記 (本 PR で実施)
  - 教訓を本 D-009 として記録 (本 PR で実施)
  - 当該 c95-A-3 hotfix は PR #128 で b168830 を正式マージ (2026-06-01)、実態とドキュメントが一致
- 学び: ドキュメント更新は「コミット行為」と同じ責任を持つ。書く前に grep / git log を回す癖をつける。

## D-008: 開発体制をマルチエージェント(implementer + 2番人)に移行
- 日付: 2026-06-01
- 決めたこと: Web Claude(claude.ai)を経由する3層コピペ運用をやめ、VSコード内の Claude Code 一本 + サブエージェント(number-verifier / invariant-guard)で回す体制に移行。
- なぜ: 人間がコピペで配線するのが最大のボトルネックだった。CC一本にすると速いが「第三者レビューの目」が消える。そこで番人エージェントを立て、実装AIと検算AIを分けて互いに検証させることで、速度と検証の両立を狙った。
- 却下した代替案:
  - 完全CC一本(番人なし) → 自分のコードのバグは自分で見つけにくい。却下。
  - ハイブリッド(危険時だけ人間がWeb Claudeに貼る) → コピペ往復が残る。却下。
  - 別モデル(GPT/Gemini)で番人 → 本当に独立した視点だが設定・コスト重い。将来の選択肢として保留。今はClaude純正Subagentで開始。
- 補足: 第三者(Web Claude)は「最後の保険」として、CLAUDE.md の第三者レビュー条件の時だけ呼ぶ。

## D-007: コンサル費は profit.ts fallback にも控除追加するが、import-monthly経路は保留
- 日付: 2026-06-01 (c95-B-4)
- 決めたこと: read fallback(profit.ts)にもwater 7.7%控除を追加。ただし /api/import-monthly(Excel直接INSERT)経由の控除前profitが過大表示される潜在バグは、今は直さず c95-B-5 に保留+警告記録。
- なぜ: 現状 import-monthly 経由の water 5月以降データは0件で実害なし。スコープを広げず、まず確実な経路を固める。ただし将来Excel importすると粗利+7.7%過大になる地雷なので、記録を残す。
- 却下した代替案: import-monthlyを今すぐ直す → スコープ肥大、現状実害ゼロなので優先度低。保留。
- ⚠️ 重要: water 2026年5月以降データを Excel import すると粗利が過大表示される。c95-B-5対応まで避ける(KNOWN_ISSUES.md §8 参照)。

## D-006: コンサル費控除バッジは過去月では非表示
- 日付: 2026-06-01 (c95-B-4)
- 決めたこと: 「コンサル費7.7%控除済」注記バッジは yyyymm >= 202605 の時だけ表示。
- なぜ: trends等で2025年や2026年4月を表示した時に「2026年5月〜控除」バッジが出ると、過去にも控除されたと誤認される。

## D-005: 日報を独立ページ化(モーダル廃止)+ モバイルB案
- 日付: 2026-06-01 (c95-C設計)
- 決めたこと: 日報を /entry 内モーダルから独立ページ /daily-report に。ナビに「日報」タブ追加。モバイルはセクション折りたたみ(①と⑤展開、③④⑥折りたたみ)。LINE画像共有はモバイル主動線。
- なぜ: 日報は「入力」でなく「閲覧・共有」が目的でモーダルは動線が不自然。スマホで開くとモーダルが崩れた。独立ページなら最初からレスポンシブに作れる。
- 却下した代替案:
  - モーダルのまま中身だけスマホ対応 → 継ぎ接ぎになる。作り直す方がきれい。却下。
  - モバイル全項目を縦スクロール(A案) → 長すぎる。折りたたみ(B案)採用。
- 制約: ロジック層(kpiCompute/helpStats/Section/buildText)は触らず、表示の器だけ作り替え。

## D-004: LINE共有は Web Share API → line.me → mailto の3段fallback
- 日付: 2026-06-01 (c95-A-3 hotfix)
- 決めたこと: 旧実装(mailtoのみ)を3段fallbackに。テキストのみ(画像は別ボタン)。AbortError(ユーザーキャンセル)は何もしない。
- なぜ: 旧実装はLINE共有不可だった。スマホ(navigator.share)でOS共有シートにLINEが出るようにした。デスクトップのline.meは確実でないが、最終的にmailtoに落ちるので害なし。
- 補足: PCでの画像LINE共有は技術的に不可(LINEはURL経由で画像を送れない)。画像はモバイルのnavigator.share files経由(c95-C)か、手動でDLしてLINE添付。

## D-003: コンサル費控除は「2026年5月以降のみ」適用(過去に遡及しない)
- 日付: 2026-05-31 (c95-B、最重要決定)
- 決めたこと: water事業のコンサル費7.7%控除は yyyymm >= 202605 のみ。2026年4月以前のデータには適用しない(控除0)。
- なぜ: 4月以前データ(water 109行)は絶対不変項目。遡って控除すると過去の粗利が変わって見える=重大事故。aggregation書き込み時のみ控除し、過去DBは触らない方式((W)案)を採用。
- 却下した代替案:
  - 全期間遡及で再集計((X)案) → 109行のDB値が変動。絶対不変違反。却下。
  - read時に派生控除((Y)案) → 過去表示が遡って下がる。却下。
- トレードオフ: 5月で粗利が構造的に下がる「段差」が出る。これは正しい挙動なので、注記バッジ(D-006)で「バグでなく仕様」と示す。

## D-002: コンサル費の基数は「全体売上(業務委託売上+内勤社員売上)」、率は中央マスター管理
- 日付: 2026-05-31 (c95-B)
- 決めたこと: コンサル費 = 全体売上 × 0.077。率と月境界は app/lib/consultantFee.ts の定数(CONSULTANT_FEE_RATE / CONSULTANT_FEE_APPLIED_FROM_YYYYMM=202605)で中央管理。SQL内ハードコード禁止。
- なぜ: 過去のExcel損益分岐モデルに忠実。率を中央管理すれば将来電気等への展開も容易、テストも書きやすい。

## D-001: コンサル費控除は粗利の「前」に変動費として引く(粗利自体を下げる)
- 日付: 2026-05-31 (c95-B、A案)
- 決めたこと: 粗利 = 売上 − (職人費+材料費+広告費+営業外注費+カード手数料+コンサル費)。粗利そのものを下げる。
- なぜ: Excelモデルが「限界利益(粗利)段階で変動費としてコンサル費を含める」設計だったため忠実に再現。
- 却下した代替案: 粗利は据え置き、営業利益段階で別途控除(B案) → 粗利の定義を変えない分影響は小さいが、Excel設計と乖離。却下。
- 影響: 粗利を参照する全画面(ダッシュボード/ランキング/推移/マトリクス/損益分岐/CF/日報/エクスポート)に波及。
