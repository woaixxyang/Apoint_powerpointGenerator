/**
 * 觸發瀏覽器 Blob 下載（anchor click 模式）
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Safari / 行動端：下載觸發為非同步，延遲釋放避免 URL 在瀏覽器取用前失效
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
