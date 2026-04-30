// Blob を a タグ経由でダウンロードトリガーするヘルパー。
// 後始末（要素除去 + URL.revokeObjectURL）を setTimeout(1000) で遅延させる。
// 即時 revoke するとブラウザの blob 取得とレースして一部のダウンロードが
// 静かに失敗するケースがあるため（Phase 9.2 コミット 6c で対策）。

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
