import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType, targetYear } = await req.json();

    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `この画像はSIKKEN GROUPの月次営業データの表です。
対象年度は${targetYear}年です。表内に年度の記載がない場合は全て${targetYear}年として扱ってください。
表は11月〜始まっていても全て同じ${targetYear}年のデータです。年度をまたぐ処理は不要です。

以下の形式でJSONのみ返してください。他のテキストは一切不要です。

{
  "rows": [
    {
      "area_name": "エリア名（関西/関東/東海/名古屋/北関東/九州/北海道/広島/中国のいずれか）",
      "year": ${targetYear},
      "month": 月（数値）,
      "total_revenue": 売上（円・数値のみ）,
      "total_profit": 営業利益または粗利（円・数値のみ）,
      "total_count": 対応件数（数値のみ）,
      "unit_price": 客単価（円・数値のみ）,
      "ad_cost": 広告費（円・数値のみ）,
      "ad_rate": 広告比率（数値のみ 例:29.8）,
      "acquisition_count": 獲得件数（数値のみ）,
      "cpa": 獲得単価（円・数値のみ）,
      "call_count": 入電件数（数値のみ）,
      "call_unit_price": 入電単価（円・数値のみ）,
      "conv_rate": 成約率（数値のみ 例:59）,
      "profit_rate": 営業利益率または粗利率（数値のみ 例:20）,
      "help_revenue": HELP売上（円・数値のみ、なければ0）,
      "help_count": HELP件数（数値のみ、なければ0）
    }
  ]
}

注意：
- ¥マークやカンマは除去して数値のみ
- #DIV/0! や空白は 0 として扱う
- 表の全月分（11月〜10月など全列）を抽出する
- 合計列は除外する`,
          },
        ],
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("データの抽出に失敗しました");
    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ success: true, rows: parsed.rows ?? [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
