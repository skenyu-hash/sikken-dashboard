import YearView from "../components/YearView";

// 年次 (YTD) ビュー 独立ルート (/year)。
// 月次ダッシュボード (/) とは別ページ = 14 個の月固定 effect から完全分離。deep-link 可。
export default function YearPage() {
  return <YearView />;
}
