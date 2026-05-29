/**
 * PPT 匯出專用 SVG 前處理。
 *
 * 與 svgSanitize.ts 的差異：
 * - svgSanitize：處理 AI 剛吐出的「髒」SVG（去違禁標籤、提取 inline style、flatten transform）。
 *   由生成函式（slideGen / slideEdit）呼叫。
 * - pptPrepare：處理已 sanitize、已存檔的 SVG，僅做 PPT 匯出所需的額外整理
 *   （Arc→Bezier、tspan 相對座標絕對化）。由 nativePptxService 呼叫。
 */

import { convertArcsInPath } from "./svgSanitize";

/**
 * SVG length 解析，含單位處理。
 * - "1.2" / "1.2px" → 1.2
 * - "1.2em" / "1.2ex" → 1.2 × 提供的 font-size（px）
 * - "1.2pt" → 1.6（1pt = 4/3 user unit）
 * - "50%" → 0.5 × font-size（dy/dx 的 % 以 em 為基準）
 * - 其他單位或解析失敗 → NaN（呼叫端決定 fallback）
 *
 * 原本用 parseFloat 直接吃，"1.2em" 會回 1.2 並被當 px → tspan 位置塌到頂端，
 * 視覺上像「文字消失」。這個函式把單位處理集中起來。
 */
const parseSvgLen = (raw: string | null | undefined, fontSizePx: number): number => {
  if (raw == null) return NaN;
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)(em|ex|px|pt|%)?$/i);
  if (!m) return NaN;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return NaN;
  const unit = (m[2] || '').toLowerCase();
  switch (unit) {
    case 'em':
    case 'ex': return num * fontSizePx;
    case 'pt': return num * (4 / 3);
    case '%':  return (num / 100) * fontSizePx;
    case '':
    case 'px': return num;
    default:   return NaN;
  }
};

/** 沿 parent chain 找最近的 font-size（皆以 px / unitless 為主，預設 16） */
const inheritedFontSizePx = (el: Element): number => {
  let cur: Element | null = el;
  while (cur) {
    const fs = cur.getAttribute('font-size');
    if (fs) {
      const m = fs.trim().match(/^(-?\d+(?:\.\d+)?)(em|ex|px|pt|%)?$/i);
      if (m) {
        const num = parseFloat(m[1]);
        const unit = (m[2] || '').toLowerCase();
        // 對 font-size 自身的 em/% 不再向上遞迴解析（避免無窮回圈），unitless / px 直接用，
        // 其他單位用 4/3 (pt) 或預設值
        if (unit === '' || unit === 'px') return num;
        if (unit === 'pt') return num * (4 / 3);
        // em/ex/% 對 font-size 自身使用相對解析在這裡保守處理為 num*16
        return num * 16;
      }
    }
    cur = cur.parentElement;
  }
  return 16;
};

/**
 * 將 <tspan> 的相對座標 (dy/dx) 解析為絕對座標 (y/x)
 */
const resolveTspanPositions = (root: Element) => {
  const textEls = Array.from(root.querySelectorAll('text'));

  for (const textEl of textEls) {
    const tspans = Array.from(textEl.querySelectorAll('tspan'));
    if (tspans.length === 0) continue;

    const textFontSize = inheritedFontSizePx(textEl);
    const baseX = parseSvgLen(textEl.getAttribute('x'), textFontSize);
    const baseY = parseSvgLen(textEl.getAttribute('y'), textFontSize);
    let currentX = isFinite(baseX) ? baseX : 0;
    let currentY = isFinite(baseY) ? baseY : 0;

    for (const ts of tspans) {
      // tspan 的 dy/dx 在 SVG 規範裡 em 以「自己的 font-size」為基準
      const tsFontSize = inheritedFontSizePx(ts);

      // X 座標解析
      if (ts.hasAttribute('x')) {
        const parsed = parseSvgLen(ts.getAttribute('x'), tsFontSize);
        if (isFinite(parsed)) currentX = parsed;
        // 解析失敗時保留 currentX（不動），避免把座標推到 NaN
      } else if (ts.hasAttribute('dx')) {
        const parsed = parseSvgLen(ts.getAttribute('dx'), tsFontSize);
        if (isFinite(parsed)) currentX += parsed;
        ts.removeAttribute('dx');
      }

      // Y 座標解析
      if (ts.hasAttribute('y')) {
        const parsed = parseSvgLen(ts.getAttribute('y'), tsFontSize);
        if (isFinite(parsed)) currentY = parsed;
      } else if (ts.hasAttribute('dy')) {
        const parsed = parseSvgLen(ts.getAttribute('dy'), tsFontSize);
        if (isFinite(parsed)) currentY += parsed;
        ts.removeAttribute('dy');
      }

      ts.setAttribute('x', String(currentX));
      ts.setAttribute('y', String(currentY));
    }
  }
};

/**
 * PPT 導出專用 SVG 前處理
 * 包含 Arc → Cubic Bezier 與 tspan 絕對座標化（保留 tspan 結構供 renderText 判斷）。
 * 不影響瀏覽器預覽管線（sanitizeSvg 不會呼叫此函式）
 */
export const prepareSvgForPpt = (svg: string): string => {
  if (!svg) return svg;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return svg; // parse 失敗，原樣返回

    const svgEl = doc.documentElement;

    // Step 1: Arc → Cubic Bezier（PPT 對 A 指令支援差，C 指令相容性佳）
    doc.querySelectorAll('path').forEach(pathEl => {
      const d = pathEl.getAttribute('d');
      if (d) pathEl.setAttribute('d', convertArcsInPath(d));
    });

    // Step 2: dy/dx → 絕對 y/x（多行 tspan 解析；保留 tspan 結構供 renderText 判斷）
    resolveTspanPositions(svgEl);

    return new XMLSerializer().serializeToString(doc);
  } catch (e) {
    console.error('[prepareSvgForPpt] Error:', e);
    return svg; // 出錯時原樣返回，不影響導出
  }
};
