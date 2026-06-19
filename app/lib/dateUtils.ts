// TZ 安全な日付ユーティリティ (2026-06-19)
//
// 背景 (根本原因):
//   従来コードは日付送り・「今日」算出で `new Date("YYYY-MM-DDT00:00:00")` でパースし
//   `toISOString().slice(0, 10)` で文字列化していた。前者は「ローカル時刻」、後者は「UTC」基準のため、
//   JST (UTC+9) では基準がずれ、結果が実質「対象日 + delta − 1 日」になる。
//   症状: 単日ナビの ▶ が動かない (同日のまま) / ◀ が 2 日飛ぶ / 朝 9 時前は「今日」が前日。
//
// 対策:
//   パースも文字列化も「ローカル基準」で統一し、UTC 変換 (toISOString) を一切挟まない。
//   YYYY-MM-DD は「壁掛けカレンダーの日付」であってタイムスタンプではない、という不変条件を保つ。

/** "YYYY-MM-DD" 形式かどうか (日付ナビ・ピッカー入力のガード用)。 */
export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Date をローカルタイムゾーン基準の "YYYY-MM-DD" に整形 (toISOString の UTC ずれを回避)。 */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 今日のローカル日付を "YYYY-MM-DD" で返す。日付入力の初期値用。 */
export function todayLocalISO(): string {
  return formatLocalDate(new Date());
}

/**
 * "YYYY-MM-DD" に日数を加減算し "YYYY-MM-DD" を返す。
 * パース → 加算 → 文字列化をすべてローカル基準で行うため TZ ずれが起きない。
 * 不正な入力は null を返す (呼び出し側で握りつぶし)。月跨ぎ・年跨ぎは Date 側が正規化する。
 */
export function shiftDateStr(current: string, deltaDays: number): string | null {
  if (!isIsoDate(current)) return null;
  const [y, m, day] = current.split("-").map(Number);
  const d = new Date(y, m - 1, day); // ローカル基準で構築 (UTC 変換を挟まない)
  d.setDate(d.getDate() + deltaDays);
  return formatLocalDate(d);
}
