// PR c94-C-3a 単体テスト: calculateDashboard の traineeCount / vehicleCount MAX 算出検証。
//
// 単独実行: npm run test:c94-c-3a (DATABASE_URL 不要、純関数テスト)
//
// 検証内容:
//   - traineeCount = MAX(entries[].trainee_count)  (スナップショット、累積でない)
//   - vehicleCount = MAX(entries[].vehicleCount)   (並列で同じ MAX 動作を確認)
//   - entries 空 → 両者 0 (ガード)
//
// 注: vehicle は camel (e.vehicleCount)、trainee は snake (e.trainee_count) で
//     DailyEntry の命名が混在する (c94-C-2 由来)。本テストで両系統の MAX を担保。

import { calculateDashboard, emptyEntry, type DailyEntry } from "../app/lib/calculations";

let passed = 0;
let failed = 0;
function check(name: string, actual: number, expected: number) {
  if (actual === expected) {
    console.log(`  ✅ ${name}: ${actual}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: got ${actual}, expected ${expected}`);
    failed++;
  }
}

// helper: emptyEntry をベースに trainee_count / vehicleCount を設定した DailyEntry を作る
function entry(date: string, trainee: number, vehicle: number): DailyEntry {
  return { ...emptyEntry(date), trainee_count: trainee, vehicleCount: vehicle };
}

console.log("🧪 PR c94-C-3a: calculateDashboard traineeCount / vehicleCount MAX 検証\n");

// case 1: trainee_count 3/7/5 → MAX 7、vehicleCount 4/9/2 → MAX 9
const entries = [
  entry("2099-12-05", 3, 4),
  entry("2099-12-10", 7, 9),
  entry("2099-12-20", 5, 2),
];
const s1 = calculateDashboard(entries, 2099, 12, new Date("2099-12-20"));
check("traineeCount = 7 (MAX of 3/7/5)", s1.traineeCount, 7);
check("vehicleCount = 9 (MAX of 4/9/2、並列確認)", s1.vehicleCount, 9);

// case 2: entries 空 → 両者 0
const s2 = calculateDashboard([], 2099, 12, new Date("2099-12-20"));
check("traineeCount = 0 (entries 空)", s2.traineeCount, 0);
check("vehicleCount = 0 (entries 空)", s2.vehicleCount, 0);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} assertions passed`);
if (failed > 0) process.exit(1);
