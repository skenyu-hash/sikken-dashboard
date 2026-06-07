# RUNBOOK.md — 緊急時・トラブル対応手順

本番で何かおかしくなった時、慌てず ここを見る。
原則: **慌てて推測修正で深掘りしない。まず状況を確認し、迷ったら戻す。**

---

## 0. 大原則
- 本番DBを書き換える前に、必ず Neon でスナップショット(ブランチ)を取る。
- 不可逆な操作(DELETE、過去データ更新)は、実行前に必ず反さんの明示ゴー。
- 迷ったら git reset で一旦戻す(推測で修正を重ねない)。過去にペースト型大改造で7エラー→reset した教訓。

---

## 1. 本番ダッシュボードの数字がおかしい
1. まず「いつから」「どの業態・エリア・月で」おかしいかを特定(スクショを撮る)。
2. CCに「該当の数字を実データ(DB)から逆算して。画面値と一致するか」と number-verifier で検算させる。
3. 切り分け:
   - DB値が正しく画面表示だけ変 → 表示ロジック(Section/kpiCompute)のバグ。コード修正。
   - DB値自体が変 → aggregation か re-aggregation の問題。§3へ。
4. 直近のデプロイ/マージが原因の可能性 → §2(ロールバック)。

- 補足: 過去に「画面値が検算と合わない」と疑った件は、検算する人間側の項目漏れ(広告費の引き忘れ)が原因だった。画面値を疑う前に、自分の手計算に全コスト項目(職人/材料/広告/営業外注/カード/コンサル費)が入っているか確認する。

## 2. デプロイで本番が壊れた(画面が出ない/エラー)

### Step 0: ★まずネットワークログ(API ステータス)を見る★ (2026-06-07 PR-1 インシデント教訓)
**外形(DOM 消失・画面真っ白)だけで原因推定しない。** 直前マージ PR を真っ先に疑うのは罠 (PR-1 では JWT_SECRET が真因なのにコードを 1 時間疑って迷走)。

1. Chrome DevTools (or Claude in Chrome `read_network_requests`) で **`/api/me` / `/api/unread-count` / `/api/entries` 等 認証必須 API の HTTP ステータスを確認**:
   - **全て 401** → 認証層(JWT/Cookie/環境変数)の問題。コード無関係の可能性高。Step 1 環境変数チェックへ
   - **全て 500** → DB 接続 or aggregation エラー。DATABASE_URL / monthlyAggregation を疑う
   - **一部だけ 401/500** → 特定 API のリグレッション。Step 2 ロールバックへ
   - **全て 200 で値が変** → 表示ロジックの問題。§1 へ

### Step 1: 環境変数の「Needs Attention」チェック (2026-06-07 教訓)
本番障害が API 401 由来なら、まず Vercel Environment Variables の「Needs Attention」状態を疑う:
1. Vercel ダッシュボード → Settings → Environment Variables を開く
2. 各環境変数 (特に **JWT_SECRET / DATABASE_URL / *_PASSWORD 系**) の右に「Needs Attention」マークがないか確認
3. ある場合: その変数 → Edit → **値は変えずに Save** → 自動再デプロイ → 再ログインで復旧
   (Vercel 側で内部状態が壊れている。値再保存で正常化する既知の挙動)
4. 復旧したか `/api/me` 等で再確認

### Step 2: コード起因と確定したらロールバック
Step 0/1 で環境変数が原因でないと確定した場合のみ:
1. Vercel のダッシュボードで、直前の正常だったデプロイに **Rollback**(即座に戻せる)。
2. 戻したら、問題のPRを特定して revert(`git revert <commit>`)。
3. 落ち着いてから原因調査。番人を通して再実装。

- ※コード(Vercel)のロールバックは簡単。DB(下記)は難しいので慎重に。
- ⚠️ **2026-06-07 教訓**: PR-1 マージ後に全 API 401 + ナビ全消失が発生。当初 PR-1 を疑い rollback したが直らず、後で JWT_SECRET の Needs Attention が真因と判明。**外形だけで犯人を決めつけず、必ずネットワークログを見てから rollback の要否を判断する。**

## 3. 本番DBを間違って書き換えた(re-aggregation等の事故)
1. **まず Neon のブランチ/スナップショットから復元できるか確認**(書き換え前にスナップショットを取っていれば、そこに戻せる)。
2. スナップショットがない場合:
   - 4月以前データが影響を受けたか確認(`scripts/check-pre-april-snapshot.ts` で行数・SUM が記録値と一致するか)。一致なら過去データは無事。
   - 5月以降データは entries から再集計(aggregateMonthlySummary)でDB値を作り直せる(entries が source of truth)。
3. **教訓: DB書き換えスクリプトは必ず dry-run デフォルト + --apply フラグ。実行前に before/after を反さんが確認。実行後は DB から読み直した実値で検証。**(c95-B re-aggregationで確立した手順)

## 4. テストが落ちた
1. 落ちたテストが「正しく退行を検知した」のか「期待値の更新漏れ」かを切り分け。
2. 数値変更で期待値を変える場合は、新期待値を number-verifier に独立検算させてから更新(実装に合わせて辻褄合わせするな)。

## 5. Claude Code / 番人がおかしな動きをする
1. 「一旦止めて。Step 1 の調査からやり直して」でリセット。
2. CLAUDE.md を読み直させる(「CLAUDE.md を再読して現状確認して」)。
3. コンテキストが長くなりすぎたら新セッションを開始し、CLAUDE.md + 該当タスクを読ませる。

## 6. 判断に迷う重大局面 → 第三者(Web Claude)を呼ぶ
下記の時は claude.ai で第三者レビューを通す(CLAUDE.md §0.5 第三者レビュー条件 参照):
- 本番DBの不可逆な書き換え(re-aggregation、過去データ更新、DELETE系)
- 複数業態の粗利定義を同時に変える変更
- 2026年4月以前データに触れる可能性がある変更
- 経営数字の定義そのもの(売上・粗利・KPIの計算式)を変える変更

## 7. ⚠️ import-monthly(Excel取込)関連の事故
- water 2026年5月以降データを /import-monthly 経由で投入すると、コンサル費控除が抜け(import-monthly が aggregation を経由しないため)粗利が7.7%過大表示される(c95-B-5未対応のため、KNOWN_ISSUES.md §8)。
- もし誤って投入してしまったら: 該当行を entries から aggregateMonthlySummary で再集計し直す(正しい控除込みの値に戻る)。
- 恒久対応(c95-B-5)が入るまでは、water 5月以降の Excel 取込を禁止。

---

## 重要リソース
- 本番: https://sikken-dashboard.vercel.app/
- repo: skenyu-hash/sikken-dashboard
- Neon project: red-lake-36460896(スナップショットはここで取る)
- Vercel: デプロイのRollbackはここ
- **entries が source of truth。最悪 entries から月次は再生成できる。**
- 4月以前データの記録値(基準): water 109行 / sum_revenue 4,738,966,144 / sum_profit 1,017,962,090(`scripts/check-pre-april-snapshot.ts` で照合)
