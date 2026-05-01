// 経営データ取込で頻出する不純な数値表現を安全に number へ変換するヘルパ。
// 用途: /api/import-monthly などの取込 API で、JSON 内の数値フィールドが
// 空文字 / カンマ区切り / em dash / 通貨記号 / 全角数字 等を含むケースを吸収する。
//
// 対応する不純表現:
//   - null / undefined → def
//   - 空文字 ""        → def
//   - 数値の NaN/Infinity → def
//   - "30,500,000"     → 30500000（カンマ除去）
//   - "¥1,234" / "￥1,234" / "$100" → 1234 / 1234 / 100（通貨記号除去）
//   - "１２３"         → 123（全角数字 → 半角化）
//   - "—" / "―"       → def（em dash / horizontal bar 含む文字列は無効値として扱う、
//                              ハイフンマイナス "-1234" は数値の負号として維持）
//   - 全角スペース・通常スペース → trim
//   - "12.34"          → 12.34（小数も対応、率系フィールド用）
//   - 解釈不能 → def
//
// 既知の制約:
//   - 全角コンマ "，" / 全角ピリオド "．" は未対応（経営データで頻度低）
//
// 将来の取込系 API (/api/import-* 等) でも再利用可能。

export function num(v: unknown, def: number = 0): number {
  if (v === null || v === undefined) return def;
  if (typeof v === "number") return Number.isFinite(v) ? v : def;
  if (typeof v === "string") {
    // em dash / horizontal bar が含まれる文字列は「無効値」として早期 return。
    // 旧仕様では em dash を削除して数値部分を抽出していた（"—1000" → 1000）が、
    // 経営データでは em dash が「データなし」を意味するケースが多く、
    // サイレントに数値化することは誤解の元。厳格化して def を返す。
    if (/[—―]/.test(v)) return def;
    const cleaned = v
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[¥￥$$]/g, "") // ¥ (U+00A5), ￥ (U+FFE5), $ (U+0024), $ (U+FF04)
      .replace(/,/g, "")
      .replace(/　/g, "")          // 全角スペース
      .trim();
    if (cleaned === "") return def;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : def;
  }
  return def;
}
