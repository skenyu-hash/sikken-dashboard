// 純関数テスト: lib/dateUtils.ts の TZ 安全な日付ナビ (2026-06-19)
//
// 単独実行: npm run test:integration:date-utils (DB 不要、純関数)
// JST 強制実行:  TZ=Asia/Tokyo npm run test:integration:date-utils
//
// 背景: 旧 shiftDate は new Date("...T00:00:00") (ローカル) + toISOString (UTC) の混在で
//   JST (UTC+9) では「対象日 + delta − 1 日」になっていた (▶ が動かない / ◀ が 2 日飛ぶ)。
//   本テストはプロセスを Asia/Tokyo に固定して回帰を封じる (CI のデフォルト TZ に依存しない)。

// ── TZ を JST に固定してから lib を読む (Date の挙動を JST 化) ──
process.env.TZ = "Asia/Tokyo";

import { shiftDateStr, formatLocalDate, todayLocalISO, isIsoDate } from "../app/lib/dateUtils";

let passed = 0;
let failed = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) { console.log(`  ✅ ${name} (= ${JSON.stringify(expected)})`); passed++; }
  else { console.log(`  ❌ ${name}  expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}

console.log(`🧪 dateUtils TZ 安全検証 (process.env.TZ=${process.env.TZ})\n`);

// ── 1. shiftDate: 1 日単位で正確に進む/戻る (バグの核心) ─────────
console.log("📋 1. shiftDateStr: ▶ +1 / ◀ -1 が「ちょうど 1 日」動く");
eq("▶ 2026-06-16 → 翌日", shiftDateStr("2026-06-16", +1), "2026-06-17");
eq("◀ 2026-06-16 → 前日", shiftDateStr("2026-06-16", -1), "2026-06-15");
eq("▶ 連続 2 回 = +2 日", shiftDateStr(shiftDateStr("2026-06-16", +1)!, +1), "2026-06-18");

// ── 2. 月跨ぎ・年跨ぎ・閏日 ─────────────────────────────
console.log("\n📋 2. 境界 (月跨ぎ / 年跨ぎ / 閏日)");
eq("月末 ▶ 翌月 1 日", shiftDateStr("2026-06-30", +1), "2026-07-01");
eq("月初 ◀ 前月末", shiftDateStr("2026-06-01", -1), "2026-05-31");
eq("年末 ▶ 翌年元日", shiftDateStr("2026-12-31", +1), "2027-01-01");
eq("閏年 2/28 ▶ 2/29 (2028)", shiftDateStr("2028-02-28", +1), "2028-02-29");
eq("非閏年 2/28 ▶ 3/1 (2026)", shiftDateStr("2026-02-28", +1), "2026-03-01");

// ── 3. formatLocalDate: UTC ずれを起こさない ───────────────
console.log("\n📋 3. formatLocalDate: ローカル深夜が UTC で前日に倒れない");
// JST 2026-06-16 00:00 は UTC では 2026-06-15 15:00。旧 toISOString だと "2026-06-15" になっていた。
eq("JST 深夜 0:00 → 当日", formatLocalDate(new Date(2026, 5, 16, 0, 0, 0)), "2026-06-16");
eq("JST 朝 8:59 → 当日", formatLocalDate(new Date(2026, 5, 16, 8, 59, 0)), "2026-06-16");
eq("ゼロ埋め (1 桁月日)", formatLocalDate(new Date(2026, 0, 5, 12, 0, 0)), "2026-01-05");

// ── 4. todayLocalISO: 形式 + 今日との整合 ──────────────────
console.log("\n📋 4. todayLocalISO");
const today = todayLocalISO();
eq("YYYY-MM-DD 形式", isIsoDate(today), true);
const n = new Date();
eq("ローカルの今日と一致", today, `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`);

// ── 5. ガード: 不正入力は null ────────────────────────────
console.log("\n📋 5. 不正入力ガード");
eq("空文字 → null", shiftDateStr("", +1), null);
eq("非日付 → null", shiftDateStr("2026/06/16", +1), null);
eq("不完全 → null", shiftDateStr("2026-6-1", +1), null);
eq("isIsoDate 正常判定", isIsoDate("2026-06-16"), true);
eq("isIsoDate 異常判定", isIsoDate("2026-13-99"), true); // 形式のみ判定 (値域は別責務)

console.log(`\n${failed === 0 ? "✅ 全 PASS" : "❌ FAIL あり"}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
