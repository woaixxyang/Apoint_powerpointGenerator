/**
 * Brand Identity — edition-aware 品牌元素
 * 色彩、字型、品牌橫條等識別資料皆透過 PROFILE.brand.* 取得，
 * 由 `@edition` alias 在 build time 解析到 h2u 或 public 對應 profile。
 *
 * 對外符號統一以 `BRAND_*` 命名（值由當前 edition 的 PROFILE 投影）。
 */

import { PROFILE } from '../core/edition';

const _colors = PROFILE.brand.colors();
const _typo = PROFILE.brand.typography();

/** 品牌色彩（值由當前 edition 的 PROFILE 投影） */
export const BRAND_COLORS = _colors;

/** 品牌字型（值由當前 edition 的 PROFILE 投影） */
export const BRAND_TYPOGRAPHY = _typo;

/**
 * 字體大小單位換算說明
 * SVG canvas 為 960×540 px (96 DPI)，匯出 PPT 用 pt (72 DPI)。
 * nativePptxService 的 px2pt 將 SVG font-size 乘以 0.75 → PPT pt。
 * 因此本檔案的 fontSize 數值皆為 SVG-px，PPT 顯示值 = fontSize × 0.75。
 */

/** 固定大標題位置與樣式（品牌規範） */
export const BRAND_TITLE_STYLE = PROFILE.brand.titleStyle;

/** 固定副標題規範（品牌規範） */
export const BRAND_SUBTITLE_STYLE = PROFILE.brand.subtitleStyle;

/** 品牌橫條高度（外部 consumer：nativePptxService / gemini/brandBar） */
export const BRAND_BAR_HEIGHT = PROFILE.brand.brandBar.height;

/**
 * 品牌橫條文字規範（外部 consumer：nativePptxService）
 * 保留舊欄位 shape（fontFace / fontSize / color / copyright），caller 不動。
 */
export const BRAND_BAR_TEXT = {
  fontFace: PROFILE.brand.brandBar.fontFace,
  fontSize: PROFILE.brand.brandBar.fontSize,
  color: PROFILE.brand.brandBar.textColor,
  copyright: PROFILE.brand.brandBar.copyright,
} as const;

/**
 * 動態組品牌識別 AI prompt — 模板保留原 h2u 措辭、條目順序、空白，
 * 僅將字面值換成 PROFILE 投影。h2u edition 結果應與 Phase 1 之前 byte-identical。
 */
