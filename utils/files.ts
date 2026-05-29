/**
 * 將 `<input type="file">` 的 FileList 安全轉成 File[]。
 * 直接 `Array.from(input.files || [])` 在某些 TS 推導路徑會 widen 成 `unknown[]`，
 * 這個 helper 強制 return 型別為 `File[]`，避免每個 caller 重複處理。
 */
export function fileListToArray(files: FileList | null | undefined): File[] {
  if (!files) return [];
  return Array.from(files);
}
