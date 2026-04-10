"use client";
import { useState, useRef } from "react";

const AREA_MAP: Record<string, string> = {
  "関西": "kansai", "関東": "kanto", "東海": "nagoya", "名古屋": "nagoya",
  "北関東": "kitakanto", "九州": "kyushu", "北海道": "hokkaido",
  "広島": "chugoku", "中国": "chugoku", "静岡": "shizuoka",
};

type ExtractedRow = {
  area_id: string; area_name: string;
  year: number; month: number;
  total_revenue: number; total_profit: number; total_count: number;
  unit_price: number; ad_cost: number; ad_rate: number;
  acquisition_count: number; cpa: number; call_count: number;
  call_unit_price: number; conv_rate: number; profit_rate: number;
  help_revenue: number; help_count: number;
};

export default function ImportPage() {
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [targetYear, setTargetYear] = useState(2025);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setImageFile(file);
    setExtracted([]); setStatus(null); setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleExtract() {
    if (!imageFile || !image) return;
    setExtracting(true); setError(null); setExtracted([]);
    try {
      const base64 = image.split(",")[1];
      const mediaType = imageFile.type;

      const response = await fetch("/api/extract-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType, targetYear }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      const rows: ExtractedRow[] = (data.rows ?? []).map((r: ExtractedRow) => ({
        ...r,
        area_id: AREA_MAP[r.area_name] ?? r.area_name,
      }));
      setExtracted(rows);
    } catch (e) {
      setError(`抽出エラー: ${String(e)}`);
    }
    setExtracting(false);
  }

  async function handleImport() {
    if (extracted.length === 0) return;
    setImporting(true); setStatus(null);
    try {
      const res = await fetch("/api/import-monthly", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: extracted }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus(`${json.imported}件のデータをインポートしました`);
        setExtracted([]); setImage(null);
      } else {
        setError(`インポートエラー: ${json.error}`);
      }
    } catch (e) {
      setError(`エラー: ${String(e)}`);
    }
    setImporting(false);
  }

  const yenFmt = (v: number) => v > 0 ? `\u00a5${v.toLocaleString()}` : "\u2014";

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)", padding: "16px 24px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>写真から月次データをインポート</h1>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
          スプレッドシートの写真をアップロードするとAIが自動でデータを読み取ります
        </p>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1000 }}>

        {/* ステップ */}
        <div style={{ display: "flex", marginBottom: 20, borderRadius: 8, overflow: "hidden" }}>
          {["① 年度・写真を選択", "② AIがデータ抽出", "③ 確認してインポート"].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: 10, fontSize: 12, fontWeight: 700,
              background: i === 0 ? "#059669" : i === 1 && image ? "#059669" : i === 2 && extracted.length > 0 ? "#059669" : "#d1fae5",
              color: i === 0 ? "#fff" : i === 1 && image ? "#fff" : i === 2 && extracted.length > 0 ? "#fff" : "#065f46" }}>
              {s}
            </div>
          ))}
        </div>

        {/* 年度選択 */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            対象年度を選択
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <select value={targetYear} onChange={(e) => setTargetYear(Number(e.target.value))}
              style={{ border: "1px solid #d1fae5", borderRadius: 6, padding: "7px 14px",
                fontSize: 13, fontWeight: 700, color: "#111" }}>
              {[2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              ※ 表に11月〜始まっていても、全て選択した年のデータとして処理します
            </span>
          </div>
        </div>

        {/* アップロード */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            スプレッドシートの写真をアップロード
          </div>
          {!image ? (
            <div onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{ border: "2px dashed #d1fae5", borderRadius: 10, padding: 40,
                textAlign: "center", cursor: "pointer", background: "#f8fdf8" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 4 }}>
                クリックまたはドラッグで写真を選択
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>PNG・JPG対応</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          ) : (
            <div>
              <img src={image} alt="uploaded" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #d1fae5", marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setImage(null); setExtracted([]); }}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d1fae5",
                    background: "#f8fdf8", color: "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  写真を変更
                </button>
                <button onClick={handleExtract} disabled={extracting}
                  style={{ padding: "8px 24px", borderRadius: 8, border: "none",
                    background: extracting ? "#9ca3af" : "#059669", color: "#fff",
                    fontSize: 12, fontWeight: 700, cursor: extracting ? "default" : "pointer" }}>
                  {extracting ? "🤖 AIがデータを読み取り中..." : "🤖 AIでデータを抽出する"}
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 8, marginBottom: 16,
            background: "#fee2e2", color: "#991b1b", fontSize: 13, fontWeight: 700 }}>{error}</div>
        )}
        {status && (
          <div style={{ padding: "12px 16px", borderRadius: 8, marginBottom: 16,
            background: "#d1fae5", color: "#065f46", fontSize: 13, fontWeight: 700 }}>{status}</div>
        )}

        {/* 抽出結果 */}
        {extracted.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
            <div style={{ background: "#ecfdf5", padding: "10px 16px", borderBottom: "1px solid #d1fae5",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46" }}>
                抽出されたデータ（{extracted.length}件）— 内容を確認してインポートしてください
              </span>
              <button onClick={handleImport} disabled={importing}
                style={{ padding: "7px 20px", borderRadius: 8, border: "none",
                  background: importing ? "#9ca3af" : "#059669", color: "#fff",
                  fontSize: 12, fontWeight: 700, cursor: importing ? "default" : "pointer" }}>
                {importing ? "インポート中..." : "インポート実行"}
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#f8fdf8" }}>
                    {["エリア", "年", "月", "売上", "粗利", "件数", "客単価", "広告費", "広告率%", "獲得件数", "入電件数", "成約率%", "粗利率%"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#6b7280",
                        borderBottom: "1px solid #f0faf0", whiteSpace: "nowrap",
                        textAlign: ["エリア", "年", "月"].includes(h) ? "left" : "right" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {extracted.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5faf5" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{row.area_name}</td>
                      <td style={{ padding: "6px 8px" }}>{row.year}</td>
                      <td style={{ padding: "6px 8px" }}>{row.month}月</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{yenFmt(row.total_revenue)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{yenFmt(row.total_profit)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.total_count}件</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{yenFmt(row.unit_price)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{yenFmt(row.ad_cost)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.ad_rate}%</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.acquisition_count}件</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.call_count}件</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.conv_rate}%</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.profit_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