export function buildBrandIdentityPrompt(): string {
  const c = PROFILE.brand.colors();
  const title = PROFILE.brand.titleStyle;
  const sub = PROFILE.brand.subtitleStyle;
  const productName = PROFILE.brand.productName.toUpperCase();
  const titlePt = Math.round(title.fontSize * 0.75);
  const subPt = Math.round(sub.fontSize * 0.75);

  return `
6. **${productName} BRAND COLOR PALETTE (嚴格遵守)**
   - **Accent Orange**: ${c.accentPrimary} (橘色強調色 — 用於重要數字、色塊標籤、重點標示)
   - **Accent Blue**: ${c.accentSecondary} (藍色強調色 — 用於輔助色塊、次要強調)
   - **Accent Green**: ${c.accentTertiary} (綠色強調色 — 正面數據、成長指標)
   - **Danger/Negative**: ${c.dangerRed} (紅色 — 負面數據、下降指標)
   - **Title Text**: ${c.titleText} (深灰 — 標題)
   - **Body Text**: ${c.bodyText} (深灰 — 正文內容)
   - **Secondary Text**: ${c.secondaryText} (中灰 — 說明文字、備註)
   - **Light Text**: ${c.lightText} (淺灰 — 次要備註)
   - **Background**: ${c.background} (白色)
   - **Card Background**: ${c.cardBackground} (淺灰底 — 卡片/區塊底色)
   - **Border/Divider**: ${c.borderDivider} (分隔線、卡片邊框)
   - **Brand Bar**: ${c.brandBar} (品牌橫條底色 — 僅用於底部品牌區域)
   - 重要：標題和正文主要使用灰色系 (${c.titleText}, ${c.secondaryText})，橘/藍/綠僅作為強調色點綴使用

6b. **${productName} 固定大標題規範 (MANDATORY — 每頁必須遵守)**
   - **位置**: 固定在頁面左上角, x="${title.x}", y="${title.y}" (SVG 座標)
   - **字體大小**: font-size="${title.fontSize}" (SVG 單位；匯出後即 PPT ${titlePt}pt，固定不可更改)
   - **字重**: font-weight="bold"
   - **顏色**: fill="${title.fill}" (深灰色)
   - **字體**: font-family="Montserrat, 'Noto Sans TC', sans-serif" (Montserrat 用於英文和數字, Noto Sans TC 用於中文)
   - **對齊**: 左對齊, 不居中
   - **重要**: 大標題位置和大小是品牌規範，不隨視覺風格改變。每一頁的大標題都必須出現在相同位置。

6c. **${productName} 副標題規範 (非必要，但若使用則必須遵守)**
   - **是否出現**: 副標題非每頁必須。若原始內容無明確副標題或排版空間不足，可省略。
   - **位置**: 緊接大標題下方
   - **字體大小**: font-size="${sub.fontSize}" (SVG 單位；匯出後即 PPT ${subPt}pt，固定不可更改)
   - **字重**: font-weight="${sub.fontWeight}"
   - **顏色**: fill="${sub.fill}" (橘色粗體)
   - **字體**: font-family="${sub.fontFamily}"
   - **用途**: ${sub.description}
   - **重要**: 副標題可省略，但一旦使用，其顏色、字型、大小必須遵守品牌規範，不可自行更改。
`.trim();
}

/**
 * 品牌識別 AI 指令段落
 * 模組載入時計算一次並 cache，caller（designSystem.ts）import 不變。
 */
export const BRAND_IDENTITY_PROMPT = buildBrandIdentityPrompt();

/**
 * 向量品牌橫條 SVG（供 public edition 的 composeSvgWithBrandBar 使用）。
 * 尺寸、填色、版權文字皆取自 PROFILE.brand.brandBar，
 * h2u edition 不呼叫此函式（使用 PNG 路徑）。
 */
export function buildBrandBarSvg(pageNumber?: number): string {
  const bb = PROFILE.brand.brandBar;
  const h = bb.height;
  const iconGroupY = Math.round(h * 0.2);
  const iconH = Math.round(h * 0.575);
  const logoY = Math.round(h * 0.475);
  const textY = Math.round(h * 0.675);

  const copyrightText = `<text x="875" y="${textY}" font-family="${bb.fontFace}, sans-serif" font-size="${bb.fontSize}" fill="#${bb.textColor}" text-anchor="end">${bb.copyright}</text>`;
  const pageNumText = pageNumber != null
    ? `<text x="935" y="${textY}" font-family="${bb.fontFace}, sans-serif" font-size="${bb.fontSize}" fill="#${bb.textColor}" text-anchor="middle">${pageNumber}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${h}" viewBox="0 0 960 ${h}">
  <rect x="0" y="0" width="960" height="${h}" fill="${bb.fillColor}" />
  <g transform="translate(20, ${iconGroupY})">
    <rect x="0" y="0" width="18" height="${iconH}" rx="2" fill="#FFFFFF" opacity="0.9" />
    <rect x="4" y="3" width="18" height="${iconH}" rx="2" fill="#FFFFFF" opacity="0.7" />
    <rect x="8" y="6" width="18" height="${iconH}" rx="2" fill="#FFFFFF" opacity="0.5" />
    <text x="34" y="${logoY}" font-family="${bb.fontFace}, sans-serif" font-size="13" font-weight="700" fill="#FFFFFF">${PROFILE.brand.productName}</text>
  </g>
  ${copyrightText}
  ${pageNumText}
</svg>`;
}
