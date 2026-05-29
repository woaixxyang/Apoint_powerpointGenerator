/**
 * SVG / PPT 技術約束
 * Canvas 尺寸、標籤限制、屬性規則等 PPT 渲染相容性約束。
 * 不屬於品牌或風格範疇。
 */

/**
 * PPT 技術約束（Canvas、Grouping、Styling、Text、Geometry）
 */
export const SVG_ARCHITECTURE_RULES = `
### SVG ARCHITECTURE FOR POWERPOINT

1. **CANVAS**: 960x540, viewBox="0 0 960 540". Absolute coordinates. Use \`transform="translate(x,y)"\` on <g> groups.

2. **ALLOWED ELEMENTS ONLY**: \`<svg>\`, \`<g>\`, \`<rect>\`, \`<circle>\`, \`<ellipse>\`, \`<line>\`, \`<polyline>\`, \`<polygon>\`, \`<path>\`, \`<text>\`, \`<tspan>\`. NO other tags.

3. **STYLING (Attributes Only — CRITICAL)**
   - PROHIBITED tags: \`<defs>\`, \`<linearGradient>\`, \`<radialGradient>\`, \`<filter>\`, \`<clipPath>\`, \`<mask>\`, \`<pattern>\`, \`<use>\`, \`<symbol>\`, \`<image>\`, \`<foreignObject>\`, \`<style>\`, \`<animate>\`, \`<a>\`.
   - PROHIBITED attributes: \`style\`, \`class\`, \`dominant-baseline\`, \`alignment-baseline\`, \`clip-path\`, \`mask\`, \`filter\`.
   - Use inline attributes only: \`fill\`, \`stroke\`, \`stroke-width\`, \`font-size\`, \`opacity\`, \`rx\`.
   - NO gradients — flat solid colors only.

4. **TEXT**: Manually offset Y for font height (font-size 24 → center at y+12). Split multi-line text into separate <text> elements.
`.trim();

/** 品牌標題/副標題 SVG 範例（每頁必須遵守此格式） */
export const EXAMPLE_STRUCTURE = `
### MANDATORY TITLE & SUBTITLE FORMAT (every slide must follow this exactly)
注意：SVG font-size 為 SVG 單位（96 DPI），匯出 PPT 時會 ×0.75 換算為 pt。下方範例已使用正確的 SVG 數值。
\`\`\`xml
<!-- 固定大標題：SVG font-size=29（匯出後 PPT 22pt）粗體深灰，位置 (40, 35) -->
<g transform="translate(40, 35)">
  <text font-family="Montserrat, 'Noto Sans TC', sans-serif" font-size="29" font-weight="bold" fill="#333333" y="29">頁面標題文字</text>
</g>
<!-- 橘色副標題：SVG font-size=21（匯出後 PPT 16pt）粗體橘色，緊接大標題下方（非必要，但若使用必須遵守格式） -->
<g transform="translate(40, 75)">
  <text font-family="Montserrat, 'Noto Sans TC', sans-serif" font-size="21" font-weight="bold" fill="#FF6B00" y="21">副標題 / Key Insight 摘要句</text>
</g>
\`\`\`
`.trim();
