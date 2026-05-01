// 単独実行: npm run test:utils
// num() ヘルパのリグレッション防止用テーブル駆動テスト。
// テスト基盤（vitest/jest）が未導入のため tsx で直接実行する形式。

import { num } from "../app/lib/utils/numberCoerce";

type Case = { input: unknown; expected: number; note?: string };

const cases: Case[] = [
  // ===== null / undefined / 空文字 =====
  { input: null, expected: 0, note: "null" },
  { input: undefined, expected: 0, note: "undefined" },
  { input: "", expected: 0, note: "empty string" },
  { input: "   ", expected: 0, note: "spaces only" },
  { input: "　", expected: 0, note: "fullwidth space only" },

  // ===== number 型 =====
  { input: 0, expected: 0 },
  { input: 42, expected: 42 },
  { input: -1234, expected: -1234, note: "negative number" },
  { input: 1.5, expected: 1.5, note: "float" },
  { input: NaN, expected: 0, note: "NaN" },
  { input: Infinity, expected: 0, note: "Infinity" },
  { input: -Infinity, expected: 0, note: "-Infinity" },

  // ===== 標準数値文字列 =====
  { input: "0", expected: 0 },
  { input: "123", expected: 123 },
  { input: "-100", expected: -100, note: "純粋な負数（負数許容を確認）" },
  { input: "1234.56", expected: 1234.56, note: "小数" },
  { input: "9999999999", expected: 9999999999, note: "巨大数" },

  // ===== カンマ区切り =====
  { input: "1,234", expected: 1234 },
  { input: "30,500,000", expected: 30500000 },

  // ===== 通貨記号（コミット A） =====
  { input: "¥1,234", expected: 1234, note: "¥ 記号 (U+00A5)" },
  { input: "￥30,500,000", expected: 30500000, note: "全角 ￥ (U+FFE5)" },
  { input: "$100", expected: 100, note: "$ 記号" },

  // ===== 全角数字（コミット A） =====
  { input: "１２３", expected: 123, note: "全角数字" },

  // ===== em dash（コミット B 厳格化） =====
  { input: "—", expected: 0, note: "em dash 単独" },
  { input: "―", expected: 0, note: "horizontal bar 単独" },
  { input: "—1000", expected: 0, note: "em dash 接頭（旧 1000 → 新 0）" },
  { input: "1—000", expected: 0, note: "em dash 中間（旧 1000 → 新 0）" },

  // ===== 既知の制約 =====
  { input: "１，２３４", expected: 0, note: "全角コンマ未対応（既知制約）" },

  // ===== 解釈不能 =====
  { input: "abc", expected: 0 },
  { input: "100abc", expected: 0, note: "数値 + 文字列混在" },
  { input: true, expected: 0, note: "boolean" },
  { input: {}, expected: 0, note: "object" },
  { input: [], expected: 0, note: "array" },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const c of cases) {
  const actual = num(c.input);
  const ok = actual === c.expected || (Number.isNaN(actual) && Number.isNaN(c.expected));
  if (ok) {
    passed++;
  } else {
    failed++;
    const noteStr = c.note ? `  [${c.note}]` : "";
    const msg = `❌ num(${JSON.stringify(c.input)}) = ${actual}, expected ${c.expected}${noteStr}`;
    failures.push(msg);
    console.error(msg);
  }
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`\n${failed} failures:\n${failures.join("\n")}`);
}
process.exit(failed > 0 ? 1 : 0);
