/**
 * Visual Style Prompt — 給 AI 的視覺風格指示
 * 過去本檔提供 VisualStyleConfig（可調喜好系統），但 UI 已棄用且 prompt
 * 從未依 config 動態渲染，因此已移除整套 config / preset，只留純文字 prompt。
 */

/** AI 視覺風格指示（edition 中性的共用設計紀律，純文字模板） */
export function buildVisualStylePrompt(): string {
  return `
7. **VISUAL STYLE — 設計硬規則 (MANDATORY)**
   - **品牌色彩與字型**: 所有配色必須使用品牌識別中定義的色彩色板，字型必須使用品牌規範字型，不可自行替換。
   - **摘要先行**: 當頁面含有圖表或數據表格時，垂直排列順序必須為：大標題 → insight 摘要句 → 圖表/表格。禁止圖表在上、insight 在下。
   - **內容深度分析**: 深入分析原始內容的結構、邏輯脈絡與本頁 key message，據此決定最適當的佈局與呈現方式（圖表、卡片、列表、文字區塊等），並在視覺上強調與 key message 最相關的重點資訊。
   - **不可遮擋與元素間距**: 各區塊內容不可互相重疊或遮擋，所有元素之間必須有清晰的邊界和間距。所有內容必須在底部品牌橫條之上保留至少 10px 安全間距。

8. **VISUAL STYLE — 預設傾向 (可依內容調整)**
   - **視覺邏輯遞進**: 深入分析內容結構，遵循從上到下、從左到右的視覺閱讀邏輯，遞進展開原有的內容層次。
   - **內文字體下限**: 所有內文字體 font-size ≥ 16（SVG 單位，匯出後為 PPT 12pt），確保可讀性。
   - **小標題大小上限**: 區塊內的小標題 / section header 字體 font-size ≤ 27（SVG 單位，匯出後為 PPT 20pt），避免與頁面左上角的大標題混淆。
`.trim();
}
